// ============================================================
//  Edge Function "chat" — Proxy multi-fournisseurs (routage avec bascule)
//  Reçoit { messages, system, max_tokens } et relaie vers un fournisseur
//  d'IA gratuit. TOUS les fournisseurs utilisés exposent une API
//  OpenAI-compatible, donc la réponse conserve le format
//  { choices: [{ message: { content } }] } : le code client/admin
//  n'a RIEN à changer côté parseur.
//
//  ── Pourquoi un routage multi-fournisseurs ? ──────────────────
//  Le palier « sans frais » de Google Gemini est, pour ce compte/région,
//  bridé à seulement ~20 requêtes/JOUR (RPD) — inutilisable pour un chatbot
//  public. On empile donc plusieurs fournisseurs gratuits, dont les quotas
//  sont INDÉPENDANTS, et on bascule automatiquement sur le suivant dès que
//  l'un échoue (429/quota épuisé, ou toute autre erreur). Le visiteur ne
//  voit rien : il obtient une réponse tant qu'AU MOINS un fournisseur répond.
//
//  Ordre de priorité (le 1er disponible qui réussit gagne) :
//    1) Cerebras  — ~1 000 000 tokens/JOUR gratuits (encaisse les contextes
//                   longs « tout l'historique »).            model: llama-3.3-70b
//    2) Groq      — 30 req/min, 1 000 req/JOUR, très rapide. model: llama-3.3-70b-versatile
//    3) Gemini    — dernier recours (les ~20 req/jour résiduelles).
//
//  Capacité gratuite totale par jour ≈ (Cerebras) + (Groq) + (Gemini),
//  car chaque quota est séparé.
//
//  Clés attendues (Supabase secrets ; un fournisseur sans clé est ignoré) :
//    CEREBRAS_API_KEY   (csk-...)   → https://cloud.cerebras.ai
//    GROQ_API_KEY       (gsk-...)   → https://console.groq.com
//    GEMINI_API_KEY     (AIza...)   → https://aistudio.google.com/app/apikey
//
//  ⚠️ Les noms de modèles ci-dessous sont des constantes en tête de fichier :
//     si un fournisseur renomme un modèle, il suffit de changer la constante.
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

// ── Configuration des fournisseurs (ordre = priorité) ────────
// Chaque fournisseur est OpenAI-compatible : même URL de chat completions,
// même format de réponse. Seuls le modèle, la clé et quelques détails de
// payload changent (cf. `buildPayload`).
interface Provider {
  name: string;
  url: string;
  model: string;
  apiKey: string | undefined;
  // Construit le corps de requête propre au fournisseur.
  buildPayload: (
    messages: unknown[],
    maxTokens: number,
  ) => Record<string, unknown>;
}

const TEMPERATURE = 0.5;

function buildProviders(): Provider[] {
  return [
    // 1) Cerebras — le plus généreux en TOKENS/jour. ⚠️ utilise
    //    `max_completion_tokens` (et non `max_tokens`).
    {
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      model: "llama-3.3-70b",
      apiKey: Deno.env.get("CEREBRAS_API_KEY"),
      buildPayload: (messages, maxTokens) => ({
        model: "llama-3.3-70b",
        messages,
        temperature: TEMPERATURE,
        max_completion_tokens: maxTokens,
      }),
    },
    // 2) Groq — rapide, 1 000 req/jour.
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-versatile",
      apiKey: Deno.env.get("GROQ_API_KEY"),
      buildPayload: (messages, maxTokens) => ({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: TEMPERATURE,
        max_tokens: maxTokens,
      }),
    },
    // 3) Gemini — dernier recours (~20 req/jour). Les modèles 2.5+ font du
    //    « thinking » interne qui grignote le budget max_tokens AVANT la
    //    réponse visible → on le désactive (reasoning_effort: "none").
    {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-2.5-flash-lite",
      apiKey: Deno.env.get("GEMINI_API_KEY"),
      buildPayload: (messages, maxTokens) => ({
        model: "gemini-2.5-flash-lite",
        messages,
        temperature: TEMPERATURE,
        max_tokens: maxTokens,
        reasoning_effort: "none",
      }),
    },
  ];
}

// Extrait un message d'erreur lisible d'une réponse fournisseur (JSON ou texte).
function readError(data: unknown, rawText: string, status: number): string {
  const d = data as { error?: { message?: string } | string } | null;
  if (d && typeof d.error === "object" && d.error?.message) return d.error.message;
  if (d && typeof d.error === "string") return d.error;
  return rawText || `statut ${status} sans détail`;
}

Deno.serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages = [], system, max_tokens } = await req.json();

    // Le prompt système est passé en 1er message role:"system" (supporté par
    // les endpoints OpenAI-compatible de tous nos fournisseurs).
    const finalMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const maxTokens =
      Number.isFinite(max_tokens) && max_tokens > 0 ? max_tokens : 4096;

    // On ne garde que les fournisseurs dont la clé est configurée.
    const providers = buildProviders().filter((p) => !!p.apiKey);
    if (providers.length === 0) {
      throw new Error(
        "Aucune clé d'IA configurée (CEREBRAS_API_KEY / GROQ_API_KEY / GEMINI_API_KEY).",
      );
    }

    const baseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/json",
    };

    // On essaie chaque fournisseur dans l'ordre. Le 1er qui répond OK gagne ;
    // sur échec (429 quota, 4xx, 5xx, réseau…) on bascule sur le suivant.
    let lastStatus = 502;
    let lastError = "Aucun fournisseur n'a répondu.";
    let lastRetryAfter: string | null = null;

    for (const p of providers) {
      try {
        const resp = await fetch(p.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${p.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(p.buildPayload(finalMessages, maxTokens)),
        });

        // Lecture en TEXTE d'abord : un fournisseur peut renvoyer une erreur
        // non-JSON (HTML, corps vide…) sur certains 4xx/5xx.
        const rawText = await resp.text();
        let data: unknown = null;
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = null;
        }

        if (resp.ok) {
          // Succès : on propage la réponse telle quelle (format OpenAI).
          const headers = { ...baseHeaders };
          headers["X-AI-Provider"] = p.name; // utile pour diagnostiquer côté réseau
          return new Response(rawText, { status: resp.status, headers });
        }

        // Échec : on mémorise et on tente le fournisseur suivant.
        lastStatus = resp.status;
        lastError = readError(data, rawText, resp.status);
        lastRetryAfter = resp.headers.get("retry-after");
        console.error(
          `[${p.name}] ${resp.status} ${resp.statusText} — ${lastError}`,
        );
      } catch (err) {
        // Erreur réseau / exception : on tente le suivant.
        lastStatus = 502;
        lastError = (err as Error).message;
        console.error(`[${p.name}] exception — ${lastError}`);
      }
    }

    // Tous les fournisseurs ont échoué. On renvoie la dernière erreur connue
    // (souvent un 429 quota), avec Retry-After si fourni — le client a sa
    // propre logique de nouvelle tentative + message d'attente.
    const headers = { ...baseHeaders };
    if (lastRetryAfter) headers["Retry-After"] = lastRetryAfter;
    return new Response(
      JSON.stringify({ error: lastError, status: lastStatus }),
      { status: lastStatus, headers },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

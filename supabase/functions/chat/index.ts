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
//    1) Cerebras  — 1 000 000 tokens/JOUR gratuits, mais contexte total
//                   (prompt + réponse) plafonné à 8 192 tokens depuis la
//                   réduction du palier gratuit (06/2026).  model: gpt-oss-120b
//    2) Groq      — 30 req/min, 1 000 req/JOUR, très rapide. model: openai/gpt-oss-120b
//    3) Gemini    — dernier recours (les ~20 req/jour résiduelles).
//
//  ⚠️ llama-3.3-70b (Cerebras) et llama-3.3-70b-versatile (Groq) ont été
//  DÉPRÉCIÉS par leurs fournisseurs respectifs (27/05/2026 et 17/06/2026) —
//  tout appel échouait, ce qui faisait retomber CHAQUE requête sur Gemini
//  seul (d'où le blocage perçu malgré le routage). Remplacés par gpt-oss-120b.
//
//  Capacité gratuite totale par jour ≈ (Cerebras) + (Groq) + (Gemini),
//  car chaque quota est séparé.
//
//  Clés attendues (Supabase secrets ; un fournisseur sans clé est ignoré) :
//    CEREBRAS_API_KEY   (csk-...)   → https://cloud.cerebras.ai
//    GROQ_API_KEY       (gsk-...)   → https://console.groq.com
//    GEMINI_API_KEY     (AIza...)   → https://aistudio.google.com/app/apikey
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

// ── Configuration des fournisseurs (ordre = priorité) ────────
// Chaque fournisseur est OpenAI-compatible : même URL de chat completions,
// même format de réponse. Seuls le modèle, la clé et quelques détails de
// payload changent (cf. `buildPayload`).
interface Provider {
  name: string;
  url: string;
  apiKey: string | undefined;
  // Construit le corps de requête propre au fournisseur.
  buildPayload: (
    messages: unknown[],
    maxTokens: number,
    responseFormat: unknown,
  ) => Record<string, unknown>;
}

const TEMPERATURE = 0.5;

// Ajoute response_format au payload seulement si l'appelant en fournit un.
// Le chatbot devis demande { type: "json_object" } (réponse en JSON strict,
// bien plus fiable qu'un bloc JSON écrit à la main en fin de prose par un
// modèle faible) ; l'admin ne l'envoie pas → réponses en texte libre.
function withFormat(
  payload: Record<string, unknown>,
  responseFormat: unknown,
): Record<string, unknown> {
  if (responseFormat) payload.response_format = responseFormat;
  return payload;
}

function buildProviders(): Provider[] {
  return [
    // 1) Cerebras — généreux en TOKENS/jour, mais contexte total (prompt +
    //    réponse) plafonné à 8 192 tokens. ⚠️ utilise `max_completion_tokens`
    //    (et non `max_tokens`). Si la réponse demandée est trop grande
    //    (ex. analyse admin à 8192), Cerebras échoue ou tronque — dans les
    //    deux cas on bascule sur le fournisseur suivant (cf. plus bas).
    //    gpt-oss-120b fait du raisonnement interne (format "Harmony") qui peut
    //    fuiter dans la réponse visible si on le laisse à son défaut ("medium") ;
    //    reasoning_effort: "low" réduit ce risque ET économise du budget de
    //    contexte (précieux vu le plafond de 8192 tokens).
    {
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      apiKey: Deno.env.get("CEREBRAS_API_KEY"),
      buildPayload: (messages, maxTokens, responseFormat) => withFormat({
        model: "gpt-oss-120b",
        messages,
        temperature: TEMPERATURE,
        max_completion_tokens: Math.min(maxTokens, 4096),
        reasoning_effort: "low",
      }, responseFormat),
    },
    // 2) Groq — rapide, 1 000 req/jour. Même mitigation de fuite de raisonnement
    //    que Cerebras (même famille de modèle gpt-oss-120b).
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: Deno.env.get("GROQ_API_KEY"),
      buildPayload: (messages, maxTokens, responseFormat) => withFormat({
        model: "openai/gpt-oss-120b",
        messages,
        temperature: TEMPERATURE,
        max_tokens: maxTokens,
        reasoning_effort: "low",
      }, responseFormat),
    },
    // 3) Gemini — dernier recours (~20 req/jour). Les modèles 2.5+ font du
    //    « thinking » interne qui grignote le budget max_tokens AVANT la
    //    réponse visible → on le désactive (reasoning_effort: "none").
    {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: Deno.env.get("GEMINI_API_KEY"),
      buildPayload: (messages, maxTokens, responseFormat) => withFormat({
        model: "gemini-2.5-flash-lite",
        messages,
        temperature: TEMPERATURE,
        max_tokens: maxTokens,
        reasoning_effort: "none",
      }, responseFormat),
    },
  ];
}

// Extrait un message d'erreur lisible d'une réponse fournisseur. Les
// fournisseurs OpenAI-compatible renvoient { error: {message} | string },
// mais Gemini peut renvoyer son format NATIF (un tableau) sur certaines
// erreurs (ex. 503 surcharge) même via l'endpoint OpenAI-compatible :
// [{ error: { code, message, status } }].
function readError(data: unknown, rawText: string, status: number): string {
  const first = Array.isArray(data) ? data[0] : data;
  const d = first as { error?: { message?: string } | string } | null;
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
    const { messages = [], system, max_tokens, response_format } = await req.json();

    // Le prompt système est passé en 1er message role:"system" (supporté par
    // les endpoints OpenAI-compatible de tous nos fournisseurs).
    const finalMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const maxTokens =
      Number.isFinite(max_tokens) && max_tokens > 0 ? max_tokens : 1024;

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

    // On essaie chaque fournisseur dans l'ordre. Le 1er qui répond OK avec
    // une réponse COMPLÈTE (finish_reason ≠ "length") gagne ; sur échec
    // (429 quota, 4xx, 5xx, réseau, ou réponse tronquée) on bascule sur le
    // suivant. Si tous tronquent, on renvoie quand même la meilleure
    // réponse tronquée obtenue plutôt que rien.
    let lastStatus = 502;
    let lastError = "Aucun fournisseur n'a répondu.";
    let lastRetryAfter: string | null = null;
    let truncatedFallback: { rawText: string; status: number; provider: string } | null = null;

    // Un fournisseur peut ne pas supporter response_format (400 "unsupported
    // field"/schéma invalide) sans que ce soit documenté de façon fiable pour
    // gpt-oss-120b (Cerebras/Groq) — plutôt que de deviner, on RETENTE UNE FOIS
    // le même fournisseur sans response_format sur un 400 avant d'abandonner
    // ce fournisseur. Sur 401/403/429/5xx (auth/quota/serveur), retenter sans
    // le paramètre ne changerait rien : on bascule direct sur le suivant.
    providerLoop: for (const p of providers) {
      let useFormat = response_format;
      let formatRetried = false;

      retry: for (;;) {
        try {
          const resp = await fetch(p.url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${p.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              p.buildPayload(finalMessages, maxTokens, useFormat),
            ),
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
            const choice = (data as { choices?: { finish_reason?: string }[] })
              ?.choices?.[0];
            if (choice?.finish_reason === "length") {
              // Réponse coupée (contexte/quota de sortie trop court pour ce
              // fournisseur) : on garde comme filet de secours et on essaie
              // le fournisseur suivant, qui a peut-être plus de marge.
              console.error(`[${p.name}] réponse tronquée (finish_reason=length)`);
              if (!truncatedFallback) {
                truncatedFallback = { rawText, status: resp.status, provider: p.name };
              }
              continue providerLoop;
            }
            // Succès complet : on propage la réponse telle quelle (format OpenAI).
            const headers = { ...baseHeaders };
            headers["X-AI-Provider"] = p.name; // utile pour diagnostiquer côté réseau
            return new Response(rawText, { status: resp.status, headers });
          }

          lastStatus = resp.status;
          lastError = readError(data, rawText, resp.status);
          lastRetryAfter = resp.headers.get("retry-after");
          console.error(
            `[${p.name}] ${resp.status} ${resp.statusText} — ${lastError}`,
          );

          // 400 + response_format demandé + pas encore retenté sur CE fournisseur
          // → on retire le paramètre et on retente une fois avant d'abandonner.
          if (resp.status === 400 && useFormat && !formatRetried) {
            console.error(`[${p.name}] retente sans response_format (400)`);
            useFormat = undefined;
            formatRetried = true;
            continue retry;
          }
          continue providerLoop;
        } catch (err) {
          // Erreur réseau / exception : on tente le fournisseur suivant.
          lastStatus = 502;
          lastError = (err as Error).message;
          console.error(`[${p.name}] exception — ${lastError}`);
          continue providerLoop;
        }
      }
    }

    // Aucun fournisseur n'a donné de réponse complète. Si au moins un a
    // renvoyé une réponse tronquée, c'est préférable à une erreur sèche.
    if (truncatedFallback) {
      const headers = { ...baseHeaders };
      headers["X-AI-Provider"] = truncatedFallback.provider;
      return new Response(truncatedFallback.rawText, {
        status: truncatedFallback.status,
        headers,
      });
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

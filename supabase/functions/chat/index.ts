// ============================================================
//  Edge Function "chat" — Proxy Google Gemini 2.0 Flash
//  Reçoit { messages, system } et relaie vers l'endpoint
//  OpenAI-compatible de Gemini. La réponse conserve le format
//  OpenAI ({ choices: [{ message: { content } }] }), si bien que
//  le code client/admin n'a pas besoin de changer de parseur.
//
//  Choix du modèle : gemini-2.0-flash (et NON 2.5-flash) car son palier
//  gratuit est BEAUCOUP plus généreux — décisif pour ne pas bloquer :
//    • 2.0-flash : 15 req/min, 1500 req/JOUR, 1 000 000 tokens/min
//    • 2.5-flash :  10 req/min,  ~250 req/JOUR,  250 000 tokens/min
//  (Google a réduit les quotas gratuits de 50-80% en déc. 2025.)
//  La contrainte qui reste est le NOMBRE de requêtes : géré côté client
//  (temporisation proactive + retry sur 429 avec Retry-After relayé).
//  Bonus : 2.0-flash n'a pas de "thinking", donc aucune réponse tronquée.
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-2.0-flash";

Deno.serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY non configurée (supabase secrets set GEMINI_API_KEY=...)",
      );
    }

    const { messages = [], system, model, max_tokens } = await req.json();

    // Le prompt système est passé en 1er message role:"system" (supporté par
    // l'endpoint OpenAI-compatible de Gemini).
    const finalMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const chosenModel = model || DEFAULT_MODEL;

    const payload: Record<string, unknown> = {
      model: chosenModel,
      messages: finalMessages,
      temperature: 0.5,
      // Quota de 1M tokens/min : on peut laisser des réponses confortables
      // sans craindre la limite de débit (qui se compte en requêtes).
      // Par défaut généreux (un rapport d'analyse structuré peut être long) ;
      // un appelant peut demander plus via { max_tokens } dans le corps.
      max_tokens: Number.isFinite(max_tokens) && max_tokens > 0 ? max_tokens : 4096,
    };

    // Les modèles 2.5+ font du "thinking" interne par défaut, qui consomme une
    // partie du budget max_tokens AVANT la réponse visible (risque de troncature).
    // On le désactive UNIQUEMENT pour ces modèles ; inutile sur 2.0-flash (pas de
    // thinking) où envoyer ce paramètre pourrait être refusé.
    if (chosenModel.includes("2.5") || chosenModel.includes("thinking")) {
      payload.reasoning_effort = "none";
    }

    const resp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // On lit d'abord en TEXTE : Gemini peut renvoyer une erreur non-JSON (HTML,
    // corps vide…) sur certains 4xx/5xx, ce qui ferait planter resp.json().
    const rawText = await resp.text();
    let data: unknown;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = null;
    }

    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/json",
    };
    const retryAfter = resp.headers.get("retry-after");
    if (retryAfter) headers["Retry-After"] = retryAfter;

    if (resp.ok) {
      // Succès : on propage la réponse Gemini telle quelle (format OpenAI).
      return new Response(rawText, { status: resp.status, headers });
    }

    // Erreur : on log côté serveur (visible via `supabase functions logs chat`)
    // et on renvoie TOUJOURS un message lisible + le détail brut au client, pour
    // diagnostiquer (ex. 429 = quota Gemini : message exact « ...exhausted... »).
    console.error(
      `Gemini ${resp.status} ${resp.statusText} — retry-after=${retryAfter ?? "—"} — body=${rawText}`,
    );
    const d = data as { error?: { message?: string } | string } | null;
    const geminiMsg =
      d && typeof d.error === "object" && d.error?.message
        ? d.error.message
        : d && typeof d.error === "string"
        ? d.error
        : rawText || `Gemini a renvoyé le statut ${resp.status} sans détail.`;

    return new Response(
      JSON.stringify({ error: geminiMsg, status: resp.status, raw: data }),
      { status: resp.status, headers },
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

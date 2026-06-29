// ============================================================
//  Edge Function "chat" — Proxy Google Gemini 2.0 Flash
//  Reçoit { messages, system } et relaie vers l'endpoint
//  OpenAI-compatible de Gemini. La réponse conserve le format
//  OpenAI ({ choices: [{ message: { content } }] }), si bien que
//  le code client/admin n'a pas besoin de changer de parseur.
//
//  Limites du palier gratuit Gemini 2.0 Flash :
//    • 1 000 000 tokens / minute  → l'optimisation des tokens
//      n'est plus un enjeu : on envoie tout le contexte utile.
//    • 15 requêtes / minute        → c'est LA contrainte à gérer.
//      En cas de dépassement, Gemini renvoie 429 ; on relaie le
//      statut et l'en-tête Retry-After pour que le client puisse
//      patienter puis réessayer proprement.
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

    const { messages = [], system, model } = await req.json();

    // Le prompt système est passé en 1er message role:"system" (supporté par
    // l'endpoint OpenAI-compatible de Gemini).
    const finalMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const resp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: finalMessages,
        temperature: 0.5,
        // Quota de 1M tokens/min : on peut laisser des réponses confortables
        // sans craindre la limite de débit (qui se compte en requêtes).
        max_tokens: 2048,
      }),
    });

    const data = await resp.json();

    // On propage le statut tel quel (notamment 429) ainsi que Retry-After
    // quand Gemini l'indique, pour piloter l'attente côté client.
    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/json",
    };
    const retryAfter = resp.headers.get("retry-after");
    if (retryAfter) headers["Retry-After"] = retryAfter;

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers,
    });
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

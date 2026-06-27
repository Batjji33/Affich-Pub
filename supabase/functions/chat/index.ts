// ============================================================
//  Edge Function "chat" — Proxy Groq (gratuit)
//  Reçoit { messages, system, model } et relaie vers Groq.
//  Fallback automatique sur llama-3.1-8b-instant si rate-limit.
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

Deno.serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY non configurée (supabase secrets set GROQ_API_KEY=...)");
    }

    const { messages = [], system, model } = await req.json();

    const finalMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const callGroq = (mdl: string) =>
      fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: mdl,
          messages: finalMessages,
          temperature: 0.5,
          // Réponses courtes (questions / JSON final) → on limite les tokens pour
          // consommer moins et atteindre la limite de débit (rate limit) moins vite.
          max_tokens: 768,
        }),
      });

    // 1re tentative avec le modèle demandé (ou le modèle par défaut)
    let resp = await callGroq(model || DEFAULT_MODEL);

    // Rate limit (429) → on bascule sur le modèle léger
    if (resp.status === 429) {
      resp = await callGroq(FALLBACK_MODEL);
    }

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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

// ============================================================
//  Edge Function "gen-ad" — Proxy Hugging Face (gratuit)
//  Reçoit { prompt }, appelle FLUX.1-schnell, renvoie l'image
//  encodée en base64 : { image, mimeType }.
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const HF_URL =
  "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";

// Encode un ArrayBuffer en base64 par paquets (évite le dépassement de pile)
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const HF_TOKEN = Deno.env.get("HF_TOKEN");
    if (!HF_TOKEN) {
      throw new Error("HF_TOKEN non configuré (supabase secrets set HF_TOKEN=...)");
    }

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Le champ 'prompt' est manquant.");
    }

    const hfResp = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    // Modèle en cours de chargement côté Hugging Face
    if (hfResp.status === 503) {
      return new Response(
        JSON.stringify({
          error:
            "Le modèle de génération d'image est en cours de chargement. Réessayez dans 30 à 60 secondes.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!hfResp.ok) {
      const detail = await hfResp.text();
      return new Response(
        JSON.stringify({
          error: `Service de génération indisponible (code ${hfResp.status}).`,
          detail,
        }),
        {
          status: hfResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const buffer = await hfResp.arrayBuffer();
    const image = toBase64(buffer);
    const mimeType = hfResp.headers.get("content-type") || "image/jpeg";

    return new Response(JSON.stringify({ image, mimeType }), {
      status: 200,
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

// ============================================================
//  Edge Function "gen-ad" — Proxy Pollinations.ai (gratuit, sans clé)
//  Reçoit { prompt }, génère une image et la renvoie en base64 :
//  { image, mimeType }.
//
//  Note : aucun modèle de génération d'image gratuit ne sait rendre du
//  texte lisible de façon fiable. Le prompt ne doit donc décrire que le
//  visuel (couleurs, scène, style, composition) — le texte/slogan est
//  superposé ensuite côté client (Canvas), de façon toujours parfaitement
//  lisible. Voir js/admin_devis.js (renderGeneratedImage).
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

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
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Le champ 'prompt' est manquant.");
    }

    const seed = Math.floor(Math.random() * 1_000_000);
    const url =
      `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}` +
      `?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;

    const resp = await fetch(url);

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Service de génération indisponible (code ${resp.status}).`,
          detail,
        }),
        {
          status: resp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const buffer = await resp.arrayBuffer();
    const image = toBase64(buffer);
    const mimeType = resp.headers.get("content-type") || "image/jpeg";

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

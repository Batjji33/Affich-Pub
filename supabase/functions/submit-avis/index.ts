// ============================================================
//  Edge Function "submit-avis" — Dépôt d'un avis vérifié
//
//  Tout le parcours d'écriture passe par ici, avec la clé
//  SERVICE ROLE (qui contourne la RLS). Le navigateur ne peut
//  donc jamais lire la table codes_avis ni insérer un avis
//  directement : impossible d'énumérer/deviner un code valide.
//
//  Étapes :
//    1. Valider les entrées (code 4 chiffres, titre, note 1-5).
//    2. Vérifier que le code existe ET n'est pas déjà utilisé.
//    3. Insérer l'avis (visible + "vérifié" car lié à un code).
//    4. Marquer le code comme utilisé (anti-doublon).
//
//  Réponses :
//    200 { ok: true }
//    400 { error } — entrées invalides
//    404 { error } — code inconnu
//    409 { error } — code déjà utilisé
// ============================================================
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Petit wrapper REST (PostgREST) authentifié en service role.
function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Service indisponible (configuration serveur)." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const titre = String(body.titre ?? "").trim();
    const description = String(body.description ?? "").trim();
    const note = Number(body.note);

    // 1) Validation des entrées
    if (!/^[0-9]{4}$/.test(code)) {
      return json({ error: "Le code doit comporter exactement 4 chiffres." }, 400);
    }
    if (!titre) {
      return json({ error: "Le titre est obligatoire." }, 400);
    }
    if (!description) {
      return json({ error: "La description est obligatoire." }, 400);
    }
    if (!Number.isInteger(note) || note < 1 || note > 5) {
      return json({ error: "La note doit être comprise entre 1 et 5 étoiles." }, 400);
    }

    // 2) Le code existe-t-il ? Est-il déjà utilisé ?
    const lookup = await rest(
      `codes_avis?code=eq.${encodeURIComponent(code)}&select=id,utilise`,
    );
    if (!lookup.ok) {
      const txt = await lookup.text();
      console.error("Lookup code échoué:", lookup.status, txt);
      return json({ error: "Erreur lors de la vérification du code." }, 500);
    }
    const rows = await lookup.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: "Ce code est invalide. Vérifiez le code reçu avec votre devis." }, 404);
    }
    const found = rows[0];
    if (found.utilise) {
      return json({ error: "Ce code a déjà été utilisé pour déposer un avis." }, 409);
    }

    // 3) Insertion de l'avis (visible + vérifié)
    const insert = await rest("avis", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        code_id: found.id,
        titre,
        resume: description,
        note,
        visible: true,
      }),
    });
    if (!insert.ok) {
      const txt = await insert.text();
      console.error("Insertion avis échouée:", insert.status, txt);
      return json({ error: "Impossible d'enregistrer l'avis. Réessayez." }, 500);
    }

    // 4) Marquage du code comme utilisé (anti-doublon).
    //    On cible aussi utilise=false pour éviter qu'un double appel
    //    quasi-simultané n'enregistre deux avis avec le même code.
    const mark = await rest(
      `codes_avis?id=eq.${found.id}&utilise=is.false`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ utilise: true }),
      },
    );
    if (!mark.ok) {
      const txt = await mark.text();
      console.error("Marquage code échoué:", mark.status, txt);
      // L'avis est déjà enregistré ; on ne bloque pas le client.
    }

    return json({ ok: true });
  } catch (err) {
    console.error("submit-avis erreur:", err);
    return json({ error: (err as Error).message || "Erreur inattendue." }, 500);
  }
});

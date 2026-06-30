// ============================================================
//  Edge Function "submit-avis" — Dépôt d'un avis vérifié
//
//  Tout le parcours d'écriture passe par ici, avec la clé
//  SERVICE ROLE (qui contourne la RLS). Le navigateur ne peut
//  donc jamais lire la table codes_avis ni insérer un avis
//  directement : impossible d'énumérer/deviner un code valide.
//
//  Étapes (dépôt complet, body.check absent ou false) :
//    1. Valider les entrées (code 4 chiffres, titre, note 1-5).
//    2. Vérifier que le code existe.
//    3. RÉCLAMER le code de façon atomique (PATCH conditionné sur
//       utilise=false) AVANT d'insérer l'avis : ainsi, si deux
//       requêtes arrivent en même temps pour le même code, une
//       seule peut gagner la réclamation — l'autre échoue avec 409,
//       garantissant qu'un code ne sert jamais à plus d'un avis.
//    4. Insérer l'avis. En cas d'échec, on annule la réclamation
//       (remet utilise=false) pour ne pas perdre le code.
//
//  Mode vérification (body = { code, check: true }) :
//    Le front l'utilise dès la saisie du code (étape 1 du formulaire),
//    AVANT de demander titre/description/note, pour afficher une erreur
//    immédiate si le code est invalide ou déjà utilisé. On se contente
//    d'un lookup en lecture seule : le code n'est PAS réclamé ici (la
//    réclamation définitive a lieu uniquement à la publication réelle,
//    à l'étape 3 ci-dessus) — ça laisse une toute petite fenêtre où un
//    code "validé" en étape 1 pourrait être pris entre-temps, mais ce
//    cas est déjà géré : la publication finale revérifie tout et
//    renvoie 409 si besoin (voir js/avis.js).
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
    const checkOnly = body.check === true;
    const titre = String(body.titre ?? "").trim();
    const description = String(body.description ?? "").trim();
    const note = Number(body.note);

    // 1) Validation des entrées
    if (!/^[0-9]{4}$/.test(code)) {
      return json({ error: "Le code doit comporter exactement 4 chiffres." }, 400);
    }
    if (!checkOnly) {
      if (!titre) {
        return json({ error: "Le titre est obligatoire." }, 400);
      }
      if (!description) {
        return json({ error: "La description est obligatoire." }, 400);
      }
      if (!Number.isInteger(note) || note < 1 || note > 5) {
        return json({ error: "La note doit être comprise entre 1 et 5 étoiles." }, 400);
      }
    }

    // 2) Le code existe-t-il ?
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

    // Mode vérification : lookup en lecture seule, on s'arrête ici sans
    // réclamer ni écrire quoi que ce soit.
    if (checkOnly) {
      if (found.utilise) {
        return json({ error: "Ce code a déjà été utilisé pour déposer un avis." }, 409);
      }
      return json({ ok: true });
    }

    // 3) Réclamation atomique du code : la condition "utilise=is.false"
    //    fait que ce PATCH ne peut réussir qu'une seule fois, même si
    //    deux requêtes arrivent simultanément pour le même code.
    const claim = await rest(
      `codes_avis?id=eq.${found.id}&utilise=is.false`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ utilise: true }),
      },
    );
    if (!claim.ok) {
      const txt = await claim.text();
      console.error("Réclamation du code échouée:", claim.status, txt);
      return json({ error: "Erreur lors de la vérification du code." }, 500);
    }
    const claimedRows = await claim.json();
    if (!Array.isArray(claimedRows) || claimedRows.length === 0) {
      // Le code était déjà marqué utilisé (par cette requête ou une autre
      // arrivée en même temps) : on refuse, le code reste à un seul usage.
      return json({ error: "Ce code a déjà été utilisé pour déposer un avis." }, 409);
    }

    // 4) Insertion de l'avis (visible + vérifié)
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
      // On annule la réclamation pour ne pas perdre le code définitivement.
      await rest(`codes_avis?id=eq.${found.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ utilise: false }),
      });
      return json({ error: "Impossible d'enregistrer l'avis. Réessayez." }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("submit-avis erreur:", err);
    return json({ error: (err as Error).message || "Erreur inattendue." }, 500);
  }
});

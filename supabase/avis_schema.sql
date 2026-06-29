-- ============================================================
--  AFFICH'PUB — Système d'avis vérifiés
--  Tables "codes_avis" + "avis"
--  À exécuter dans Supabase → SQL Editor
-- ============================================================

-- ------------------------------------------------------------
--  Table des codes à 4 chiffres distribués aux clients.
--  Un code = un avis. Une fois "utilisé", il ne peut plus servir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS codes_avis (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4}$'),
  nom_client  TEXT,
  utilise     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS codes_avis_code_idx ON codes_avis (code);

-- ------------------------------------------------------------
--  Table des avis. Chaque avis est lié à un code (FK) : la
--  présence d'un code_id garantit qu'il s'agit d'un "Avis vérifié".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avis (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code_id     UUID NOT NULL REFERENCES codes_avis (id) ON DELETE CASCADE,
  titre       TEXT NOT NULL,
  resume      TEXT NOT NULL,                      -- la description / le corps de l'avis
  note        SMALLINT NOT NULL CHECK (note BETWEEN 1 AND 5),
  visible     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS avis_created_at_idx ON avis (created_at DESC);
CREATE INDEX IF NOT EXISTS avis_visible_idx    ON avis (visible);

-- ============================================================
--  Row Level Security
--
--  codes_avis :
--    - AUCUN accès public (anon). Les codes ne doivent jamais être
--      énumérables depuis le navigateur (sinon on pourrait deviner
--      un code valide). La vérification + le marquage "utilisé" se
--      font côté serveur via l'Edge Function (service role, qui
--      contourne la RLS).
--    - Admin connecté (Supabase Auth) : accès complet (génération
--      et consultation des codes).
--
--  avis :
--    - Public (anon) : LECTURE des avis visibles uniquement.
--    - Écriture : via l'Edge Function "submit-avis" (service role).
--    - Admin connecté : accès complet (masquer, modifier, supprimer).
-- ============================================================

-- ---------- codes_avis ----------
ALTER TABLE codes_avis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "codes_avis_admin_all" ON codes_avis;
CREATE POLICY "codes_avis_admin_all" ON codes_avis
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ---------- avis ----------
ALTER TABLE avis ENABLE ROW LEVEL SECURITY;

-- Lecture publique : uniquement les avis visibles.
DROP POLICY IF EXISTS "avis_select_public" ON avis;
CREATE POLICY "avis_select_public" ON avis
  FOR SELECT
  USING (visible = TRUE);

-- Admin connecté : accès complet (y compris avis masqués).
DROP POLICY IF EXISTS "avis_admin_all" ON avis;
CREATE POLICY "avis_admin_all" ON avis
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- NB : le service role (Edge Function "submit-avis") contourne
-- automatiquement la RLS : aucune policy d'INSERT anon n'est donc
-- nécessaire, et c'est volontaire (écriture contrôlée côté serveur).

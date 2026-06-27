-- ============================================================
--  AFFICH'PUB — Table "devis" (Chatbot Devis IA)
--  À exécuter dans Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS devis (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  nom              TEXT NOT NULL,
  prenom           TEXT NOT NULL,
  age              INTEGER,
  telephone        TEXT,
  format_diffusion TEXT CHECK (format_diffusion IN ('manuel', 'informatique')),
  objet_pub        TEXT,
  description_pub  TEXT,
  budget           NUMERIC,
  regularite       TEXT CHECK (regularite IN ('quotidienne', 'bihebdomadaire')),
  emplacement      TEXT CHECK (emplacement IN ('decouverte', 'standard', 'premium')),
  date_debut       DATE,
  date_fin         DATE,
  prix_estime      NUMERIC,
  conversation     JSONB,
  statut           TEXT DEFAULT 'nouveau'
                     CHECK (statut IN ('nouveau', 'contacte', 'converti', 'archive'))
);

CREATE INDEX IF NOT EXISTS devis_created_at_idx ON devis (created_at DESC);
CREATE INDEX IF NOT EXISTS devis_statut_idx     ON devis (statut);

-- ------------------------------------------------------------
--  Row Level Security
--  - Visiteurs anonymes : INSERTION seulement (le chatbot public
--    enregistre les devis, mais ne peut JAMAIS les relire).
--  - Admins connectés (Supabase Auth) : accès complet.
-- ------------------------------------------------------------
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devis_insert_anon" ON devis;
CREATE POLICY "devis_insert_anon" ON devis
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "devis_admin_all" ON devis;
CREATE POLICY "devis_admin_all" ON devis
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

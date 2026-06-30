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
  emplacement      TEXT CHECK (emplacement IN ('decouverte', 'standard', 'premium')), -- emplacement "principal" (résumé)
  quantite         INTEGER DEFAULT 1, -- nombre de publicités (visuel identique)
  emplacements     JSONB,             -- emplacement de chaque publicité : ["standard","premium",...]
  date_debut       DATE,
  date_fin         DATE,
  prix_estime      NUMERIC,
  conversation     JSONB,
  statut           TEXT DEFAULT 'nouveau'
                     CHECK (statut IN ('nouveau', 'contacte', 'converti', 'archive')),
  analyse_ia       TEXT,                       -- compte rendu IA mis en cache (ne se régénère pas à chaque ouverture)
  analyse_ia_at    TIMESTAMP WITH TIME ZONE,    -- date de la dernière génération de l'analyse
  pub_concept      JSONB,                       -- concept publicitaire IA mis en cache (adPrompt, texte, conversation affichée)
  pub_concept_at   TIMESTAMP WITH TIME ZONE      -- date de la dernière génération du concept pub
);

CREATE INDEX IF NOT EXISTS devis_created_at_idx ON devis (created_at DESC);
CREATE INDEX IF NOT EXISTS devis_statut_idx     ON devis (statut);

-- ------------------------------------------------------------
--  Migration : si la table existe déjà (ancienne version),
--  ajoute les colonnes "quantité", "emplacements" et les caches IA
--  (analyse + concept pub).
-- ------------------------------------------------------------
ALTER TABLE devis ADD COLUMN IF NOT EXISTS quantite       INTEGER DEFAULT 1;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS emplacements   JSONB;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS analyse_ia     TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS analyse_ia_at  TIMESTAMP WITH TIME ZONE;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS pub_concept    JSONB;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS pub_concept_at TIMESTAMP WITH TIME ZONE;

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

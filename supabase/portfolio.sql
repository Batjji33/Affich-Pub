-- ============================================================
--  AFFICH'PUB — Table "portfolio" (Réalisations)
--  À exécuter dans Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS portfolio (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titre       TEXT NOT NULL,
  description TEXT,
  photo_url   TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolio_created_at_idx ON portfolio (created_at DESC);

-- ------------------------------------------------------------
--  Row Level Security
--  - Tout le monde (anon) : LECTURE seule (affichage public).
--  - Admins connectés (Supabase Auth) : accès complet
--    (ajout / modification / suppression).
-- ------------------------------------------------------------
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_select_public" ON portfolio;
CREATE POLICY "portfolio_select_public" ON portfolio
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "portfolio_admin_all" ON portfolio;
CREATE POLICY "portfolio_admin_all" ON portfolio
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
--  Supabase Storage — bucket "portfolio" (photos des réalisations)
-- ============================================================

-- Crée le bucket public (idempotent).
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ------------------------------------------------------------
--  Policies du Storage pour le bucket "portfolio"
--  - Lecture publique des fichiers.
--  - Upload / modification / suppression : admins connectés.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "portfolio_storage_read" ON storage.objects;
CREATE POLICY "portfolio_storage_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'portfolio');

DROP POLICY IF EXISTS "portfolio_storage_insert" ON storage.objects;
CREATE POLICY "portfolio_storage_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'portfolio' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "portfolio_storage_update" ON storage.objects;
CREATE POLICY "portfolio_storage_update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'portfolio' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "portfolio_storage_delete" ON storage.objects;
CREATE POLICY "portfolio_storage_delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'portfolio' AND auth.role() = 'authenticated');

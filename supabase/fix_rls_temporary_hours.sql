-- ============================================================
--  Correction des droits RLS pour la table "temporary_hours"
--  À exécuter dans Supabase → SQL Editor
-- ============================================================

-- 1. Activer la sécurité au niveau des lignes (Row Level Security)
ALTER TABLE temporary_hours ENABLE ROW LEVEL SECURITY;

-- 2. Permettre à tout le monde (visiteurs) de LIRE les horaires modifiés
DROP POLICY IF EXISTS "temporary_hours_select_anon" ON temporary_hours;
CREATE POLICY "temporary_hours_select_anon" ON temporary_hours
  FOR SELECT
  USING (true);

-- 3. Permettre aux administrateurs (utilisateurs connectés) d'avoir tous les droits (INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "temporary_hours_admin_all" ON temporary_hours;
CREATE POLICY "temporary_hours_admin_all" ON temporary_hours
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

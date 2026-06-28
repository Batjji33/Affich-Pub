-- ============================================================
--  Correction des droits RLS pour la table "reservations"
--  À exécuter dans Supabase → SQL Editor
-- ============================================================

-- 1. Activer la sécurité au niveau des lignes (Row Level Security)
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 2. Permettre à tout le monde d'insérer (nécessaire pour la réservation client ET le blocage admin)
DROP POLICY IF EXISTS "reservations_insert_anon" ON reservations;
CREATE POLICY "reservations_insert_anon" ON reservations
  FOR INSERT
  WITH CHECK (true);

-- 3. Permettre la lecture
DROP POLICY IF EXISTS "reservations_select_anon" ON reservations;
CREATE POLICY "reservations_select_anon" ON reservations
  FOR SELECT
  USING (true);

-- 4. Permettre la suppression (nécessaire pour l'annulation et le déblocage admin)
DROP POLICY IF EXISTS "reservations_delete_anon" ON reservations;
CREATE POLICY "reservations_delete_anon" ON reservations
  FOR DELETE
  USING (true);

-- 5. Permettre la modification (au cas où)
DROP POLICY IF EXISTS "reservations_update_anon" ON reservations;
CREATE POLICY "reservations_update_anon" ON reservations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

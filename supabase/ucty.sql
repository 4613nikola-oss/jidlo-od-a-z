-- ════════════════════════════════════════════════════════════════
--  Účty v appce Jídlo od A–Z (Supabase, region EU)
--  Spuštění: Supabase → SQL Editor → New query → vložit celý soubor → Run
--  Bezpečné spustit znovu (nic nesmaže).
-- ════════════════════════════════════════════════════════════════

-- Jeden řádek = data jednoho uživatele (profil, oblíbené, razítka, nákup, lednička…) jako JSON
CREATE TABLE IF NOT EXISTS public.uzivatelska_data (
  user_id   uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  data      jsonb NOT NULL DEFAULT '{}',
  upraveno  timestamptz NOT NULL DEFAULT now()
);

-- Zabezpečení na úrovni řádků: každý vidí a mění JEN svůj řádek.
-- (Proto může být veřejný klíč v kódu appky – bez přihlášení se k datům nikdo nedostane.)
ALTER TABLE public.uzivatelska_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vlastni data - cteni" ON public.uzivatelska_data;
DROP POLICY IF EXISTS "vlastni data - vlozeni" ON public.uzivatelska_data;
DROP POLICY IF EXISTS "vlastni data - uprava" ON public.uzivatelska_data;
DROP POLICY IF EXISTS "vlastni data - smazani" ON public.uzivatelska_data;

CREATE POLICY "vlastni data - cteni"   ON public.uzivatelska_data FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "vlastni data - vlozeni" ON public.uzivatelska_data FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "vlastni data - uprava"  ON public.uzivatelska_data FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "vlastni data - smazani" ON public.uzivatelska_data FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Nepřihlášení (anon) k tabulce nemají přístup vůbec
REVOKE ALL ON public.uzivatelska_data FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uzivatelska_data TO authenticated;

-- „Smazat účet“: přihlášený uživatel smaže sám sebe (a díky ON DELETE CASCADE i svoje data).
-- Funkce běží s vyššími právy, ale vždy smaže jen účet toho, kdo ji volá.
CREATE OR REPLACE FUNCTION public.smazat_ucet()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nejsi přihlášen/a';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.smazat_ucet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smazat_ucet() TO authenticated;

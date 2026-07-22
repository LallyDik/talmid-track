
-- Remove SECURITY DEFINER functions from the exposed public schema.

-- 1) Drop unused claim_yeshiva.
DROP FUNCTION IF EXISTS public.claim_yeshiva(uuid);

-- 2) Move create_yeshiva out of public schema. It will be invoked from a
--    TanStack server function using the service role. Not exposed via PostgREST.
DROP FUNCTION IF EXISTS public.create_yeshiva(text, text);

-- 3) Lock down trigger function; triggers execute regardless of EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- 4) Lock down update_updated_at_column trigger helper as well.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;

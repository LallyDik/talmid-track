
-- 1) Storage policies: scope by yeshiva folder (first path segment = yeshiva_id)
DROP POLICY IF EXISTS "authenticated read attendance reports" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload attendance reports" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update attendance reports" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete attendance reports" ON storage.objects;

CREATE POLICY "yeshiva members read attendance reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-reports'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
    )
  );

CREATE POLICY "yeshiva members upload attendance reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

CREATE POLICY "yeshiva members update attendance reports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  )
  WITH CHECK (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

CREATE POLICY "yeshiva members delete attendance reports"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attendance-reports'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
    )
  );

-- 2) Replace open yeshiva insert policy with a controlled definer function
DROP POLICY IF EXISTS "Users create their yeshiva when none" ON public.yeshivas;

CREATE OR REPLACE FUNCTION public.create_yeshiva(_name text, _address text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  current_yeshiva uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT yeshiva_id INTO current_yeshiva FROM public.profiles WHERE id = auth.uid();
  IF current_yeshiva IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to a yeshiva';
  END IF;

  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'Yeshiva name required';
  END IF;

  INSERT INTO public.yeshivas (name, address)
  VALUES (btrim(_name), _address)
  RETURNING id INTO new_id;

  UPDATE public.profiles SET yeshiva_id = new_id WHERE id = auth.uid();

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_yeshiva(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_yeshiva(text, text) TO authenticated;

-- 3) Lock down internal SECURITY DEFINER functions from direct signed-in execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

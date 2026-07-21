
-- Scope student-documents bucket by yeshiva folder
DROP POLICY IF EXISTS "authenticated read student documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload student documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update student documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete student documents" ON storage.objects;

CREATE POLICY "student documents read own yeshiva" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'student-documents' AND (
    (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
    OR public.is_admin()
  ));

CREATE POLICY "student documents insert own yeshiva" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-documents' AND (
    (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
    OR public.is_admin()
  ));

CREATE POLICY "student documents update own yeshiva" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'student-documents' AND (
    (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
    OR public.is_admin()
  ));

CREATE POLICY "student documents delete own yeshiva" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents' AND (
    (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
    OR public.is_admin()
  ));

-- Convert is_admin_of to SECURITY INVOKER (user_roles has RLS allowing self-read)
CREATE OR REPLACE FUNCTION public.is_admin_of(_yeshiva_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin' AND yeshiva_id = _yeshiva_id
  )
$$;

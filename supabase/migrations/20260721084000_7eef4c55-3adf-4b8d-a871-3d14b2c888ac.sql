DROP POLICY IF EXISTS "authenticated read student documents" ON storage.objects;
CREATE POLICY "authenticated read student documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'student-documents');
DROP POLICY IF EXISTS "authenticated upload student documents" ON storage.objects;
CREATE POLICY "authenticated upload student documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-documents');
DROP POLICY IF EXISTS "authenticated update student documents" ON storage.objects;
CREATE POLICY "authenticated update student documents" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'student-documents');
DROP POLICY IF EXISTS "authenticated delete student documents" ON storage.objects;
CREATE POLICY "authenticated delete student documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'student-documents');

CREATE OR REPLACE FUNCTION public.is_admin_of(_yeshiva_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin' AND yeshiva_id = _yeshiva_id)
$$;
REVOKE ALL ON FUNCTION public.is_admin_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_of(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.yeshiva_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'staff',
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_yeshiva ON public.yeshiva_invites(yeshiva_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.yeshiva_invites(lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yeshiva_invites TO authenticated;
GRANT ALL ON public.yeshiva_invites TO service_role;
ALTER TABLE public.yeshiva_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage invites" ON public.yeshiva_invites;
CREATE POLICY "admins manage invites" ON public.yeshiva_invites FOR ALL TO authenticated USING (public.is_admin_of(yeshiva_id)) WITH CHECK (public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "invitee reads own invite" ON public.yeshiva_invites;
CREATE POLICY "invitee reads own invite" ON public.yeshiva_invites FOR SELECT TO authenticated USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

CREATE OR REPLACE FUNCTION public.claim_yeshiva(_yeshiva_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND yeshiva_id IS NOT NULL) THEN RAISE EXCEPTION 'user already belongs to a yeshiva'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE yeshiva_id = _yeshiva_id AND role = 'admin') THEN RAISE EXCEPTION 'yeshiva already has an admin'; END IF;
  UPDATE public.profiles SET yeshiva_id = _yeshiva_id WHERE id = auth.uid();
  INSERT INTO public.user_roles (user_id, role, yeshiva_id) VALUES (auth.uid(), 'admin', _yeshiva_id) ON CONFLICT (user_id, role, yeshiva_id) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.claim_yeshiva(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_yeshiva(uuid) TO authenticated;
-- ============================================================================
-- TENANT SECURITY, STORAGE BUCKETS, INVITES
-- Fixes: (1) missing storage buckets, (2) cross-tenant admin data leak,
--        (3) staff cannot join a yeshiva (invites + onboarding claim).
-- ============================================================================

-- ============ FIX 1: STORAGE BUCKETS ============
-- Migration 20260720141055 created policies on storage.objects for the
-- 'attendance-reports' bucket but nothing ever created the bucket itself.
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-reports', 'attendance-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Second private bucket for student documents.
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Four authenticated policies for 'student-documents', mirroring the
-- attendance-reports pattern. DROP IF EXISTS first so the migration is re-runnable.
DROP POLICY IF EXISTS "authenticated read student documents" ON storage.objects;
CREATE POLICY "authenticated read student documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-documents');
DROP POLICY IF EXISTS "authenticated upload student documents" ON storage.objects;
CREATE POLICY "authenticated upload student documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-documents');
DROP POLICY IF EXISTS "authenticated update student documents" ON storage.objects;
CREATE POLICY "authenticated update student documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'student-documents');
DROP POLICY IF EXISTS "authenticated delete student documents" ON storage.objects;
CREATE POLICY "authenticated delete student documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents');

-- ============ FIX 2: TENANT-AWARE ADMIN CHECK ============
-- is_admin() is NOT scoped to a yeshiva, so any admin could read every
-- yeshiva's data. is_admin_of() restricts the admin bypass to the admin's
-- own yeshiva.
CREATE OR REPLACE FUNCTION public.is_admin_of(_yeshiva_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND yeshiva_id = _yeshiva_id
  )
$$;
REVOKE ALL ON FUNCTION public.is_admin_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_of(uuid) TO authenticated;

-- ---- yeshivas ----
DROP POLICY IF EXISTS "Users can view their yeshiva" ON public.yeshivas;
CREATE POLICY "Users can view their yeshiva" ON public.yeshivas FOR SELECT
  TO authenticated USING (id = public.get_my_yeshiva_id() OR public.is_admin_of(id));
DROP POLICY IF EXISTS "Admins manage yeshivas" ON public.yeshivas;
CREATE POLICY "Admins manage yeshivas" ON public.yeshivas FOR ALL
  TO authenticated USING (public.is_admin_of(id)) WITH CHECK (public.is_admin_of(id));

-- ---- profiles ----
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT
  TO authenticated USING (id = auth.uid() OR (yeshiva_id IS NOT NULL AND public.is_admin_of(yeshiva_id)));
DROP POLICY IF EXISTS "Admins insert profiles" ON public.profiles;
CREATE POLICY "Admins insert profiles" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid() OR (yeshiva_id IS NOT NULL AND public.is_admin_of(yeshiva_id)));

-- ---- user_roles ----
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR (yeshiva_id IS NOT NULL AND public.is_admin_of(yeshiva_id)));

-- ---- classes ----
DROP POLICY IF EXISTS "yeshiva members read classes" ON public.classes;
CREATE POLICY "yeshiva members read classes" ON public.classes FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- students ----
DROP POLICY IF EXISTS "yeshiva members read students" ON public.students;
CREATE POLICY "yeshiva members read students" ON public.students FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- study_sessions ----
DROP POLICY IF EXISTS "yeshiva members read sessions" ON public.study_sessions;
CREATE POLICY "yeshiva members read sessions" ON public.study_sessions FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- attendance_reports ----
DROP POLICY IF EXISTS "yeshiva members read reports" ON public.attendance_reports;
CREATE POLICY "yeshiva members read reports" ON public.attendance_reports FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- attendance_records ----
DROP POLICY IF EXISTS "yeshiva members read records" ON public.attendance_records;
CREATE POLICY "yeshiva members read records" ON public.attendance_records FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- student_events ----
DROP POLICY IF EXISTS "yeshiva members read events" ON public.student_events;
CREATE POLICY "yeshiva members read events" ON public.student_events FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- student_treatments ----
DROP POLICY IF EXISTS "yeshiva members read treatments" ON public.student_treatments;
CREATE POLICY "yeshiva members read treatments" ON public.student_treatments FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ---- treatment_updates ----
DROP POLICY IF EXISTS "yeshiva members read treatment updates" ON public.treatment_updates;
CREATE POLICY "yeshiva members read treatment updates" ON public.treatment_updates FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.student_treatments t
    WHERE t.id = treatment_id
      AND (t.yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(t.yeshiva_id))
  ));

-- ---- tasks ----
DROP POLICY IF EXISTS "yeshiva members read tasks" ON public.tasks;
CREATE POLICY "yeshiva members read tasks" ON public.tasks FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));

-- ============ FIX 3: YESHIVA INVITES + ONBOARDING ============
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

-- Admins of the yeshiva manage its invites.
DROP POLICY IF EXISTS "admins manage invites" ON public.yeshiva_invites;
CREATE POLICY "admins manage invites" ON public.yeshiva_invites FOR ALL
  TO authenticated USING (public.is_admin_of(yeshiva_id))
  WITH CHECK (public.is_admin_of(yeshiva_id));
-- The invited user can read their own pending invite by matching email.
DROP POLICY IF EXISTS "invitee reads own invite" ON public.yeshiva_invites;
CREATE POLICY "invitee reads own invite" ON public.yeshiva_invites FOR SELECT
  TO authenticated USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Rewrite handle_new_user(): honour a matching pending invite, otherwise fall
-- back to the original behaviour (first user ever = admin, else staff/null).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invite public.yeshiva_invites%ROWTYPE;
BEGIN
  SELECT * INTO _invite
  FROM public.yeshiva_invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF _invite.id IS NOT NULL THEN
    -- Joining an existing yeshiva through an invite.
    INSERT INTO public.profiles (id, email, full_name, yeshiva_id)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), _invite.yeshiva_id);
    INSERT INTO public.user_roles (user_id, role, yeshiva_id)
    VALUES (NEW.id, _invite.role, _invite.yeshiva_id)
    ON CONFLICT (user_id, role, yeshiva_id) DO NOTHING;
    UPDATE public.yeshiva_invites SET accepted_at = now() WHERE id = _invite.id;
  ELSE
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Onboarding wizard calls this after creating the yeshiva: it links the new
-- yeshiva to the current user's profile and gives them a yeshiva-scoped admin
-- role. Guarded so it cannot hijack an existing/occupied yeshiva.
CREATE OR REPLACE FUNCTION public.claim_yeshiva(_yeshiva_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND yeshiva_id IS NOT NULL) THEN
    RAISE EXCEPTION 'user already belongs to a yeshiva';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE yeshiva_id = _yeshiva_id AND role = 'admin') THEN
    RAISE EXCEPTION 'yeshiva already has an admin';
  END IF;

  UPDATE public.profiles SET yeshiva_id = _yeshiva_id WHERE id = auth.uid();
  INSERT INTO public.user_roles (user_id, role, yeshiva_id)
  VALUES (auth.uid(), 'admin', _yeshiva_id)
  ON CONFLICT (user_id, role, yeshiva_id) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_yeshiva(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_yeshiva(uuid) TO authenticated;

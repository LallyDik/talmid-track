-- ============================================================================
-- REVIEW SECURITY FIXES
-- Addresses three independent security findings:
--   (6) Any user could move themselves to another yeshiva by updating
--       profiles.yeshiva_id directly, hijacking the whole tenant key.
--   (7) storage.objects policies filtered only by bucket_id, allowing any
--       authenticated user to list / download / delete another yeshiva's files.
--   (8) handle_new_user() honoured an invite by e-mail alone; the unguessable
--       invite token was never verified server-side.
-- Idempotent / re-runnable: every policy is dropped first.
-- ============================================================================

-- ============================================================================
-- FIX 6: LOCK profiles.yeshiva_id
-- ----------------------------------------------------------------------------
-- The tenant key (get_my_yeshiva_id()) is read straight from
-- profiles.yeshiva_id, so a self-service UPDATE of that column is a full
-- cross-tenant escape. We keep the "update own profile" capability but forbid
-- changing yeshiva_id through the API: the WITH CHECK requires the new
-- yeshiva_id to equal the value already stored for the caller
-- (get_my_yeshiva_id() is STABLE + SECURITY DEFINER and, inside an UPDATE,
-- reads the pre-update snapshot -> effectively NEW.yeshiva_id = OLD.yeshiva_id).
--
-- Legitimate assignment still works because it goes through the SECURITY
-- DEFINER function claim_yeshiva(), whose owner bypasses RLS. Onboarding now
-- calls that RPC instead of updating the column directly.
-- ============================================================================
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND yeshiva_id IS NOT DISTINCT FROM public.get_my_yeshiva_id()
  );

-- ============================================================================
-- FIX 7: TENANT-SCOPED STORAGE POLICIES
-- ----------------------------------------------------------------------------
-- Object keys are laid out as `<yeshiva_id>/...` (see attendance.upload.tsx and
-- DocumentsTab.tsx). Enforce that the first path segment matches the caller's
-- own yeshiva for every operation, on both private buckets.
-- (storage.foldername(name))[1] is the first folder segment of the object key.
-- ============================================================================

-- ---- attendance-reports ----
DROP POLICY IF EXISTS "authenticated read attendance reports" ON storage.objects;
CREATE POLICY "authenticated read attendance reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

DROP POLICY IF EXISTS "authenticated upload attendance reports" ON storage.objects;
CREATE POLICY "authenticated upload attendance reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

DROP POLICY IF EXISTS "authenticated update attendance reports" ON storage.objects;
CREATE POLICY "authenticated update attendance reports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  )
  WITH CHECK (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

DROP POLICY IF EXISTS "authenticated delete attendance reports" ON storage.objects;
CREATE POLICY "authenticated delete attendance reports"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attendance-reports'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

-- ---- student-documents ----
DROP POLICY IF EXISTS "authenticated read student documents" ON storage.objects;
CREATE POLICY "authenticated read student documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

DROP POLICY IF EXISTS "authenticated upload student documents" ON storage.objects;
CREATE POLICY "authenticated upload student documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

DROP POLICY IF EXISTS "authenticated update student documents" ON storage.objects;
CREATE POLICY "authenticated update student documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  )
  WITH CHECK (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

DROP POLICY IF EXISTS "authenticated delete student documents" ON storage.objects;
CREATE POLICY "authenticated delete student documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.get_my_yeshiva_id()::text
  );

-- ============================================================================
-- FIX 8: VERIFY THE INVITE TOKEN SERVER-SIDE
-- ----------------------------------------------------------------------------
-- The invite carries an unguessable 48-hex-char token. Signup now passes it
-- through raw_user_meta_data.invite_token (see auth.tsx). handle_new_user()
-- resolves the invite by that TOKEN (still requiring the e-mail to match as a
-- second factor) instead of trusting the e-mail alone. Without a valid token a
-- new user gets the default treatment (first user = admin, otherwise staff and
-- no yeshiva) and can NEVER inherit an invited yeshiva/role by guessing an
-- e-mail address.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invite public.yeshiva_invites%ROWTYPE;
  _token  text := NULLIF(NEW.raw_user_meta_data->>'invite_token', '');
BEGIN
  IF _token IS NOT NULL THEN
    SELECT * INTO _invite
    FROM public.yeshiva_invites
    WHERE token = _token
      AND lower(email) = lower(NEW.email)
      AND accepted_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF _invite.id IS NOT NULL THEN
    -- Joining an existing yeshiva through a verified invite token.
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
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

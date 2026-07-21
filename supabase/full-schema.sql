-- ============================================================
-- ניהול הישיבה — סכמה מלאה ל-Supabase (כל המיגרציות מאוחדות)
-- הדבק את כל הקובץ ב-SQL Editor של פרויקט ה-Supabase החדש שלך והרץ.
-- נוצר אוטומטית מ-supabase/migrations/ בסדר הכרונולוגי.
-- ============================================================


-- ============================================================
-- מקור: 20260720141025_e726bbf5-92ab-4f9d-bfc7-649c386f6f7a.sql
-- ============================================================

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'viewer');
CREATE TYPE public.student_status AS ENUM ('active', 'inactive', 'vacation', 'left', 'suspended');
CREATE TYPE public.attendance_status AS ENUM ('on_time', 'late_b', 'late_c', 'absent', 'excused', 'unknown');
CREATE TYPE public.report_processing_status AS ENUM ('pending', 'processing', 'needs_review', 'approved', 'failed');
CREATE TYPE public.event_severity AS ENUM ('info', 'low', 'medium', 'high', 'urgent');
CREATE TYPE public.treatment_status AS ENUM ('new', 'in_progress', 'waiting', 'completed', 'cancelled');
CREATE TYPE public.task_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');

-- ============ YESHIVAS ============
CREATE TABLE public.yeshivas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yeshivas TO authenticated;
GRANT ALL ON public.yeshivas TO service_role;
ALTER TABLE public.yeshivas ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  yeshiva_id uuid REFERENCES public.yeshivas(id) ON DELETE SET NULL,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  yeshiva_id uuid REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, yeshiva_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_my_yeshiva_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT yeshiva_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Auto-create profile + admin role on first signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- First user in the system gets admin role
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS: yeshivas / profiles / user_roles ============
CREATE POLICY "Users can view their yeshiva" ON public.yeshivas FOR SELECT
  TO authenticated USING (id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "Admins manage yeshivas" ON public.yeshivas FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users create their yeshiva when none" ON public.yeshivas FOR INSERT
  TO authenticated WITH CHECK (public.get_my_yeshiva_id() IS NULL);

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT
  TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins insert profiles" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ============ CLASSES ============
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read classes" ON public.classes FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage classes" ON public.classes FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ STUDENTS ============
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  father_name text,
  phone text,
  parent_phone text,
  email text,
  date_of_birth date,
  address text,
  status public.student_status NOT NULL DEFAULT 'active',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_yeshiva ON public.students(yeshiva_id);
CREATE INDEX idx_students_class ON public.students(class_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read students" ON public.students FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage students" ON public.students FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STUDY_SESSIONS ============
CREATE TABLE public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  start_time time NOT NULL,
  late_time_b time NOT NULL,
  late_time_c time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read sessions" ON public.study_sessions FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage sessions" ON public.study_sessions FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ ATTENDANCE_REPORTS ============
CREATE TABLE public.attendance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  study_session_id uuid NOT NULL REFERENCES public.study_sessions(id) ON DELETE RESTRICT,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  file_url text,
  original_file_name text,
  processing_status public.report_processing_status NOT NULL DEFAULT 'pending',
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  ocr_raw_result jsonb,
  notes text
);
CREATE INDEX idx_reports_date ON public.attendance_reports(report_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_reports TO authenticated;
GRANT ALL ON public.attendance_reports TO service_role;
ALTER TABLE public.attendance_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read reports" ON public.attendance_reports FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage reports" ON public.attendance_reports FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ ATTENDANCE_RECORDS ============
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_report_id uuid REFERENCES public.attendance_reports(id) ON DELETE SET NULL,
  report_date date NOT NULL,
  study_session_id uuid NOT NULL REFERENCES public.study_sessions(id) ON DELETE RESTRICT,
  attendance_status public.attendance_status NOT NULL DEFAULT 'unknown',
  detected_automatically boolean NOT NULL DEFAULT false,
  detection_confidence numeric,
  manually_verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, report_date, study_session_id)
);
CREATE INDEX idx_records_student ON public.attendance_records(student_id);
CREATE INDEX idx_records_date ON public.attendance_records(report_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read records" ON public.attendance_records FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage records" ON public.attendance_records FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
CREATE TRIGGER trg_records_updated BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STUDENT_EVENTS ============
CREATE TABLE public.student_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL,
  description text,
  severity public.event_severity NOT NULL DEFAULT 'info',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_events TO authenticated;
GRANT ALL ON public.student_events TO service_role;
ALTER TABLE public.student_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read events" ON public.student_events FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage events" ON public.student_events FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ STUDENT_TREATMENTS ============
CREATE TABLE public.student_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  treatment_type text,
  status public.treatment_status NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  completed_at timestamptz,
  outcome text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_treatments TO authenticated;
GRANT ALL ON public.student_treatments TO service_role;
ALTER TABLE public.student_treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read treatments" ON public.student_treatments FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage treatments" ON public.student_treatments FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ TREATMENT_UPDATES ============
CREATE TABLE public.treatment_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id uuid NOT NULL REFERENCES public.student_treatments(id) ON DELETE CASCADE,
  update_date timestamptz NOT NULL DEFAULT now(),
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_updates TO authenticated;
GRANT ALL ON public.treatment_updates TO service_role;
ALTER TABLE public.treatment_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read treatment updates" ON public.treatment_updates FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.student_treatments t
    WHERE t.id = treatment_id AND (t.yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin())
  ));
CREATE POLICY "yeshiva members manage treatment updates" ON public.treatment_updates FOR ALL
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.student_treatments t
    WHERE t.id = treatment_id AND t.yeshiva_id = public.get_my_yeshiva_id()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.student_treatments t
    WHERE t.id = treatment_id AND t.yeshiva_id = public.get_my_yeshiva_id()
  ));

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.student_treatments(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES auth.users(id),
  due_date date,
  priority int NOT NULL DEFAULT 2,
  status public.task_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yeshiva members read tasks" ON public.tasks FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin());
CREATE POLICY "yeshiva members manage tasks" ON public.tasks FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());


-- ============================================================
-- מקור: 20260720141041_45846a22-6e78-4da6-86b3-fb807cf68e90.sql
-- ============================================================

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_yeshiva_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_yeshiva_id() TO authenticated;


-- ============================================================
-- מקור: 20260720141055_93cecd50-dd57-4e9d-843d-ee825ea2ef2d.sql
-- ============================================================

CREATE POLICY "authenticated read attendance reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-reports');
CREATE POLICY "authenticated upload attendance reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-reports');
CREATE POLICY "authenticated update attendance reports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attendance-reports');
CREATE POLICY "authenticated delete attendance reports"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-reports');


-- ============================================================
-- מקור: 20260721074414_bc91bcdc-895c-4946-9264-89696c97d05e.sql
-- ============================================================

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


-- ============================================================
-- מקור: 20260721074439_b8740082-06cd-4661-9018-7832af935084.sql
-- ============================================================

-- Switch policy-helper functions from SECURITY DEFINER to SECURITY INVOKER.
-- Authenticated users can already read their own profile row and their own user_roles rows via RLS,
-- so these functions no longer need elevated privileges.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.get_my_yeshiva_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT yeshiva_id FROM public.profiles WHERE id = auth.uid() $$;


-- ============================================================
-- מקור: 20260721084000_7eef4c55-3adf-4b8d-a871-3d14b2c888ac.sql
-- ============================================================
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

-- ============================================================
-- מקור: 20260721084058_56dfb926-1bc2-4d3b-88c7-b2a0a7713dbf.sql
-- ============================================================
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_records_yeshiva_date_draft ON public.attendance_records(yeshiva_id, report_date, is_draft);

DROP POLICY IF EXISTS "yeshiva members read records" ON public.attendance_records;
DROP POLICY IF EXISTS "yeshiva members manage records" ON public.attendance_records;
CREATE POLICY "yeshiva members read records" ON public.attendance_records FOR SELECT TO authenticated USING ((yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id)) AND deleted_at IS NULL);
CREATE POLICY "yeshiva members insert records" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
CREATE POLICY "yeshiva members update records" ON public.attendance_records FOR UPDATE TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id()) WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
REVOKE DELETE ON public.attendance_records FROM authenticated;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid REFERENCES public.yeshivas(id) ON DELETE SET NULL,
  table_name text NOT NULL, record_id uuid, action text NOT NULL, actor_id uuid,
  old_values jsonb, new_values jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_yeshiva ON public.audit_log(yeshiva_id);
CREATE INDEX IF NOT EXISTS idx_audit_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read audit log" ON public.audit_log;
CREATE POLICY "admins read audit log" ON public.audit_log FOR SELECT TO authenticated USING (yeshiva_id IS NOT NULL AND public.is_admin_of(yeshiva_id));

CREATE TABLE IF NOT EXISTS public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text, file_path text NOT NULL, original_file_name text, mime_type text, size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_yeshiva ON public.student_documents(yeshiva_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_documents TO authenticated;
GRANT ALL ON public.student_documents TO service_role;
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read documents" ON public.student_documents;
CREATE POLICY "yeshiva members read documents" ON public.student_documents FOR SELECT TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage documents" ON public.student_documents;
CREATE POLICY "yeshiva members manage documents" ON public.student_documents FOR ALL TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id()) WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  rule_key text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  threshold int, window_days int,
  severity public.event_severity NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (yeshiva_id, rule_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read alert rules" ON public.alert_rules;
CREATE POLICY "yeshiva members read alert rules" ON public.alert_rules FOR SELECT TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage alert rules" ON public.alert_rules;
CREATE POLICY "yeshiva members manage alert rules" ON public.alert_rules FOR ALL TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id()) WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.student_treatments(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.attendance_reports(id) ON DELETE SET NULL,
  rule_key text NOT NULL, title text NOT NULL, body text,
  severity public.event_severity NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_alerts_yeshiva ON public.alerts(yeshiva_id);
CREATE INDEX IF NOT EXISTS idx_alerts_student ON public.alerts(student_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts(yeshiva_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read alerts" ON public.alerts;
CREATE POLICY "yeshiva members read alerts" ON public.alerts FOR SELECT TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage alerts" ON public.alerts;
CREATE POLICY "yeshiva members manage alerts" ON public.alerts FOR ALL TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id()) WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL UNIQUE REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  event_types text[] NOT NULL DEFAULT '{}',
  treatment_types text[] NOT NULL DEFAULT '{}',
  active_school_year text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read settings" ON public.app_settings;
CREATE POLICY "yeshiva members read settings" ON public.app_settings FOR SELECT TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage settings" ON public.app_settings;
CREATE POLICY "yeshiva members manage settings" ON public.app_settings FOR ALL TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id()) WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============================================================
-- מקור: 20260721093925_8a77f27e-4d3b-4d14-94d0-fcc4dea0e917.sql
-- ============================================================

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


-- ============================================================
-- מקור: 20260721120000_tenant_security_and_storage.sql
-- ============================================================
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


-- ============================================================
-- מקור: 20260721120100_new_tables_audit_softdelete.sql
-- ============================================================
-- ============================================================================
-- NEW TABLES + AUDIT LOG + SOFT DELETE + DRAFT/FINAL ATTENDANCE
-- Fixes 4-9.
-- ============================================================================

-- ============ FIX 6 + 5: attendance_records columns ============
-- Draft vs final (attendance must not count until a report is approved) and
-- soft delete (attendance records may never be permanently deleted).
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_records_yeshiva_date_draft
  ON public.attendance_records(yeshiva_id, report_date, is_draft);

-- Rework attendance_records policies: soft-deleted rows are excluded from
-- reads by default, and hard DELETE is removed so records can only be soft
-- deleted (set deleted_at) via UPDATE.
DROP POLICY IF EXISTS "yeshiva members read records" ON public.attendance_records;
DROP POLICY IF EXISTS "yeshiva members manage records" ON public.attendance_records;
CREATE POLICY "yeshiva members read records" ON public.attendance_records FOR SELECT
  TO authenticated
  USING ((yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id))
         AND deleted_at IS NULL);
CREATE POLICY "yeshiva members insert records" ON public.attendance_records FOR INSERT
  TO authenticated WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
CREATE POLICY "yeshiva members update records" ON public.attendance_records FOR UPDATE
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
-- No DELETE policy: permanent deletion is disallowed at the grant level too.
REVOKE DELETE ON public.attendance_records FROM authenticated;

-- Admin-only restore of a soft-deleted attendance record (recover from the
-- audit trail, which logs the soft delete). Runs as definer to see hidden rows.
CREATE OR REPLACE FUNCTION public.restore_attendance_record(_record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _yid uuid;
BEGIN
  SELECT yeshiva_id INTO _yid FROM public.attendance_records WHERE id = _record_id;
  IF _yid IS NULL THEN
    RAISE EXCEPTION 'record not found';
  END IF;
  IF NOT (_yid = public.get_my_yeshiva_id() OR public.is_admin_of(_yid)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.attendance_records
    SET deleted_at = NULL, deleted_by = NULL
    WHERE id = _record_id;
END; $$;
REVOKE ALL ON FUNCTION public.restore_attendance_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_attendance_record(uuid) TO authenticated;

-- Approving a report finalizes its attendance records (is_draft -> false), so
-- attendance only counts once the report is approved.
CREATE OR REPLACE FUNCTION public.fn_finalize_approved_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.processing_status = 'approved'
     AND (OLD.processing_status IS DISTINCT FROM 'approved') THEN
    UPDATE public.attendance_records
      SET is_draft = false
      WHERE attendance_report_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.fn_finalize_approved_report() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_finalize_report ON public.attendance_reports;
CREATE TRIGGER trg_finalize_report
  AFTER UPDATE ON public.attendance_reports
  FOR EACH ROW EXECUTE FUNCTION public.fn_finalize_approved_report();

-- ============ FIX 4: AUDIT LOG ============
-- Log important actions; record who changed each attendance record.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid REFERENCES public.yeshivas(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  actor_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_yeshiva ON public.audit_log(yeshiva_id);
CREATE INDEX IF NOT EXISTS idx_audit_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);
-- Only SELECT is granted; inserts happen through the definer trigger below so
-- the log cannot be tampered with from the client.
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read audit log" ON public.audit_log;
CREATE POLICY "admins read audit log" ON public.audit_log FOR SELECT
  TO authenticated USING (yeshiva_id IS NOT NULL AND public.is_admin_of(yeshiva_id));

-- Generic audit trigger. Works for any table exposing id + yeshiva_id.
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _yeshiva_id uuid;
  _record_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _yeshiva_id := OLD.yeshiva_id;
    _record_id := OLD.id;
  ELSE
    _yeshiva_id := NEW.yeshiva_id;
    _record_id := NEW.id;
  END IF;

  INSERT INTO public.audit_log
    (yeshiva_id, table_name, record_id, action, actor_id, old_values, new_values)
  VALUES (
    _yeshiva_id,
    TG_TABLE_NAME,
    _record_id,
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.fn_audit_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_attendance_records ON public.attendance_records;
CREATE TRIGGER trg_audit_attendance_records
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
DROP TRIGGER IF EXISTS trg_audit_students ON public.students;
CREATE TRIGGER trg_audit_students
  AFTER INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
DROP TRIGGER IF EXISTS trg_audit_student_treatments ON public.student_treatments;
CREATE TRIGGER trg_audit_student_treatments
  AFTER INSERT OR UPDATE OR DELETE ON public.student_treatments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- ============ FIX 7: STUDENT_DOCUMENTS ============
CREATE TABLE IF NOT EXISTS public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text,
  file_path text NOT NULL,
  original_file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_yeshiva ON public.student_documents(yeshiva_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_documents TO authenticated;
GRANT ALL ON public.student_documents TO service_role;
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read documents" ON public.student_documents;
CREATE POLICY "yeshiva members read documents" ON public.student_documents FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage documents" ON public.student_documents;
CREATE POLICY "yeshiva members manage documents" ON public.student_documents FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ FIX 8: ALERT_RULES + ALERTS ============
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  threshold int,
  window_days int,
  severity public.event_severity NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (yeshiva_id, rule_key)
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_yeshiva ON public.alert_rules(yeshiva_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read alert rules" ON public.alert_rules;
CREATE POLICY "yeshiva members read alert rules" ON public.alert_rules FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage alert rules" ON public.alert_rules;
CREATE POLICY "yeshiva members manage alert rules" ON public.alert_rules FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.student_treatments(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.attendance_reports(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  title text NOT NULL,
  body text,
  severity public.event_severity NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_alerts_yeshiva ON public.alerts(yeshiva_id);
CREATE INDEX IF NOT EXISTS idx_alerts_student ON public.alerts(student_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts(yeshiva_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read alerts" ON public.alerts;
CREATE POLICY "yeshiva members read alerts" ON public.alerts FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage alerts" ON public.alerts;
CREATE POLICY "yeshiva members manage alerts" ON public.alerts FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());

-- ============ FIX 9: APP_SETTINGS ============
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yeshiva_id uuid NOT NULL UNIQUE REFERENCES public.yeshivas(id) ON DELETE CASCADE,
  event_types text[] NOT NULL DEFAULT '{}',
  treatment_types text[] NOT NULL DEFAULT '{}',
  active_school_year text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yeshiva members read settings" ON public.app_settings;
CREATE POLICY "yeshiva members read settings" ON public.app_settings FOR SELECT
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id() OR public.is_admin_of(yeshiva_id));
DROP POLICY IF EXISTS "yeshiva members manage settings" ON public.app_settings;
CREATE POLICY "yeshiva members manage settings" ON public.app_settings FOR ALL
  TO authenticated USING (yeshiva_id = public.get_my_yeshiva_id())
  WITH CHECK (yeshiva_id = public.get_my_yeshiva_id());
DROP TRIGGER IF EXISTS trg_app_settings_updated ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- מקור: 20260721120200_seed_sample_data.sql
-- ============================================================
-- ============================================================================
-- SAMPLE / SEED DATA
-- Guarded: only runs when no yeshiva exists yet, so it never touches real data.
-- ============================================================================
DO $$
DECLARE
  _yid   uuid;
  _cls_a uuid;  -- שיעור א׳
  _cls_b uuid;  -- שיעור ב׳
  _cls_c uuid;  -- שיעור ג׳
  _cls_k uuid;  -- קיבוץ א׳
BEGIN
  IF EXISTS (SELECT 1 FROM public.yeshivas) THEN
    RAISE NOTICE 'yeshivas already exist - skipping seed';
    RETURN;
  END IF;

  -- ---- yeshiva ----
  INSERT INTO public.yeshivas (name, address)
  VALUES ('ישיבת דוגמה', 'רחוב הישיבה 1, ירושלים')
  RETURNING id INTO _yid;

  -- ---- study sessions (3 sedarim) ----
  INSERT INTO public.study_sessions (yeshiva_id, name, order_index, start_time, late_time_b, late_time_c) VALUES
    (_yid, 'סדר א׳', 0, '08:00', '08:15', '08:30'),
    (_yid, 'סדר ב׳', 1, '16:00', '16:15', '16:30'),
    (_yid, 'סדר ג׳', 2, '20:30', '20:45', '21:00');

  -- ---- classes ----
  INSERT INTO public.classes (yeshiva_id, name) VALUES (_yid, 'שיעור א׳') RETURNING id INTO _cls_a;
  INSERT INTO public.classes (yeshiva_id, name) VALUES (_yid, 'שיעור ב׳') RETURNING id INTO _cls_b;
  INSERT INTO public.classes (yeshiva_id, name) VALUES (_yid, 'שיעור ג׳') RETURNING id INTO _cls_c;
  INSERT INTO public.classes (yeshiva_id, name) VALUES (_yid, 'קיבוץ א׳') RETURNING id INTO _cls_k;

  -- ---- students (~40, spread across the classes) ----
  INSERT INTO public.students (yeshiva_id, class_id, full_name, father_name)
  SELECT _yid, _cls_a, v.full_name, v.father_name FROM (VALUES
    ('משה כהן', 'ישראל'),
    ('יעקב לוי', 'אברהם'),
    ('שמואל פרידמן', 'דוד'),
    ('אהרן ווייס', 'יוסף'),
    ('דוד רוזנברג', 'מנחם'),
    ('יצחק גרינבוים', 'שלמה'),
    ('חיים שטרן', 'נפתלי'),
    ('אליהו ברגר', 'מרדכי'),
    ('נתן הורוביץ', 'אשר'),
    ('יוסף פינקל', 'יהודה')
  ) AS v(full_name, father_name);

  INSERT INTO public.students (yeshiva_id, class_id, full_name, father_name)
  SELECT _yid, _cls_b, v.full_name, v.father_name FROM (VALUES
    ('מנחם קליין', 'עזריאל'),
    ('שלמה גולד', 'ברוך'),
    ('אברהם זילברמן', 'חיים'),
    ('ברוך ליברמן', 'שמעון'),
    ('מרדכי אקשטיין', 'יעקב'),
    ('אשר וינברג', 'משה'),
    ('נפתלי שוורץ', 'אליעזר'),
    ('יהודה בלוי', 'שמואל'),
    ('עזריאל פרלמן', 'נחום'),
    ('שמעון האן', 'זאב')
  ) AS v(full_name, father_name);

  INSERT INTO public.students (yeshiva_id, class_id, full_name, father_name)
  SELECT _yid, _cls_c, v.full_name, v.father_name FROM (VALUES
    ('אליעזר רוט', 'צבי'),
    ('צבי מרגליות', 'ישראל'),
    ('ישראל דויטש', 'מאיר'),
    ('מאיר לנדאו', 'יונה'),
    ('יונה ביסטריצקי', 'אהרן'),
    ('זאב אונגר', 'גדליה'),
    ('גדליה שפירא', 'יצחק'),
    ('נחום טאובר', 'דוב'),
    ('דוב הלר', 'מנשה'),
    ('מנשה קרליץ', 'אליהו')
  ) AS v(full_name, father_name);

  INSERT INTO public.students (yeshiva_id, class_id, full_name, father_name)
  SELECT _yid, _cls_k, v.full_name, v.father_name FROM (VALUES
    ('שרגא פייביש וובר', 'יהושע'),
    ('יהושע העשל שטיין', 'קלמן'),
    ('קלמן רייס', 'שרגא'),
    ('אלימלך גוטמן', 'פסח'),
    ('פסח וכטל', 'אלימלך'),
    ('יואל מוזס', 'שאול'),
    ('שאול ברודי', 'יואל'),
    ('רפאל אדלר', 'עמרם'),
    ('עמרם וייסמן', 'רפאל'),
    ('יחיאל שנקר', 'ברל')
  ) AS v(full_name, father_name);

  -- ---- ~3 weeks of finalized attendance (Sun-Thu only) ----
  -- Distribution: ~70% on_time, 15% late_b, 5% late_c, 8% absent, 2% excused.
  INSERT INTO public.attendance_records
    (yeshiva_id, student_id, report_date, study_session_id, attendance_status,
     is_draft, detected_automatically, manually_verified)
  SELECT
    _yid,
    s.id,
    (CURRENT_DATE - g.n)::date,
    ses.id,
    (CASE
       WHEN rr.r < 0.70 THEN 'on_time'
       WHEN rr.r < 0.85 THEN 'late_b'
       WHEN rr.r < 0.90 THEN 'late_c'
       WHEN rr.r < 0.98 THEN 'absent'
       ELSE 'excused'
     END)::public.attendance_status,
    false, true, true
  FROM public.students s
  CROSS JOIN generate_series(0, 20) AS g(n)
  CROSS JOIN public.study_sessions ses
  CROSS JOIN LATERAL (SELECT random() AS r) AS rr
  WHERE s.yeshiva_id = _yid
    AND ses.yeshiva_id = _yid
    AND EXTRACT(ISODOW FROM (CURRENT_DATE - g.n)) NOT IN (5, 6)
  ON CONFLICT (student_id, report_date, study_session_id) DO NOTHING;

  -- ---- a few student events ----
  INSERT INTO public.student_events (yeshiva_id, student_id, event_type, event_date, title, description, severity)
  VALUES
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 2 LIMIT 1),
      'משמעת', CURRENT_DATE - 3, 'הפרעה בסדר', 'הפריע במהלך סדר ב׳', 'low'),
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 7 LIMIT 1),
      'לימודים', CURRENT_DATE - 6, 'שיפור ניכר בשיעור', 'התקדמות יפה בחומר', 'info'),
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 15 LIMIT 1),
      'בריאות', CURRENT_DATE - 4, 'נעדר עקב מחלה', 'הביא אישור רפואי', 'medium'),
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 30 LIMIT 1),
      'משמעת', CURRENT_DATE - 1, 'איחורים חוזרים', 'איחר שלוש פעמים השבוע', 'high');

  -- ---- a few treatments ----
  INSERT INTO public.student_treatments (yeshiva_id, student_id, title, description, treatment_type, status)
  VALUES
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 30 LIMIT 1),
      'מעקב איחורים', 'מעקב שבועי אחר נוכחות התלמיד', 'מעקב נוכחות', 'in_progress'),
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 2 LIMIT 1),
      'שיחת משמעת', 'שיחת חיזוק בעקבות הפרעה בסדר', 'שיחת חיזוק', 'new'),
    (_yid, (SELECT id FROM public.students WHERE yeshiva_id = _yid ORDER BY full_name OFFSET 15 LIMIT 1),
      'ליווי לאחר היעדרות', 'ליווי אישי לחזרה לשגרת הלימודים', 'ליווי אישי', 'in_progress');

  INSERT INTO public.treatment_updates (treatment_id, content)
  SELECT id, 'נערכה שיחה עם התלמיד ונקבע מעקב שבועי.'
  FROM public.student_treatments
  WHERE yeshiva_id = _yid AND title = 'מעקב איחורים'
  LIMIT 1;

  -- ---- app settings for the sample yeshiva ----
  INSERT INTO public.app_settings (yeshiva_id, event_types, treatment_types, active_school_year)
  VALUES (
    _yid,
    ARRAY['משמעת', 'לימודים', 'בריאות', 'משפחה'],
    ARRAY['מעקב נוכחות', 'שיחת חיזוק', 'ליווי אישי'],
    'תשפ"ו'
  )
  ON CONFLICT (yeshiva_id) DO NOTHING;

END $$;


-- ============================================================
-- מקור: 20260722100000_review_security_fixes.sql
-- ============================================================
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


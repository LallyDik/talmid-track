
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

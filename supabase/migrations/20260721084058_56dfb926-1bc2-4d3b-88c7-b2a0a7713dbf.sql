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
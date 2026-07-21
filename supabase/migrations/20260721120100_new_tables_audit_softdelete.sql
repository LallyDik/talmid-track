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

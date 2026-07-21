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

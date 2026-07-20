
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

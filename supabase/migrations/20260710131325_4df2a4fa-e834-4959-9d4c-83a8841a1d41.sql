DROP POLICY IF EXISTS "Read active vcf sessions" ON public.vcf_sessions;
CREATE POLICY "Read active or recent vcf sessions"
  ON public.vcf_sessions
  FOR SELECT
  TO anon, authenticated
  USING (
    (phase = 'running' AND (ends_at IS NULL OR ends_at > now()))
    OR (phase IN ('running','done') AND updated_at > (now() - interval '30 days'))
  );
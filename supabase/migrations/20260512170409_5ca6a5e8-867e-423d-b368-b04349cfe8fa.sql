
CREATE TABLE public.vcf_sessions (
  starter_id TEXT PRIMARY KEY,
  starter_name TEXT,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  activity JSONB NOT NULL DEFAULT '[]'::jsonb,
  timer_hours INTEGER NOT NULL DEFAULT 0,
  timer_minutes INTEGER NOT NULL DEFAULT 1,
  timer_secs INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'idle',
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vcf_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vcf sessions"
  ON public.vcf_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create vcf sessions"
  ON public.vcf_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update vcf sessions"
  ON public.vcf_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_vcf_sessions_updated_at
BEFORE UPDATE ON public.vcf_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.vcf_sessions;

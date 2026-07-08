
-- Add session secret (nullable to allow backfill of existing rows)
ALTER TABLE public.vcf_sessions ADD COLUMN IF NOT EXISTS session_secret text;

-- Drop overly-permissive policies
DROP POLICY IF EXISTS "Anyone can create vcf sessions" ON public.vcf_sessions;
DROP POLICY IF EXISTS "Anyone can read vcf sessions" ON public.vcf_sessions;
DROP POLICY IF EXISTS "Anyone can update vcf sessions" ON public.vcf_sessions;

-- Read only active sessions so old sessions/contact lists aren't enumerable
CREATE POLICY "Read active vcf sessions"
  ON public.vcf_sessions
  FOR SELECT
  TO anon, authenticated
  USING (
    phase = 'running'
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Direct INSERT/UPDATE are disabled; all writes go through SECURITY DEFINER functions below.
-- (No INSERT/UPDATE policy = denied.)

-- Starter-only upsert (verifies session_secret on updates)
CREATE OR REPLACE FUNCTION public.upsert_vcf_session(
  _starter_id text,
  _session_secret text,
  _starter_name text,
  _contacts jsonb,
  _activity jsonb,
  _timer_hours integer,
  _timer_minutes integer,
  _timer_secs integer,
  _phase text,
  _ends_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_secret text;
BEGIN
  IF _starter_id IS NULL OR length(_starter_id) < 16 THEN
    RAISE EXCEPTION 'invalid starter_id';
  END IF;
  IF _session_secret IS NULL OR length(_session_secret) < 24 THEN
    RAISE EXCEPTION 'invalid session_secret';
  END IF;
  IF _phase NOT IN ('idle','running','done') THEN
    RAISE EXCEPTION 'invalid phase';
  END IF;
  IF jsonb_typeof(coalesce(_contacts,'[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(_contacts,'[]'::jsonb)) > 2000 THEN
    RAISE EXCEPTION 'invalid contacts';
  END IF;

  SELECT session_secret INTO existing_secret
  FROM public.vcf_sessions
  WHERE starter_id = _starter_id;

  IF existing_secret IS NULL THEN
    INSERT INTO public.vcf_sessions (
      starter_id, session_secret, starter_name, contacts, activity,
      timer_hours, timer_minutes, timer_secs, phase, ends_at
    ) VALUES (
      _starter_id, _session_secret, _starter_name,
      coalesce(_contacts,'[]'::jsonb), coalesce(_activity,'[]'::jsonb),
      _timer_hours, _timer_minutes, _timer_secs, _phase, _ends_at
    );
  ELSE
    IF existing_secret <> _session_secret THEN
      RAISE EXCEPTION 'secret mismatch';
    END IF;
    UPDATE public.vcf_sessions
    SET starter_name = _starter_name,
        contacts = coalesce(_contacts,'[]'::jsonb),
        activity = coalesce(_activity,'[]'::jsonb),
        timer_hours = _timer_hours,
        timer_minutes = _timer_minutes,
        timer_secs = _timer_secs,
        phase = _phase,
        ends_at = _ends_at,
        updated_at = now()
    WHERE starter_id = _starter_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vcf_session(text,text,text,jsonb,jsonb,integer,integer,integer,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_vcf_session(text,text,text,jsonb,jsonb,integer,integer,integer,text,timestamptz) TO anon, authenticated;

-- Contributor helper: append one contact to an active session
CREATE OR REPLACE FUNCTION public.append_vcf_contact(
  _starter_id text,
  _contact jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_len integer;
BEGIN
  IF _starter_id IS NULL OR length(_starter_id) < 16 THEN
    RAISE EXCEPTION 'invalid starter_id';
  END IF;
  IF _contact IS NULL OR jsonb_typeof(_contact) <> 'object' THEN
    RAISE EXCEPTION 'invalid contact';
  END IF;

  SELECT jsonb_array_length(coalesce(contacts,'[]'::jsonb)) INTO current_len
  FROM public.vcf_sessions
  WHERE starter_id = _starter_id
    AND phase = 'running'
    AND (ends_at IS NULL OR ends_at > now());

  IF current_len IS NULL THEN
    RAISE EXCEPTION 'session not active';
  END IF;
  IF current_len >= 2000 THEN
    RAISE EXCEPTION 'contact limit reached';
  END IF;

  UPDATE public.vcf_sessions
  SET contacts = coalesce(contacts,'[]'::jsonb) || jsonb_build_array(_contact),
      updated_at = now()
  WHERE starter_id = _starter_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_vcf_contact(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_vcf_contact(text,jsonb) TO anon, authenticated;

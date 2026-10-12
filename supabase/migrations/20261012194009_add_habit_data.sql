-- Historial independiente de Habit Tracker. No modifica tasks ni user_data.
CREATE TABLE public.habit_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT habit_data_history_format CHECK (
    jsonb_typeof(data) = 'object'
    AND data @> '{"version":2}'::jsonb
    AND data ?& ARRAY['version', 'blocks']
    AND jsonb_typeof(data -> 'blocks') = 'array'
    AND jsonb_array_length(data -> 'blocks') > 0
  )
);

ALTER TABLE public.habit_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit_data: user owns row"
  ON public.habit_data FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Limitar privilegios explícitamente aunque el proyecto exponga tablas nuevas.
REVOKE ALL ON public.habit_data FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.habit_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_data TO service_role;

CREATE FUNCTION public.set_habit_data_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_habit_data_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_habit_data_updated_at() TO authenticated, service_role;
CREATE TRIGGER habit_data_set_updated_at
  BEFORE UPDATE ON public.habit_data
  FOR EACH ROW EXECUTE FUNCTION public.set_habit_data_updated_at();

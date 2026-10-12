-- ═══════════════════════════════════════════════════════════
--  MINIMALIST CALENDAR — Supabase Database Setup
--  Run this entire file once in the Supabase SQL Editor.
--  Dashboard → SQL Editor → New query → paste → Run
-- ═══════════════════════════════════════════════════════════

-- 1. TASKS TABLE
--    Each row is one task (app-level id is the primary key).
--    The full task object is stored in the `data` jsonb column.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id         TEXT        PRIMARY KEY,   -- matches task.id in the app (e.g. "task-1234567-42")
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update `updated_at`
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);

-- Row Level Security: each user can only see/modify their own rows
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks: user owns row" ON public.tasks;
CREATE POLICY "tasks: user owns row"
  ON public.tasks
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 2. USER_DATA TABLE
--    Stores tags (array of tag objects) and preferences (json object)
--    One row per user, identified by user_id (unique).
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_data (
  user_id     UUID   PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tags        JSONB  NOT NULL DEFAULT '[]',
  preferences JSONB  NOT NULL DEFAULT '{}'
);

-- Row Level Security
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_data: user owns row" ON public.user_data;
CREATE POLICY "user_data: user owns row"
  ON public.user_data
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. RPC FUNCTION: DELETE USER
--    Allows logged-in users to delete their own account safely.
--    Runs with SECURITY DEFINER to bypass standard client RLS limits.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


-- 4. HÁBITOS: almacenamiento separado por usuario
-- Historial independiente de Habit Tracker. No modifica tasks ni user_data.
CREATE TABLE IF NOT EXISTS public.habit_data (
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
DROP POLICY IF EXISTS "habit_data: user owns row" ON public.habit_data;
CREATE POLICY "habit_data: user owns row"
  ON public.habit_data FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Limitar privilegios explícitamente aunque el proyecto exponga tablas nuevas.
REVOKE ALL ON public.habit_data FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.habit_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_data TO service_role;

CREATE OR REPLACE FUNCTION public.set_habit_data_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_habit_data_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_habit_data_updated_at() TO authenticated, service_role;
DROP TRIGGER IF EXISTS habit_data_set_updated_at ON public.habit_data;
CREATE TRIGGER habit_data_set_updated_at
  BEFORE UPDATE ON public.habit_data
  FOR EACH ROW EXECUTE FUNCTION public.set_habit_data_updated_at();


-- Sincronización incremental: solo viajan diferencias; la revisión y el lote son atómicos.
CREATE OR REPLACE FUNCTION public.sync_habit_changes(p_expected_revision integer, p_changes jsonb)
RETURNS TABLE(revision integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  owner_id uuid := auth.uid();
  current_data jsonb;
  current_revision integer;
  next_revision integer;
  change jsonb;
  change_path text[];
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 10000 THEN
    RAISE EXCEPTION 'Invalid habit changes' USING ERRCODE = '22023';
  END IF;
  SELECT h.data, h.revision INTO current_data, current_revision
    FROM public.habit_data h WHERE h.user_id = owner_id FOR UPDATE;
  IF current_revision IS DISTINCT FROM p_expected_revision THEN RETURN; END IF;
  current_data := coalesce(current_data, '{"version":2,"blocks":[],"hideEmptyDays":false}'::jsonb);
  FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    IF jsonb_typeof(change->'path') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid habit path' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(value ORDER BY ord) INTO change_path
      FROM jsonb_array_elements_text(change->'path') WITH ORDINALITY AS parts(value, ord);
    IF cardinality(change_path) IS NULL OR cardinality(change_path) = 0 OR cardinality(change_path) > 32
       OR change_path[1] NOT IN ('blocks', 'hideEmptyDays') THEN
      RAISE EXCEPTION 'Invalid habit path' USING ERRCODE = '22023';
    END IF;
    CASE change->>'op'
      WHEN 'remove' THEN current_data := current_data #- change_path;
      WHEN 'set' THEN
        IF NOT (change ? 'value') THEN RAISE EXCEPTION 'Missing habit value'; END IF;
        current_data := jsonb_set(current_data, change_path, change->'value', true);
      WHEN 'insert' THEN
        IF NOT (change ? 'value') OR jsonb_typeof(current_data #> change_path[1:cardinality(change_path)-1]) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Invalid habit insertion' USING ERRCODE = '22023';
        END IF;
        current_data := jsonb_insert(current_data, change_path, change->'value', false);
      ELSE RAISE EXCEPTION 'Invalid habit operation' USING ERRCODE = '22023';
    END CASE;
  END LOOP;
  IF current_data->>'version' IS DISTINCT FROM '2'
     OR jsonb_typeof(current_data->'blocks') IS DISTINCT FROM 'array'
     OR jsonb_array_length(current_data->'blocks') = 0 THEN
    RAISE EXCEPTION 'Invalid habit history' USING ERRCODE = '22023';
  END IF;
  next_revision := coalesce(current_revision, 0) + 1;
  IF current_revision IS NULL THEN
    INSERT INTO public.habit_data(user_id, data, revision) VALUES(owner_id, current_data, next_revision);
  ELSE
    UPDATE public.habit_data h SET data = current_data, revision = next_revision WHERE h.user_id = owner_id;
  END IF;
  RETURN QUERY SELECT next_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_habit_changes(integer, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sync_habit_changes(integer, jsonb) TO authenticated;

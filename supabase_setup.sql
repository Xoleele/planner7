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

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

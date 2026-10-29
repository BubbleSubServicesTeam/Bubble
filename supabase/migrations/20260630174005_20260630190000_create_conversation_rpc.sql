/*
# create_conversation RPC function

## Purpose
Provide a single, atomic server-side function for creating (or finding existing)
conversations. By running as SECURITY DEFINER the function bypasses row-level
security entirely, eliminating the "new row violates row-level security policy
for table conversations" error that occurs when PostgREST evaluates RLS WITH
CHECK constraints before database column DEFAULTs are applied.

## What it does
1. Validates the caller is authenticated.
2. For DMs (is_group = false, one recipient): checks if a 1-on-1 conversation
   already exists between the two users. Returns it if found.
3. Creates a new row in `conversations` with `created_by = auth.uid()`.
4. Inserts the caller into `conversation_members`.
5. Inserts every recipient into `conversation_members` (ON CONFLICT DO NOTHING).
6. Returns a JSON object: { id: uuid, existing: bool }.

## Security
- SECURITY DEFINER: runs as the function owner (postgres), bypassing RLS.
- SET search_path = '': prevents search_path hijack.
- REVOKE from PUBLIC + anon; GRANT to authenticated only.
- auth.uid() is called inside the function to get the real caller identity.
*/

CREATE OR REPLACE FUNCTION public.create_conversation(
  p_other_user_ids uuid[],
  p_is_group       boolean DEFAULT false,
  p_name           text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id        uuid;
  v_conv_id          uuid;
  v_existing_conv_id uuid;
  v_uid              uuid;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_ids IS NULL OR array_length(p_other_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Must specify at least one recipient';
  END IF;

  -- For DMs: check if a 1-on-1 conversation already exists
  IF NOT p_is_group AND array_length(p_other_user_ids, 1) = 1 THEN
    SELECT cm1.conversation_id INTO v_existing_conv_id
    FROM public.conversation_members cm1
    JOIN public.conversation_members cm2
      ON cm1.conversation_id = cm2.conversation_id
    JOIN public.conversations c
      ON c.id = cm1.conversation_id
    WHERE cm1.user_id = v_caller_id
      AND cm2.user_id = p_other_user_ids[1]
      AND c.is_group = false
    LIMIT 1;

    IF v_existing_conv_id IS NOT NULL THEN
      RETURN json_build_object('id', v_existing_conv_id, 'existing', true);
    END IF;
  END IF;

  -- Create the conversation (SECURITY DEFINER bypasses RLS)
  INSERT INTO public.conversations (is_group, name, created_by)
  VALUES (p_is_group, p_name, v_caller_id)
  RETURNING id INTO v_conv_id;

  -- Add caller as member
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_caller_id);

  -- Add all recipients
  FOREACH v_uid IN ARRAY p_other_user_ids LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, v_uid)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN json_build_object('id', v_conv_id, 'existing', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text) TO authenticated;

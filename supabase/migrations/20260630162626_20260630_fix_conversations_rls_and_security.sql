/*
# Fix conversations INSERT RLS violation + 2 security issues

## Problems fixed

### 1. RLS violation: "new row violates row-level security policy for table conversations"
The `created_by` column had no DEFAULT, so Postgres evaluated
`WITH CHECK (auth.uid() = created_by)` against a NULL value — always false.
Fix: add `DEFAULT auth.uid()` so the column is auto-populated from the session.

### 2. Security issue: notifications INSERT allows self-notification
The `notifs_insert` policy only checked `sender_id = auth.uid()` but did not
prevent a user from sending a notification to themselves. This allows spamming
your own notification inbox. Fix: add `recipient_id <> auth.uid()`.

### 3. Security issue: is_conversation_member search_path hardening
Ensure the function has `SET search_path = ''` and all object references are
fully-qualified. This prevents a search_path hijack attack against the
SECURITY DEFINER function. Also ensure the function is not callable by anon.

## Changes
- `conversations.created_by`: add `DEFAULT auth.uid()`
- `notifs_insert` policy: tighten to `sender_id = auth.uid() AND recipient_id <> auth.uid()`
- `is_conversation_member`: recreate with locked search_path, revoke anon EXECUTE
*/

-- 1. Add DEFAULT auth.uid() to conversations.created_by
--    This is the root cause of the RLS INSERT violation.
ALTER TABLE public.conversations
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 2. Tighten notifications INSERT: cannot notify yourself
DROP POLICY IF EXISTS "notifs_insert" ON public.notifications;
CREATE POLICY "notifs_insert" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND recipient_id <> auth.uid()
);

-- 3. Harden is_conversation_member: locked search_path, revoke anon
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

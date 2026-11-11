/*
# Self-suspension and blocked-user messaging

1. New Columns
- `profiles.self_suspended`: true only when the account owner suspended their own account. Admin suspensions leave it false, so an owner can never lift an admin suspension.

2. Changed Triggers
- `guard_self_suspension_flag`: keeps `self_suspended` in sync. Any change to `is_suspended` made outside `set_own_suspension` clears the flag.

3. New Functions
- `set_own_suspension(p_suspended, p_pin_hash, p_password)`: suspends the signed-in account. Unsuspending requires the correct PIN hash or the account password, checked on the server.
- `sender_blocked_in_conversation(conversation_id)`: true when the other person in a two-person chat has blocked the sender.

4. Changed Policies
- `messages_insert`: a blocked sender cannot post into a two-person chat with the person who blocked them. The blocker can still message the blocked user.

Security
- Users cannot change `self_suspended` or `is_suspended` directly.
- Suspended accounts remain blocked from creating messages and admin actions by existing rules.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS self_suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_self_suspension_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    IF current_setting('bubble.self_suspension', true) IS DISTINCT FROM 'on' THEN
      NEW.self_suspended := false;
    END IF;
  ELSIF current_setting('bubble.self_suspension', true) IS DISTINCT FROM 'on' THEN
    NEW.self_suspended := OLD.self_suspended;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_self_suspension_flag ON public.profiles;
CREATE TRIGGER guard_self_suspension_flag
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_self_suspension_flag();

CREATE OR REPLACE FUNCTION public.set_own_suspension(
  p_suspended boolean,
  p_pin_hash text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  prof public.profiles%ROWTYPE;
  verified boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE user_id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  PERFORM set_config('bubble.self_suspension', 'on', true);

  IF p_suspended THEN
    UPDATE public.profiles
    SET is_suspended = true, suspended_at = now(), self_suspended = true
    WHERE user_id = uid;
    RETURN;
  END IF;

  IF NOT (prof.is_suspended AND prof.self_suspended) THEN
    RAISE EXCEPTION 'This account is not suspended by its owner';
  END IF;

  IF p_pin_hash IS NOT NULL AND prof.pin_hash IS NOT NULL AND p_pin_hash = prof.pin_hash THEN
    verified := true;
  END IF;

  IF NOT verified AND p_password IS NOT NULL THEN
    SELECT u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
    INTO verified
    FROM auth.users u
    WHERE u.id = uid;
    verified := COALESCE(verified, false);
  END IF;

  IF NOT verified THEN
    RAISE EXCEPTION 'Incorrect PIN or password';
  END IF;

  UPDATE public.profiles
  SET is_suspended = false, suspended_at = NULL, self_suspended = false
  WHERE user_id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_own_suspension(boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_suspension(boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sender_blocked_in_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    JOIN public.user_blocks ub ON ub.blocker_id = cm.user_id AND ub.blocked_id = auth.uid()
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id <> auth.uid()
  )
  AND (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = p_conversation_id) = 2;
$$;

REVOKE EXECUTE ON FUNCTION public.sender_blocked_in_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sender_blocked_in_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND is_conversation_member(conversation_id)
  AND NOT public.sender_blocked_in_conversation(conversation_id)
);

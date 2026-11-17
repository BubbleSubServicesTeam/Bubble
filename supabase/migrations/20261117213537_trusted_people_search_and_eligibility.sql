/*
# Trusted people search with eligibility and email verification

1. New Functions
- `search_profiles_for_trust(query)`: given a name fragment or exact email, returns
  candidate users with their avatar. Results are limited to 10 rows and ordered by
  display name. For each candidate it also returns:
  - `found_email` — the candidate's account email, but only when the candidate has
    NOT blocked the caller (so a blocked user can never see it).
  - `is_eligible` — true when the caller has marked the candidate as a close friend
    (contact_preferences.is_close_friend) AND the caller shares a conversation with
    the candidate that has had messages exchanged on at least 3 distinct days.
- `eligible_days_with(p_profile_id)`: returns the number of distinct days on which
  messages were sent in conversations shared between the caller and that profile.

2. Security
- Both functions are SECURITY DEFINER with fixed search paths.
- `search_profiles_for_trust` and `eligible_days_with` are limited to signed-in
  users; anonymous callers are refused.
- Emails of users who blocked the caller are never returned.
- This migration is idempotent.

Important notes
- The client decides what to do with `is_eligible`; nothing here writes to
  `trusted_contacts`.
*/

CREATE OR REPLACE FUNCTION public.search_profiles_for_trust(p_query text)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  found_email text,
  is_eligible boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    CASE WHEN blocked.blocker_id IS NULL THEN u.email END AS found_email,
    (cp.is_close_friend AND activity_days.days >= 3) AS is_eligible
  FROM profiles p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT 1 AS blocker_id FROM user_blocks
    WHERE blocker_id = p.user_id AND blocked_id = auth.uid()
    LIMIT 1
  ) blocked ON true
  LEFT JOIN LATERAL (
    SELECT contact_preferences.is_close_friend
    FROM contact_preferences
    WHERE user_id = auth.uid() AND contact_id = p.user_id
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT date_trunc('day', m.created_at))::int AS days
    FROM messages m
    JOIN conversation_members mine
      ON mine.conversation_id = m.conversation_id AND mine.user_id = auth.uid()
    JOIN conversation_members theirs
      ON theirs.conversation_id = m.conversation_id AND theirs.user_id = p.user_id
    WHERE m.sender_id IN (auth.uid(), p.user_id)
      AND m.deleted_at IS NULL
  ) activity_days ON true
  WHERE p.user_id <> auth.uid()
    AND (
      p.display_name ILIKE '%' || trim(p_query) || '%'
      OR (u.email IS NOT NULL AND lower(u.email) = lower(trim(p_query)))
    )
  ORDER BY p.display_name
  LIMIT 10;
$$;

REVOKE EXECUTE ON FUNCTION public.search_profiles_for_trust(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_for_trust(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.eligible_days_with(p_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT date_trunc('day', m.created_at))::int
  FROM messages m
  JOIN conversation_members mine
    ON mine.conversation_id = m.conversation_id AND mine.user_id = auth.uid()
  JOIN conversation_members theirs
    ON theirs.conversation_id = m.conversation_id AND theirs.user_id = p_profile_id
  WHERE m.sender_id IN (auth.uid(), p_profile_id)
    AND m.deleted_at IS NULL
$$;

REVOKE EXECUTE ON FUNCTION public.eligible_days_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eligible_days_with(uuid) TO authenticated;

/*
# Read access for self-suspension flag and live block updates

1. Grants
- `profiles.self_suspended` is readable by signed-in users so their own app can show the right suspension controls.
- Signed-in users cannot write `self_suspended` directly; only `set_own_suspension` changes it.

2. Realtime
- `user_blocks` is published to realtime so block changes reach open screens without a reload. Row access still follows the existing rule that users only see blocks they created.
*/

GRANT SELECT (self_suspended) ON public.profiles TO authenticated;
REVOKE UPDATE (self_suspended) ON public.profiles FROM authenticated;
REVOKE INSERT (self_suspended) ON public.profiles FROM authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;

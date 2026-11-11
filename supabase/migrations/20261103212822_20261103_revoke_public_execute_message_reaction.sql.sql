/*
# Remove public execute on message reaction function

1. Summary
- The reaction toggle function was still callable by signed-out requests through the public role's default permission, which the earlier anonymous revoke did not cover.

2. Security changes
- REVOKE EXECUTE on toggle_message_reaction from PUBLIC and anon.
- Signed-in users keep execute access.

3. Notes
- No data is changed.
*/

REVOKE EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) TO authenticated;

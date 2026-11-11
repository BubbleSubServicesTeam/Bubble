/*
# Block suspended accounts from creating API keys and client IDs

1. Changed Policies
- `api_keys`: the insert policy now also requires that the signed-in account is not suspended.
- `oauth_clients`: the insert policy now also requires that the signed-in account is not suspended.

2. Security
- Enforced in the database, so the restriction cannot be bypassed from the app.
- Revoking existing keys and client IDs is still allowed for suspended accounts.
- Select, update and delete policies are unchanged.
*/

DROP POLICY IF EXISTS "insert_own_api_keys" ON api_keys;
CREATE POLICY "insert_own_api_keys" ON api_keys FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_suspended = true
  )
);

DROP POLICY IF EXISTS "insert_own_oauth_clients" ON oauth_clients;
CREATE POLICY "insert_own_oauth_clients" ON oauth_clients FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_suspended = true
  )
);

/*
# Enable chat scopes for existing Bubble OAuth clients

## Purpose
Allow previously registered Bubble Client IDs to request the new chat permissions.
The authorization page still requires the Bubble account owner to approve each requested
permission, so this change does not silently grant an external website access.

## Modified data
- `oauth_clients.scopes`: appends `chats.read` and `chats.write` to existing client scope
  lists when those scopes are not already present.

## Security
- No new tables, columns, policies, or grants are created.
- Chat access remains protected by OAuth authorization-code consent and the access-token
  scope checks in the OAuth provider.
- API key secrets remain unavailable to OAuth clients.

## Notes
1. Existing custom scopes are preserved.
2. The update is idempotent and will not add duplicate scope values.
*/

UPDATE public.oauth_clients
SET scopes = ARRAY(
  SELECT DISTINCT scope
  FROM unnest(
    COALESCE(scopes, ARRAY['openid', 'profile', 'email']::text[])
    || ARRAY['chats.read', 'chats.write']::text[]
  ) AS scope
)
WHERE NOT (
  COALESCE(scopes, ARRAY['openid', 'profile', 'email']::text[]) @> ARRAY['chats.read', 'chats.write']::text[]
);
/*
# Add OAuth client websites and callback sublinks

## Purpose
OAuth clients need a main website plus one or more exact callback links. This lets an app
register a website such as `https://github.com` and callback sublinks such as
`https://github.com/example/project/oauth/callback` without treating every path on the
website as trusted.

## Modified table
- `oauth_clients`
- Adds `website_url`, the app's main public website.
- Existing `redirect_uris` remains the exact allowlist of callback sublinks.

## Security
- The OAuth provider continues to compare redirect URIs by exact string match.
- No wildcard or prefix matching is added.
- Existing RLS policies remain in force.
*/

ALTER TABLE public.oauth_clients
  ADD COLUMN IF NOT EXISTS website_url text;

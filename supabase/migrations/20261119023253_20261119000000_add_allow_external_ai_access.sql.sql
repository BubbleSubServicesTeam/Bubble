/*
# Add "allow outside platforms" privacy switch to profiles

1. Modified Tables
- `profiles`: new column `allow_external_ai_access` (boolean, NOT NULL, default false).
  False (default) = keep end-to-end encryption private. True = the user has
  opted in to letting outside platforms (Grok, Claude, etc.) access their
  messages and personal info.

2. Security
- The new column is selectable through existing table-level SELECT grants.
- UPDATE on profiles is column-restricted for the signed-in role, so this
  migration explicitly grants UPDATE on the new column to `authenticated`.
  RLS ownership policies still apply; no policy changes needed.

3. Notes
- Default is false, matching the "keep end-to-end encryption" default.
- Idempotent via IF NOT EXISTS.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_external_ai_access boolean NOT NULL DEFAULT false;

GRANT UPDATE (allow_external_ai_access) ON profiles TO authenticated;
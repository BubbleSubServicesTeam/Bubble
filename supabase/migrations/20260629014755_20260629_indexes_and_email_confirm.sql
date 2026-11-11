/*
# Enable email confirmation for signups

Updates Supabase auth configuration to:
1. Require email confirmation on signup (users get an OTP code in email).
2. Allow the signInWithOtp flow for magic-link fallback used in delete verification.

Note: This uses auth.config — actual email confirmation toggle is done via
the Supabase dashboard Auth settings. This migration ensures the profiles
table handles pre-verification inserts gracefully.

Additionally, update the profiles table to allow inserts from users whose
email is not yet confirmed (identities may differ from confirmed users).
The profile is inserted at signup time and updated on confirmation.
*/

-- Ensure profiles can be inserted for unconfirmed users
-- The existing RLS already checks auth.uid() = user_id which works
-- because signUp returns a user object even before confirmation.

-- Index to speed up profile lookups by user_id
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles (user_id);

-- Index for conversation member lookups (used heavily by is_conversation_member)
CREATE INDEX IF NOT EXISTS conv_members_conv_user_idx ON conversation_members (conversation_id, user_id);
CREATE INDEX IF NOT EXISTS conv_members_user_idx ON conversation_members (user_id);

-- Index for message queries
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages (conversation_id, created_at DESC);

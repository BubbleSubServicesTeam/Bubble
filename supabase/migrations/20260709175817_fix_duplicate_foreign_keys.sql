/*
# Fix duplicate foreign keys pointing to auth.users

## Problem
The original schema created FKs from conversation_members.user_id and 
messages.sender_id to auth.users. Later migration added new FKs to 
public.profiles but never dropped the old ones.

PostgREST uses FK names for join detection. When there are multiple FKs 
on the same column, PostgREST may pick the wrong one (auth.users) which
is not readable by regular users, causing joins to fail and names to 
show as "Unknown".

## Fix
1. Drop old FKs to auth.users
2. Keep only the new FKs to public.profiles

NOTE: We can't reference auth.users directly in ALTER TABLE DROP CONSTRAINT
when using the Supabase MCP tools, so we use the constraint names directly.
*/

-- Drop the old FKs that point to auth.users
-- These were created by the original schema but never removed
ALTER TABLE public.conversation_members 
  DROP CONSTRAINT IF EXISTS conversation_members_user_id_fkey;

ALTER TABLE public.messages 
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

-- Verify the correct FKs exist (they should, from previous migration)
-- conversation_members_profile_user_id_fkey -> profiles.user_id
-- messages_profile_sender_id_fkey -> profiles.user_id

-- Also add FKs for notifications.sender_id to enable joins
-- First check if profiles entry exists for the foreign key
DO $$
BEGIN
  -- Add FK from notifications.sender_id to profiles.user_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notifications_sender_profile_fkey'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_sender_profile_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add FKs from conversation_members and messages to profiles
-- This enables Supabase PostgREST joins (profiles!conversation_members_user_id_fkey, profiles!messages_sender_id_fkey)
-- The existing FKs point to auth.users, not profiles, so joins fail and names show as "Unknown"

-- Clean up any orphaned conversation_members rows (user_id not in profiles)
DELETE FROM public.conversation_members
WHERE user_id NOT IN (SELECT user_id FROM public.profiles);

-- Add FK: conversation_members.user_id -> profiles.user_id
ALTER TABLE public.conversation_members
  ADD CONSTRAINT conversation_members_profile_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Clean up any orphaned messages rows (sender_id not in profiles)
DELETE FROM public.messages
WHERE sender_id NOT IN (SELECT user_id FROM public.profiles);

-- Add FK: messages.sender_id -> profiles.user_id
ALTER TABLE public.messages
  ADD CONSTRAINT messages_profile_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

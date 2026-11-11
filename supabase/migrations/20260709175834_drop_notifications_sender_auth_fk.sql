-- Drop the old FK from notifications.sender_id to auth.users
ALTER TABLE public.notifications 
  DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;
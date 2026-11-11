-- Add is_self_chat column to conversations
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS is_self_chat boolean DEFAULT false;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_self_chat 
  ON public.conversations(is_self_chat, created_by) 
  WHERE is_self_chat = true;
-- Add code_language column to messages for code snippet messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS code_language text;

-- Allow 'code' as a valid message_type
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text','image','gif','voicemail','call_started','call_ended','file','poll','form','money','iframe','code'));

/*
# Allow location messages in chats

## Summary
Lets people send a meeting point as a chat message. Location messages store the
coordinates and show an embedded map in the conversation.

## Modified Tables
- `messages`: the allowed `message_type` values now include `location`.
  Existing rows are unaffected.

## Security
No changes to row level security or grants.
*/

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text','image','gif','voicemail','call_started','call_ended','file','poll','form','money','iframe','code','location'));

/*
# Clean up duplicate self-chats and prevent recurrence

## Problem
The `ensureSelfChat` function used `.maybeSingle()` to find an existing
self-chat. When duplicates already existed, `.maybeSingle()` threw an error
that was silently ignored, so a NEW self-chat was created on every app load.
One user accumulated 887 duplicate self-chats.

## Changes
1. For each user who owns multiple self-chat conversations, keep only the
   newest one (by created_at) and delete the rest. This removes all duplicate
   self-chat rows while preserving each user's most recent notes conversation.
2. Add a unique partial index on `conversations(created_by)` filtered to
   `is_self_chat = true` so the database itself rejects future duplicates.
3. The RPC `create_conversation` already checks for existing DMs but does NOT
   check for existing self-chats — this index enforces uniqueness at the DB
   level regardless of client/RPC logic.

## Safety
- Only deletes rows where `is_self_chat = true` AND there is a newer
  self-chat for the same `created_by`. No messages or data from the kept
  conversation are touched.
- The unique index is created after cleanup so it won't fail on existing dupes.
*/

-- Step 1: Delete all but the newest self-chat per user
DELETE FROM conversations
WHERE is_self_chat = true
  AND id NOT IN (
    SELECT DISTINCT ON (created_by) id
    FROM conversations
    WHERE is_self_chat = true
    ORDER BY created_by, created_at DESC
  );

-- Step 2: Add unique partial index to prevent future duplicates
-- (Postgres supports partial unique indexes, so this only applies to self-chats)
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_self_chat_per_user
  ON conversations (created_by)
  WHERE is_self_chat = true;

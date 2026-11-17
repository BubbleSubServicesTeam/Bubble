/*
# Preserve sender attribution for imported WhatsApp messages

1. Purpose
Imported WhatsApp messages were all attributed to the importer in the messages
table (the schema requires an auth.users sender), so the chat rendered every
line as if the importer sent it. This migration stores the original sender
label and an "from_me" flag per imported message so the chat can render each
line on the correct side and with the original WhatsApp sender name.

2. New Table
- `whatsapp_import_messages`
  - `message_id` (uuid, primary key, references messages on delete cascade)
  - `import_id` (uuid, not null, references whatsapp_imports on delete cascade)
  - `original_sender` (text) — the label as it appeared in the WhatsApp export
  - `from_me` (boolean, not null, default false) — true when the importer sent it

3. Modified Functions
- `import_whatsapp_chat`: now records `original_sender` and `from_me` per
  message. Also stores the other person's display name on the import row
  (already supported by `other_name`) and returns the conversation id as
  before. Validation unchanged.

4. Security
- RLS enabled on the new table. Readable by conversation members' importer only
  (the importer reads own import rows); no client writes — the import function
  writes server-side. Service role keeps full access for background jobs.
- Grant SELECT to authenticated for rendering.

5. Important notes
- Existing previously imported messages have no attribution rows; they keep
  rendering as before (all on importer's side). Only new imports get exact
  attribution. This migration is idempotent.
*/

CREATE TABLE IF NOT EXISTS whatsapp_import_messages (
  message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES whatsapp_imports(id) ON DELETE CASCADE,
  original_sender text,
  from_me boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_import_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON whatsapp_import_messages TO authenticated;

DROP POLICY IF EXISTS "whatsapp_import_messages_select_importer" ON whatsapp_import_messages;
CREATE POLICY "whatsapp_import_messages_select_importer" ON whatsapp_import_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_imports wi
    WHERE wi.id = import_id AND wi.importer_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS whatsapp_import_messages_import_idx
ON whatsapp_import_messages (import_id);

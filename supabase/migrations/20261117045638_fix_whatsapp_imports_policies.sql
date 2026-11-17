/*
# Fix whatsapp_imports policies to not read locked phone column directly

1. Purpose
The previous SELECT/UPDATE policies on whatsapp_imports used a subquery on
profiles.phone_number, whose direct reads are revoked from all roles by an
earlier security migration. Those policies would error at runtime.

2. Changes
- SELECT policy: importer sees own imports only.
- UPDATE policy: removed entirely — claiming happens exclusively through the
  SECURITY DEFINER `claim_whatsapp_imports()` RPC, which performs the phone
  match server-side.
- Discovery of claimable chats happens exclusively through the
  `get_pending_imports_for_me()` RPC, which is SECURITY DEFINER and can read
  the phone column safely.

3. Security
- No new grants. Direct UPDATE grant on the table is revoked since no client
  path needs it.

4. Notes
- Idempotent; safe to re-run.
*/

DROP POLICY IF EXISTS "whatsapp_imports_select_importer" ON whatsapp_imports;
DROP POLICY IF EXISTS "whatsapp_imports_update_claimer" ON whatsapp_imports;

CREATE POLICY "whatsapp_imports_select_importer" ON whatsapp_imports FOR SELECT
TO authenticated
USING (importer_id = auth.uid());

REVOKE UPDATE ON whatsapp_imports FROM authenticated;

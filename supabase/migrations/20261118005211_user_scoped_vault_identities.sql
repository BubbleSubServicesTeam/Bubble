/*
# User-scoped message vault identities

1. Purpose
Message encryption is moving from per-device keys to per-account keys:
- Every member of a chat can read its messages, from any device they sign in on.
- A hacker with database access still cannot read anything, because each
  account's private key is stored wrapped under a key derived from that
  account's password (PBKDF2 + AES-GCM). The plaintext password never
  touches the database.

2. New Table
- `vault_identities`: one row per account.
  - `public_key`: ECDH P-256 public key (safe to share within conversations).
  - `wrapped_private_key`: { iv, c, salt } — the private key encrypted with a
    password-derived key.

3. RPC
- `get_conversation_vault_identities(p_conversation_id)` returns member
  user_ids and public keys for a conversation, only when the caller is a
  member. Used to seal a message key for every participant.
- `get_conversation_vault_devices` is dropped; per-device sealing is retired.

4. Security
- RLS on vault_identities: each account can read/insert/update only its own
  row; nobody can read another account's wrapped private key through the API.
- The RPC is SECURITY DEFINER with a fixed search_path, callable only by
  authenticated members of the conversation, and exposes public keys only.
*/

CREATE TABLE public.vault_identities (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key jsonb NOT NULL,
  wrapped_private_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_identities ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.vault_identities TO authenticated;

CREATE POLICY "select_own_vault_identity" ON public.vault_identities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_vault_identity" ON public.vault_identities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_vault_identity" ON public.vault_identities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_conversation_vault_identities(p_conversation_id uuid)
RETURNS TABLE (user_id uuid, public_key jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vd.user_id, vd.public_key
  FROM vault_identities vd
  JOIN conversation_members cm ON cm.user_id = vd.user_id
  WHERE cm.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM conversation_members me
      WHERE me.conversation_id = p_conversation_id AND me.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_conversation_vault_identities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_vault_identities(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_conversation_vault_devices(uuid);

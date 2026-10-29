/*
# Add fingerprint sharing requests

## What this does
Adds a `fingerprint_requests` table so one Bubble user can request another
user's fingerprint as an unlock option for their account (e.g. trusted contact,
spouse). The recipient can accept or decline. When accepted, the requester
gets a fingerprint credential registered on their account for that person.

## New Tables
- `fingerprint_requests`
  - `id` (uuid, primary key)
  - `requester_id` (uuid) — who wants to add the fingerprint
  - `recipient_id` (uuid) — whose fingerprint is being requested
  - `status` (text) — 'pending' | 'accepted' | 'declined'
  - `label` (text) — name label for the fingerprint
  - `created_at` (timestamptz)
  - `responded_at` (timestamptz, nullable)

## Security
- RLS enabled.
- 4 CRUD policies scoped to authenticated users.
- Users can only see requests where they are the requester OR the recipient.
- Only the recipient can update the status (accept/decline).
*/

CREATE TABLE IF NOT EXISTS fingerprint_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  label text NOT NULL DEFAULT 'Trusted Contact',
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE fingerprint_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fp_requests" ON fingerprint_requests;
CREATE POLICY "select_own_fp_requests"
ON fingerprint_requests FOR SELECT
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "insert_own_fp_requests" ON fingerprint_requests;
CREATE POLICY "insert_own_fp_requests"
ON fingerprint_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "update_own_fp_requests" ON fingerprint_requests;
CREATE POLICY "update_own_fp_requests"
ON fingerprint_requests FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "delete_own_fp_requests" ON fingerprint_requests;
CREATE POLICY "delete_own_fp_requests"
ON fingerprint_requests FOR DELETE
TO authenticated
USING (auth.uid() = requester_id);

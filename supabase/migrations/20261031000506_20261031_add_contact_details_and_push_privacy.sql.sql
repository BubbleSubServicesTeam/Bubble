/*
# Per-viewer contact details and push notification privacy

1. New tables
- `contact_details`: private notes a user keeps about a contact (phone, street address, city, state, postal code, country). Saved from chat autofill or the contact form. Only the user who wrote them can read them.

2. Modified tables
- `profiles`: adds `push_show_preview` and `push_show_sender` (both default true). When false, push notifications hide the message text or the sender name.

3. Security
- `contact_details` has RLS enabled with four owner-scoped policies, granted to `authenticated` only.
- Profile privacy columns are covered by the existing owner-only profile update policy.
*/

CREATE TABLE IF NOT EXISTS public.contact_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_details_user_contact_unique UNIQUE (user_id, contact_id)
);

CREATE INDEX IF NOT EXISTS contact_details_contact_id_idx ON public.contact_details(contact_id);

ALTER TABLE public.contact_details ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_details TO authenticated;

DROP POLICY IF EXISTS "select_own_contact_details" ON public.contact_details;
CREATE POLICY "select_own_contact_details" ON public.contact_details
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_contact_details" ON public.contact_details;
CREATE POLICY "insert_own_contact_details" ON public.contact_details
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_contact_details" ON public.contact_details;
CREATE POLICY "update_own_contact_details" ON public.contact_details
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_contact_details" ON public.contact_details;
CREATE POLICY "delete_own_contact_details" ON public.contact_details
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_show_preview boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_show_sender boolean NOT NULL DEFAULT true;

/*
# Create push_subscriptions table for Web Push notifications

1. New Tables
- `push_subscriptions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to auth.uid(), FK to auth.users)
  - `endpoint` (text, NOT NULL — the push service URL, unique per subscription)
  - `p256dh_key` (text, NOT NULL — public key from browser PushSubscription)
  - `auth_key` (text, NOT NULL — auth secret from browser PushSubscription)
  - `device_type` (text — browser/device info for debugging)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `push_subscriptions`.
- Owner-scoped CRUD: each authenticated user can only manage their own push subscriptions.

3. Important Notes
- When a user opens the app, the browser subscribes to Web Push and stores the subscription here.
- When a notification is inserted, a database trigger calls an edge function to send the push to all of the recipient's subscriptions.
- This enables real push notifications even when the app is closed, on iOS (PWA), Android, Mac, and Windows.
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  device_type text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_subs" ON push_subscriptions;
CREATE POLICY "select_own_push_subs" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_subs" ON push_subscriptions;
CREATE POLICY "insert_own_push_subs" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_push_subs" ON push_subscriptions;
CREATE POLICY "update_own_push_subs" ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_subs" ON push_subscriptions;
CREATE POLICY "delete_own_push_subs" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);

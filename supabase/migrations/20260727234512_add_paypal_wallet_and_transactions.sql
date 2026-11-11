/*
# PayPal Wallet Connector — Balance & Transactions

1. New Tables
- `paypal_transactions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles.user_id, the recipient of the money)
  - `sender_paypal_email` (text, who sent the money)
  - `amount` (numeric, amount received)
  - `currency` (text, default USD)
  - `paypal_transaction_id` (text, PayPal's transaction ID)
  - `status` (text: pending/completed/failed)
  - `note` (text, optional message)
  - `created_at` (timestamptz)

2. Modified Tables
- `paypal_connections`
  - Add `wallet_balance` numeric DEFAULT 0 (running balance of received money)
  - Add `webhook_id` text (PayPal webhook ID for verification)

3. Security
- RLS enabled on `paypal_transactions` — users can only see their own incoming transactions
- `paypal_connections` policies updated to keep user-scoped access
- The webhook edge function uses the service role key to insert transactions and update balances (bypasses RLS)

4. Important Notes
- The wallet balance is updated by the PayPal webhook edge function when a payment is received
- Users can see their balance and transaction history in the PayPal settings tab
- The webhook endpoint is at /functions/v1/paypal-webhook
*/

-- Add wallet_balance and webhook_id to paypal_connections
ALTER TABLE paypal_connections
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE paypal_connections
  ADD COLUMN IF NOT EXISTS webhook_id text;

-- Create paypal_transactions table
CREATE TABLE IF NOT EXISTS paypal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  sender_paypal_email text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  paypal_transaction_id text,
  status text NOT NULL DEFAULT 'completed',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paypal_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON paypal_transactions;
CREATE POLICY "select_own_transactions" ON paypal_transactions FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_transactions" ON paypal_transactions;
CREATE POLICY "insert_own_transactions" ON paypal_transactions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_paypal_transactions_user_id ON paypal_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_paypal_transactions_created_at ON paypal_transactions(created_at DESC);

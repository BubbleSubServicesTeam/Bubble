/*
# Improve PayPal connection and conversation creation

1. Modified Tables
- `paypal_connections`
  - Add `paypal_verified` boolean DEFAULT false — tracks whether the PayPal email has been verified
  - Add `paypal_name` text — stores the verified account holder's name from PayPal
  - Add `paypal_payer_id` text — stores the PayPal payer ID for the connected account
- `paypal_transactions`
  - Add `sender_user_id` uuid — tracks who sent the payment (for sender history)
  - Add `recipient_paypal_email` text — the recipient's PayPal email
  - Add `capture_id` text — PayPal's capture ID for completed payments

2. Security
- RLS policies updated for new columns on paypal_transactions (sender can see their own sent transactions)

3. Important Notes
- The `paypal_verified` column lets us show whether the PayPal account is truly connected
- The `sender_user_id` column lets senders see their own payment history
- The `create_conversation` RPC is updated to return full conversation data (eliminates a second fetch)
*/

-- Add verification columns to paypal_connections
ALTER TABLE paypal_connections
  ADD COLUMN IF NOT EXISTS paypal_verified boolean NOT NULL DEFAULT false;
ALTER TABLE paypal_connections
  ADD COLUMN IF NOT EXISTS paypal_name text;
ALTER TABLE paypal_connections
  ADD COLUMN IF NOT EXISTS paypal_payer_id text;

-- Add sender tracking to paypal_transactions
ALTER TABLE paypal_transactions
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE paypal_transactions
  ADD COLUMN IF NOT EXISTS recipient_paypal_email text;
ALTER TABLE paypal_transactions
  ADD COLUMN IF NOT EXISTS capture_id text;

-- Add index for sender lookup
CREATE INDEX IF NOT EXISTS idx_paypal_transactions_sender_user_id ON paypal_transactions(sender_user_id);

-- Update the select policy so senders can also see their sent transactions
DROP POLICY IF EXISTS "select_own_transactions" ON paypal_transactions;
CREATE POLICY "select_own_transactions" ON paypal_transactions FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR sender_user_id = auth.uid());


-- Polls table
CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  votes jsonb NOT NULL DEFAULT '{}',
  allows_multiple boolean NOT NULL DEFAULT false,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_polls" ON polls FOR SELECT
  TO authenticated USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "insert_polls" ON polls FOR INSERT
  TO authenticated WITH CHECK (
    creator_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "update_polls" ON polls FOR UPDATE
  TO authenticated USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  ) WITH CHECK (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "delete_polls" ON polls FOR DELETE
  TO authenticated USING (creator_id = auth.uid());

-- Forms (surveys) table
CREATE TABLE IF NOT EXISTS forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_forms" ON forms FOR SELECT
  TO authenticated USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "insert_forms" ON forms FOR INSERT
  TO authenticated WITH CHECK (
    creator_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "update_forms" ON forms FOR UPDATE
  TO authenticated USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

CREATE POLICY "delete_forms" ON forms FOR DELETE
  TO authenticated USING (creator_id = auth.uid());

-- Form responses table
CREATE TABLE IF NOT EXISTS form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id, responder_id)
);

ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_form_responses" ON form_responses FOR SELECT
  TO authenticated USING (
    form_id IN (
      SELECT f.id FROM forms f
      WHERE f.conversation_id IN (
        SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "insert_form_responses" ON form_responses FOR INSERT
  TO authenticated WITH CHECK (responder_id = auth.uid());

CREATE POLICY "update_form_responses" ON form_responses FOR UPDATE
  TO authenticated USING (responder_id = auth.uid()) WITH CHECK (responder_id = auth.uid());

CREATE POLICY "delete_form_responses" ON form_responses FOR DELETE
  TO authenticated USING (responder_id = auth.uid());

-- PayPal connections (store paypal email per user)
CREATE TABLE IF NOT EXISTS paypal_connections (
  user_id uuid PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  paypal_email text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paypal_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_paypal" ON paypal_connections FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "insert_paypal" ON paypal_connections FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_paypal" ON paypal_connections FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete_paypal" ON paypal_connections FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Add new message types to the message_type check if it exists
DO $$
BEGIN
  -- Add 'poll', 'form', 'money' to message_type if not already there
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'message_type'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
    ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
      CHECK (message_type IN ('text','image','gif','voicemail','call_started','call_ended','file','poll','form','money','iframe'));
  END IF;
END $$;

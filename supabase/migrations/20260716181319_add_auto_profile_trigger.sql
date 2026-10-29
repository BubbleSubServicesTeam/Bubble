/*
# Auto-create profile on signup

## Purpose
Ensure every new auth user gets a profile row automatically, even if the
client-side insert fails or is slow. This prevents "Unknown" from appearing
in the UI when a profile hasn't been created yet.

## Changes

### New Function
- `handle_new_user_profile()` — a trigger function that fires AFTER INSERT on
  `auth.users`. It creates a corresponding row in `public.profiles` using the
  user's email and metadata (first_name, last_name, display_name from signup).

### New Trigger
- `on_auth_user_created` — fires AFTER INSERT on `auth.users`, calls
  `handle_new_user_profile()`.

### Important Notes
1. The trigger runs server-side, so it works even if the client crashes after
   signUp.
2. If a profile already exists (e.g. client inserted it first), the
   ON CONFLICT DO NOTHING clause makes it idempotent.
3. The display_name defaults to the email prefix if no metadata is provided.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_first_name text;
  v_last_name text;
  v_display_name text;
BEGIN
  v_first_name := COALESCE(new.raw_user_meta_data->>'first_name', '');
  v_last_name := COALESCE(new.raw_user_meta_data->>'last_name', '');
  v_display_name := COALESCE(
    new.raw_user_meta_data->>'display_name',
    NULLIF(TRIM(v_first_name || ' ' || v_last_name), ''),
    split_part(new.email, '@', 1)
  );

  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, status)
  VALUES (new.id, v_display_name, NULLIF(v_first_name, ''), NULLIF(v_last_name, ''), 'offline')
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

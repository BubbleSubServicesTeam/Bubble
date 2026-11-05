/*
# Admin panel, account suspension, and maintenance mode

1. Modified Tables
- `profiles`: adds `is_admin` (default false), `is_suspended` (default false), `suspended_at`.
- The account noahg@creatorshouse.org is marked as the admin.

2. New Tables
- `maintenance_settings`: single row (id = 1) with `enabled` and `message`. Readable by everyone, writable only through an admin function.

3. Functions
- `is_admin_user()` and `is_suspended_user()` report the signed-in user's status.
- `admin_list_users()`, `admin_set_suspended()`, `admin_delete_user()`, `admin_set_maintenance()` are admin-only and check the caller on every call.

4. Security
- A trigger stops ordinary signed-in users from setting or changing admin or suspension fields directly.
- Suspended users get a restrictive policy that blocks sending new messages. Account info and security settings stay editable.
- Admins cannot be suspended or deleted, and nobody can act on their own account from the admin panel.
- RLS is enabled on the new table, with SELECT granted only to anon and authenticated.

5. Notes
- Admin functions are granted only to signed-in users, and they re-check admin status inside the function.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

UPDATE public.profiles p
SET is_admin = true
WHERE p.user_id IN (SELECT u.id FROM auth.users u WHERE lower(u.email) = 'noahg@creatorshouse.org');

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.user_id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_suspended_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT p.is_suspended FROM public.profiles p WHERE p.user_id = auth.uid()), false);
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_suspended_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_suspended_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_admin OR NEW.is_suspended OR NEW.suspended_at IS NOT NULL THEN
        RAISE EXCEPTION 'Not authorized';
      END IF;
    ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_fields ON public.profiles;
CREATE TRIGGER protect_profile_admin_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_fields();

DROP POLICY IF EXISTS "suspended_users_cannot_send_messages" ON public.messages;
CREATE POLICY "suspended_users_cannot_send_messages" ON public.messages
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (NOT public.is_suspended_user());

CREATE TABLE IF NOT EXISTS public.maintenance_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT 'Sorry, Bubble is having maintenance right now. Please check back soon.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.maintenance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.maintenance_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.maintenance_settings TO anon, authenticated;

DROP POLICY IF EXISTS "maintenance_settings_select" ON public.maintenance_settings;
CREATE POLICY "maintenance_settings_select" ON public.maintenance_settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  is_admin boolean,
  is_suspended boolean,
  suspended_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p.user_id, u.email::text, p.display_name, p.is_admin, p.is_suspended, p.suspended_at, u.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_suspended(p_user_id uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot suspend your own account';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id AND p.is_admin) THEN
    RAISE EXCEPTION 'Admin accounts cannot be suspended';
  END IF;

  UPDATE public.profiles p
  SET is_suspended = p_suspended,
      suspended_at = CASE WHEN p_suspended THEN now() ELSE NULL END
  WHERE p.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account here';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id AND p.is_admin) THEN
    RAISE EXCEPTION 'Admin accounts cannot be deleted';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_maintenance(p_enabled boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.maintenance_settings m
  SET enabled = p_enabled,
      message = COALESCE(NULLIF(btrim(p_message), ''), m.message),
      updated_at = now()
  WHERE m.id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_suspended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_suspended(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_maintenance(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_maintenance(boolean, text) TO authenticated;

/*
# Tighten anonymous access and PayPal connection visibility

1. Summary
- Removes all table privileges from the anonymous (signed-out) role across the public schema. Every table already required a signed-in policy, so anonymous requests were never able to read or write data; this removes the grants themselves.
- Removes anonymous execute rights on every public function.
- Restricts the signed-in trigger function for new profiles so it is not callable directly through the API.
- PayPal connections: previously any signed-in user could read every row (email and verified status). Now a user can only read their own row. Sending money to someone else uses a new narrow function that returns only that person's PayPal email and verified flag.

2. Security changes
- REVOKE ALL on public tables from anon.
- REVOKE EXECUTE on public functions from anon.
- REVOKE EXECUTE on handle_new_user_profile from PUBLIC, anon, authenticated (it runs as a database trigger).
- paypal_connections: drops the "select_paypal" policy that allowed every signed-in user to read all rows; adds "select_own_paypal" limited to the owner.
- New function get_recipient_paypal(p_user_id): returns only paypal_email and paypal_verified for the requested user, callable by signed-in users only.

3. Notes
- No data is removed or altered.
- The app must call get_recipient_paypal wherever it previously read another user's PayPal connection.
*/

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "select_paypal" ON public.paypal_connections;
DROP POLICY IF EXISTS "select_own_paypal" ON public.paypal_connections;
CREATE POLICY "select_own_paypal" ON public.paypal_connections FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_recipient_paypal(p_user_id uuid)
RETURNS TABLE (paypal_email text, paypal_verified boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT pc.paypal_email::text, pc.paypal_verified::boolean
  FROM public.paypal_connections pc
  WHERE pc.user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_recipient_paypal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recipient_paypal(uuid) TO authenticated;

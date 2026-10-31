/*
# Enforce per-device location visibility

1. Overview
- Viewers can only see a granter's location through their individual devices.
- A device is visible when the share is enabled AND either no device allowlist exists (all devices) or the device is on the allowlist.

2. Modified tables
- `user_locations`: viewers no longer read the primary location row. Only the owner can read it.
- `user_device_locations`: the viewer SELECT policy now checks the device allowlist through a helper.

3. New functions
- `can_view_location_device(owner, device)`: SECURITY DEFINER helper so the policy can read the allowlist without exposing it to viewers. Executable by signed-in users only.

4. Security
- Owner-scoped policies remain unchanged.
- The helper runs with a fixed search_path and is not callable by anon or PUBLIC.
*/

CREATE OR REPLACE FUNCTION public.can_view_location_device(p_owner uuid, p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_shares ls
    WHERE ls.granter_id = p_owner
      AND ls.viewer_id = auth.uid()
      AND ls.enabled = true
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.location_share_devices d WHERE d.location_share_id = ls.id
        )
        OR EXISTS (
          SELECT 1 FROM public.location_share_devices d
          WHERE d.location_share_id = ls.id AND d.device_id = p_device_id
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_location_device(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_location_device(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "select_own_location" ON public.user_locations;
CREATE POLICY "select_own_location" ON public.user_locations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_device_locations" ON public.user_device_locations;
CREATE POLICY "select_own_device_locations" ON public.user_device_locations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.can_view_location_device(user_id, device_id)
  );

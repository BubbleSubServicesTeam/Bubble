/*
# Fix location RLS so viewers with granted shares can read coordinates

## Problem
The original user_locations and user_device_locations RLS policies only allowed
reading your own row (auth.uid() = user_id). When a user granted location access
to a friend, the friend could see the share was enabled but could NOT read the
granter's coordinates — the database blocked the SELECT.

## Fix
1. user_locations SELECT policy: allow reading your own row OR rows where
   someone has an enabled location_share granting you access.
2. user_device_locations SELECT policy: same pattern — allow reading your own
   rows OR rows where an enabled share grants you access.
3. Drop and recreate the affected SELECT policies (idempotent).

## Security
- RLS still enforces that only the owner can INSERT/UPDATE/DELETE their locations.
- Viewers can only SELECT coordinates when an explicit, enabled location_share exists.
- No new tables or columns.
*/

-- Fix user_locations SELECT policy
DROP POLICY IF EXISTS "select_own_location" ON user_locations;
CREATE POLICY "select_own_location" ON user_locations FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM location_shares ls
      WHERE ls.granter_id = user_locations.user_id
        AND ls.viewer_id = auth.uid()
        AND ls.enabled = true
    )
  );

-- Fix user_device_locations SELECT policy
DROP POLICY IF EXISTS "select_own_device_locations" ON public.user_device_locations;
CREATE POLICY "select_own_device_locations" ON public.user_device_locations
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM location_shares ls
      WHERE ls.granter_id = public.user_device_locations.user_id
        AND ls.viewer_id = auth.uid()
        AND ls.enabled = true
    )
  );

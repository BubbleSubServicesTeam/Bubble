/*
# Add device-scoped location sharing

1. New columns
- `location_shares.device_id` (text, nullable) — when set, the grant only covers that specific device. NULL means "all devices."

2. New tables
- `user_device_locations` — per-device GPS coordinates. One row per (user_id, device_id). The existing `user_locations` table stays as the primary/default location.
- `location_share_devices` — lets a granter allowlist which of their devices a viewer is allowed to see.

3. Security
- All new tables use owner-scoped RLS policies on auth.uid().
- `location_share_devices` is scoped through the parent location_share to the granter.

4. Notes
- A viewer can see a granter's device location if there is an enabled location_share AND a matching device entry (or the share has no device entries, meaning all devices).
*/

-- Add device_id to location_shares (nullable = all devices)
ALTER TABLE public.location_shares ADD COLUMN IF NOT EXISTS device_id text;

-- Per-device locations table
CREATE TABLE IF NOT EXISTS public.user_device_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_label text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

ALTER TABLE public.user_device_locations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_device_locations TO authenticated;

DROP POLICY IF EXISTS "select_own_device_locations" ON public.user_device_locations;
CREATE POLICY "select_own_device_locations" ON public.user_device_locations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_device_locations" ON public.user_device_locations;
CREATE POLICY "insert_own_device_locations" ON public.user_device_locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_device_locations" ON public.user_device_locations;
CREATE POLICY "update_own_device_locations" ON public.user_device_locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_device_locations" ON public.user_device_locations;
CREATE POLICY "delete_own_device_locations" ON public.user_device_locations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Allowlist of devices visible per location share
CREATE TABLE IF NOT EXISTS public.location_share_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_share_id uuid NOT NULL REFERENCES public.location_shares(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_share_id, device_id)
);

ALTER TABLE public.location_share_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_share_devices TO authenticated;

DROP POLICY IF EXISTS "select_own_share_devices" ON public.location_share_devices;
CREATE POLICY "select_own_share_devices" ON public.location_share_devices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.location_shares ls
    WHERE ls.id = location_share_id AND ls.granter_id = auth.uid()
  ));

DROP POLICY IF EXISTS "insert_own_share_devices" ON public.location_share_devices;
CREATE POLICY "insert_own_share_devices" ON public.location_share_devices
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.location_shares ls
    WHERE ls.id = location_share_id AND ls.granter_id = auth.uid()
  ));

DROP POLICY IF EXISTS "delete_own_share_devices" ON public.location_share_devices;
CREATE POLICY "delete_own_share_devices" ON public.location_share_devices
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.location_shares ls
    WHERE ls.id = location_share_id AND ls.granter_id = auth.uid()
  ));

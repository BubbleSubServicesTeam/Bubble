import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { parseDeviceInfo } from './deviceSessions';

export type DeviceLocation = {
  device_id: string;
  device_label: string | null;
  latitude: number;
  longitude: number;
  updated_at: string;
};

export type ViewerShare = {
  enabled: boolean;
  allowedDeviceIds: string[] | null;
};

export function getDeviceId(): string {
  const info = parseDeviceInfo();
  return `${info.deviceType}-${info.browser}-${info.os}`;
}

export function getDeviceLabel(): string {
  const info = parseDeviceInfo();
  return `${info.deviceType} · ${info.browser}`;
}

export function saveCurrentLocation(userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const updatedAt = new Date().toISOString();
        const [primary, device] = await Promise.all([
          supabase.from('user_locations').upsert({ user_id: userId, latitude, longitude, accuracy, updated_at: updatedAt }),
          supabase.from('user_device_locations').upsert(
            {
              user_id: userId,
              device_id: getDeviceId(),
              device_label: getDeviceLabel(),
              latitude,
              longitude,
              accuracy,
              updated_at: updatedAt,
            },
            { onConflict: 'user_id,device_id' },
          ),
        ]);
        resolve(!primary.error && !device.error);
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export async function fetchViewerShare(granterId: string, viewerId: string): Promise<ViewerShare | null> {
  const { data: share, error } = await supabase
    .from('location_shares')
    .select('id, enabled')
    .eq('granter_id', granterId)
    .eq('viewer_id', viewerId)
    .maybeSingle();
  if (error) throw error;
  if (!share) return null;

  const { data: devices, error: devError } = await supabase
    .from('location_share_devices')
    .select('device_id')
    .eq('location_share_id', share.id);
  if (devError) throw devError;

  return {
    enabled: share.enabled,
    allowedDeviceIds: devices && devices.length > 0 ? devices.map(d => d.device_id) : null,
  };
}

export async function setViewerShareEnabled(granterId: string, viewerId: string, enabled: boolean): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('location_shares')
    .select('id')
    .eq('granter_id', granterId)
    .eq('viewer_id', viewerId)
    .maybeSingle();
  if (findError) throw findError;

  const result = existing
    ? await supabase.from('location_shares').update({ enabled }).eq('id', existing.id)
    : await supabase.from('location_shares').insert({ granter_id: granterId, viewer_id: viewerId, enabled });
  if (result.error) throw result.error;
}

// An empty allowlist means every device is visible, so callers pass [] to mean "all devices".
export async function setViewerAllowedDevices(granterId: string, viewerId: string, deviceIds: string[]): Promise<void> {
  const { data: share, error: findError } = await supabase
    .from('location_shares')
    .select('id')
    .eq('granter_id', granterId)
    .eq('viewer_id', viewerId)
    .maybeSingle();
  if (findError) throw findError;
  if (!share) throw new Error('No location share exists for this contact');

  const { error: deleteError } = await supabase
    .from('location_share_devices')
    .delete()
    .eq('location_share_id', share.id);
  if (deleteError) throw deleteError;

  if (deviceIds.length === 0) return;
  const { error: insertError } = await supabase
    .from('location_share_devices')
    .insert(deviceIds.map(device_id => ({ location_share_id: share.id, device_id })));
  if (insertError) throw insertError;
}

export function useLocationSharing(otherUserId: string | null) {
  const { user } = useAuth();
  const [theirLocation, setTheirLocation] = useState<DeviceLocation | null>(null);
  const [theirShareEnabled, setTheirShareEnabled] = useState(false);
  const [theirDeviceLocations, setTheirDeviceLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocationData = useCallback(async () => {
    if (!user || !otherUserId) { setLoading(false); return; }
    setLoading(true);

    const { data: theirShare } = await supabase
      .from('location_shares')
      .select('enabled')
      .eq('granter_id', otherUserId)
      .eq('viewer_id', user.id)
      .maybeSingle();
    const enabled = theirShare?.enabled ?? false;
    setTheirShareEnabled(enabled);

    if (enabled) {
      const { data: devices } = await supabase
        .from('user_device_locations')
        .select('device_id, device_label, latitude, longitude, updated_at')
        .eq('user_id', otherUserId)
        .order('updated_at', { ascending: false });
      const list = (devices ?? []) as DeviceLocation[];
      setTheirDeviceLocations(list);
      setTheirLocation(list[0] ?? null);
    } else {
      setTheirDeviceLocations([]);
      setTheirLocation(null);
    }

    setLoading(false);
  }, [user, otherUserId]);

  useEffect(() => {
    fetchLocationData();
  }, [fetchLocationData]);

  useEffect(() => {
    if (!theirShareEnabled || !otherUserId) return;
    const channel = supabase
      .channel(`loc-${otherUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_device_locations',
        filter: `user_id=eq.${otherUserId}`,
      }, () => { fetchLocationData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [theirShareEnabled, otherUserId, fetchLocationData]);

  return {
    theirLocation,
    theirShareEnabled,
    theirDeviceLocations,
    loading,
    refresh: fetchLocationData,
  };
}

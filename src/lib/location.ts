import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { parseDeviceInfo } from './deviceSessions';

export type UserLocation = {
  latitude: number;
  longitude: number;
  updated_at: string;
  device_id?: string | null;
  device_label?: string | null;
};

export function getDeviceId(): string {
  const info = parseDeviceInfo();
  return `${info.deviceType}-${info.browser}-${info.os}`;
}

export function getDeviceLabel(): string {
  const info = parseDeviceInfo();
  return `${info.deviceType} · ${info.browser}`;
}

export type DeviceLocation = {
  device_id: string;
  device_label: string | null;
  latitude: number;
  longitude: number;
  updated_at: string;
};

export type LocationShareInfo = {
  id: string;
  viewer_id: string;
  enabled: boolean;
  allowed_device_ids: string[];
};

export function useLocationSharing(otherUserId: string | null) {
  const { user } = useAuth();
  const [myLocation, setMyLocation] = useState<UserLocation | null>(null);
  const [theirLocation, setTheirLocation] = useState<UserLocation | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [theirShareEnabled, setTheirShareEnabled] = useState(false);
  const [myDeviceLocations, setMyDeviceLocations] = useState<DeviceLocation[]>([]);
  const [theirDeviceLocations, setTheirDeviceLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLocationData = useCallback(async () => {
    if (!user || !otherUserId) { setLoading(false); return; }
    setLoading(true);

    // Check if I'm sharing with them
    const { data: myShare } = await supabase
      .from('location_shares')
      .select('id, enabled')
      .eq('granter_id', user.id)
      .eq('viewer_id', otherUserId)
      .maybeSingle();
    setShareEnabled(myShare?.enabled ?? false);

    // Check if they're sharing with me
    const { data: theirShare } = await supabase
      .from('location_shares')
      .select('id, enabled')
      .eq('granter_id', otherUserId)
      .eq('viewer_id', user.id)
      .maybeSingle();
    const theyShare = theirShare?.enabled ?? false;
    setTheirShareEnabled(theyShare);

    // My own location (primary)
    const { data: myLoc } = await supabase
      .from('user_locations')
      .select('latitude, longitude, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (myLoc) setMyLocation(myLoc as UserLocation);

    // My device locations
    const { data: myDevLocs } = await supabase
      .from('user_device_locations')
      .select('device_id, device_label, latitude, longitude, updated_at')
      .eq('user_id', user.id);
    setMyDeviceLocations((myDevLocs ?? []) as DeviceLocation[]);

    // Their location (only if they granted access)
    if (theyShare) {
      const { data: theirLoc } = await supabase
        .from('user_locations')
        .select('latitude, longitude, updated_at')
        .eq('user_id', otherUserId)
        .maybeSingle();
      setTheirLocation(theirLoc as UserLocation | null);

      // Their device locations
      const { data: theirDevLocs } = await supabase
        .from('user_device_locations')
        .select('device_id, device_label, latitude, longitude, updated_at')
        .eq('user_id', otherUserId);
      setTheirDeviceLocations((theirDevLocs ?? []) as DeviceLocation[]);
    } else {
      setTheirLocation(null);
      setTheirDeviceLocations([]);
    }

    setLoading(false);
  }, [user, otherUserId]);

  useEffect(() => {
    fetchLocationData();
  }, [fetchLocationData]);

  // Realtime subscription for their location
  useEffect(() => {
    if (!theirShareEnabled || !otherUserId) return;
    const channel = supabase
      .channel(`loc-${otherUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_locations',
        filter: `user_id=eq.${otherUserId}`,
      }, () => { fetchLocationData(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_device_locations',
        filter: `user_id=eq.${otherUserId}`,
      }, () => { fetchLocationData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [theirShareEnabled, otherUserId, fetchLocationData]);

  const updateMyLocation = useCallback(async (deviceId?: string) => {
    if (!user) return;
    if (!navigator.geolocation) return;
    const did = deviceId ?? getDeviceId();
    const dlabel = getDeviceLabel();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Update primary location
        await supabase.from('user_locations').upsert({
          user_id: user.id,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updated_at: new Date().toISOString(),
        });
        // Update device-specific location
        await supabase.from('user_device_locations').upsert({
          user_id: user.id,
          device_id: did,
          device_label: dlabel,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updated_at: new Date().toISOString(),
        });
        setMyLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          updated_at: new Date().toISOString(),
        });
        fetchLocationData();
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [user, fetchLocationData]);

  const toggleShare = useCallback(async (enabled: boolean) => {
    if (!user || !otherUserId) return;
    setShareEnabled(enabled);
    const { data: existing } = await supabase
      .from('location_shares')
      .select('id')
      .eq('granter_id', user.id)
      .eq('viewer_id', otherUserId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('location_shares')
        .update({ enabled })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('location_shares')
        .insert({ granter_id: user.id, viewer_id: otherUserId, enabled });
    }
    if (enabled) updateMyLocation();
  }, [user, otherUserId, updateMyLocation]);

  // Set which devices a viewer is allowed to see
  const setAllowedDevices = useCallback(async (viewerId: string, deviceIds: string[]) => {
    if (!user) return;
    const { data: share } = await supabase
      .from('location_shares')
      .select('id')
      .eq('granter_id', user.id)
      .eq('viewer_id', viewerId)
      .maybeSingle();
    if (!share) return;

    // Delete existing device entries
    await supabase.from('location_share_devices').delete().eq('location_share_id', share.id);

    // Insert new ones
    if (deviceIds.length > 0) {
      await supabase.from('location_share_devices').insert(
        deviceIds.map(did => ({ location_share_id: share.id, device_id: did }))
      );
    }
  }, [user]);

  // Get which devices are allowed for a viewer
  const getAllowedDevices = useCallback(async (viewerId: string): Promise<string[]> => {
    if (!user) return [];
    const { data: share } = await supabase
      .from('location_shares')
      .select('id')
      .eq('granter_id', user.id)
      .eq('viewer_id', viewerId)
      .maybeSingle();
    if (!share) return [];
    const { data: devs } = await supabase
      .from('location_share_devices')
      .select('device_id')
      .eq('location_share_id', share.id);
    return (devs ?? []).map(d => d.device_id);
  }, [user]);

  return {
    myLocation,
    theirLocation,
    shareEnabled,
    theirShareEnabled,
    myDeviceLocations,
    theirDeviceLocations,
    loading,
    toggleShare,
    updateMyLocation,
    setAllowedDevices,
    getAllowedDevices,
    refresh: fetchLocationData,
  };
}

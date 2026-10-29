import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type UserLocation = {
  latitude: number;
  longitude: number;
  updated_at: string;
};

export function useLocationSharing(otherUserId: string | null) {
  const { user } = useAuth();
  const [myLocation, setMyLocation] = useState<UserLocation | null>(null);
  const [theirLocation, setTheirLocation] = useState<UserLocation | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [theirShareEnabled, setTheirShareEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLocationData = useCallback(async () => {
    if (!user || !otherUserId) { setLoading(false); return; }
    setLoading(true);

    // Check if I'm sharing with them
    const { data: myShare } = await supabase
      .from('location_shares')
      .select('enabled')
      .eq('granter_id', user.id)
      .eq('viewer_id', otherUserId)
      .maybeSingle();
    setShareEnabled(myShare?.enabled ?? false);

    // Check if they're sharing with me
    const { data: theirShare } = await supabase
      .from('location_shares')
      .select('enabled')
      .eq('granter_id', otherUserId)
      .eq('viewer_id', user.id)
      .maybeSingle();
    const theyShare = theirShare?.enabled ?? false;
    setTheirShareEnabled(theyShare);

    // My own location
    const { data: myLoc } = await supabase
      .from('user_locations')
      .select('latitude, longitude, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (myLoc) setMyLocation(myLoc as UserLocation);

    // Their location (only if they granted access)
    if (theyShare) {
      const { data: theirLoc } = await supabase
        .from('user_locations')
        .select('latitude, longitude, updated_at')
        .eq('user_id', otherUserId)
        .maybeSingle();
      setTheirLocation(theirLoc as UserLocation | null);
    } else {
      setTheirLocation(null);
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [theirShareEnabled, otherUserId, fetchLocationData]);

  const updateMyLocation = useCallback(async () => {
    if (!user) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await supabase.from('user_locations').upsert({
          user_id: user.id,
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
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [user]);

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

  return {
    myLocation,
    theirLocation,
    shareEnabled,
    theirShareEnabled,
    loading,
    toggleShare,
    updateMyLocation,
    refresh: fetchLocationData,
  };
}

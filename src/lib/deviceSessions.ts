import { supabase } from './supabase';

export type DeviceSession = {
  id: string;
  user_id: string;
  device_type: string;
  browser: string;
  os: string;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
  session_token_hint: string | null;
};

type DeviceInfo = {
  deviceType: string;
  browser: string;
  os: string;
};

export function parseDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;

  let deviceType = 'Desktop';
  if (/iPad/.test(ua)) deviceType = 'iPad';
  else if (/iPhone/.test(ua)) deviceType = 'iPhone';
  else if (/iPod/.test(ua)) deviceType = 'iPod';
  else if (/Android/.test(ua)) {
    // Check if tablet vs phone
    if (/Tablet/.test(ua) || screen.width >= 768) deviceType = 'Android Tablet';
    else deviceType = 'Android Phone';
  }
  else if (/Mobile/.test(ua)) deviceType = 'Mobile';

  let browser = 'Unknown';
  if (/Edg/.test(ua)) browser = 'Edge';
  else if (/OPR|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome/.test(ua)) browser = 'Chrome';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua)) browser = 'Safari';

  let os = 'Unknown';
  if (/iPad/.test(ua) || /iPhone/.test(ua) || /iPod/.test(ua)) {
    // Try to get iOS version
    const match = ua.match(/OS (\d+)[_\.](\d+)/);
    os = match ? `iPadOS ${match[1]}.${match[2]}` : 'iPadOS';
    if (/iPhone/.test(ua)) os = match ? `iOS ${match[1]}.${match[2]}` : 'iOS';
    else if (/iPad/.test(ua)) os = match ? `iPadOS ${match[1]}.${match[2]}` : 'iPadOS';
    else os = match ? `iOS ${match[1]}.${match[2]}` : 'iOS';
  }
  else if (/Android/.test(ua)) {
    const match = ua.match(/Android (\d+)/);
    os = match ? `Android ${match[1]}` : 'Android';
  }
  else if (/Mac OS X/.test(ua)) {
    const match = ua.match(/Mac OS X (\d+)[_\.](\d+)/);
    os = match ? `macOS ${match[1]}.${match[2]}` : 'macOS';
  }
  else if (/Windows/.test(ua)) {
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    os = match ? `Windows ${match[1]}` : 'Windows';
  }
  else if (/Linux/.test(ua)) os = 'Linux';

  return { deviceType, browser, os };
}

/**
 * Register a device session on sign-in. Checks if this device (same device_type + browser + os)
 * is already known. If not, inserts a new session row and sends a notification.
 */
export async function registerDeviceSession(userId: string, accessToken: string): Promise<DeviceSession | null> {
  const info = parseDeviceInfo();
  const tokenHint = accessToken.slice(0, 12);

  // Mark all existing sessions as not current
  await supabase
    .from('user_device_sessions')
    .update({ is_current: false })
    .eq('user_id', userId);

  // Check if this device already has a session
  const { data: existing } = await supabase
    .from('user_device_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('device_type', info.deviceType)
    .eq('browser', info.browser)
    .eq('os', info.os)
    .maybeSingle();

  if (existing) {
    // Update existing session as current
    const { data, error } = await supabase
      .from('user_device_sessions')
      .update({
        is_current: true,
        last_active_at: new Date().toISOString(),
        session_token_hint: tokenHint,
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    if (data) return data as DeviceSession;
    return null;
  }

  // New device — insert session and send notification
  const { data, error } = await supabase
    .from('user_device_sessions')
    .insert({
      user_id: userId,
      device_type: info.deviceType,
      browser: info.browser,
      os: info.os,
      is_current: true,
      last_active_at: new Date().toISOString(),
      session_token_hint: tokenHint,
    })
    .select()
    .maybeSingle();

  if (error || !data) return null;

  // Send a notification to the user about the new device
  await supabase.from('notifications').insert({
    recipient_id: userId,
    sender_id: userId,
    notification_type: 'new_device',
    title: 'New device login',
    body: `A new device signed in to your account: ${info.deviceType} · ${info.browser} · ${info.os}`,
    conversation_id: null,
  });

  return data as DeviceSession;
}

export async function listDeviceSessions(userId: string): Promise<DeviceSession[]> {
  const { data, error } = await supabase
    .from('user_device_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false });
  if (error || !data) return [];
  return data as DeviceSession[];
}

export async function deleteDeviceSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_device_sessions')
    .delete()
    .eq('id', sessionId);
  return !error;
}

export async function updateSessionActivity(userId: string): Promise<void> {
  await supabase
    .from('user_device_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_current', true);
}

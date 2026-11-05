import { createClient } from '@supabase/supabase-js';
import type { TextEffect, TextEffectSpan } from './textEffects';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});

export type ContactVisibility = 'everyone' | 'close_friends' | 'nobody';

export type Profile = {
  id: string;
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  status: 'auto' | 'online' | 'away' | 'busy' | 'offline';
  status_message: string;
  last_seen: string;
  created_at: string;
  native_language: string | null;
  push_show_preview: boolean;
  push_show_sender: boolean;
  pin_hash: string | null;
  pin_length: number | null;
  pin_voluntary: boolean | null;
  fingerprint_enabled: boolean | null;
  unlock_preference: 'pin' | 'fingerprint' | 'both' | null;
  deletion_scheduled_at: string | null;
  deletion_cancelled_at: string | null;
  email?: string | null;
  phone_number?: string | null;
  phone_visibility?: ContactVisibility;
  address?: string | null;
  address_visibility?: ContactVisibility;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  unread_badge_enabled?: boolean | null;
  face_id_enabled?: boolean | null;
  auth_failed_attempts?: number;
  auth_locked_until?: string | null;
  pin_failed_attempts?: number;
  pin_locked_until?: string | null;
  password_failed_attempts?: number;
  password_locked_until?: string | null;
  is_admin?: boolean;
  is_suspended?: boolean;
};

// Contact fields (phone, address) are read only through RPCs, so profile reads must list columns explicitly.
export const PROFILE_COLUMNS = 'id, user_id, display_name, first_name, last_name, avatar_url, status, status_message, last_seen, created_at, native_language, push_show_preview, push_show_sender, pin_hash, pin_length, pin_voluntary, fingerprint_enabled, unlock_preference, deletion_scheduled_at, deletion_cancelled_at, unread_badge_enabled, face_id_enabled, phone_visibility, address_visibility, auth_failed_attempts, auth_locked_until, pin_failed_attempts, pin_locked_until, password_failed_attempts, password_locked_until, is_admin, is_suspended';

// Embedded profiles (message senders, member lists) use this list; `profiles(*)` fails for the signed-in role.
export const SENDER_PROFILE_COLUMNS = 'id, user_id, display_name, first_name, last_name, avatar_url, status, status_message, last_seen, created_at, native_language, phone_visibility, address_visibility, is_admin, is_suspended';

export function getDisplayName(profile: Profile | null | undefined, showFull = false): string {
  if (!profile) return '';
  if (showFull) {
    const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    return full || profile.display_name || profile.email?.split('@')[0] || 'Unknown';
  }
  return profile.first_name || profile.display_name || profile.email?.split('@')[0] || 'Unknown';
}

export function smartName(profile: Profile | null | undefined, _peers?: Profile[]): string {
  if (!profile) return 'Unknown';
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return full || profile.first_name || profile.display_name || profile.email?.split('@')[0] || 'Unknown';
}

export type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_self_chat: boolean;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members?: Profile[];
  last_message?: Message | null;
  unread_count?: number;
  history_visible_to_new_members?: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: 'text' | 'image' | 'gif' | 'voicemail' | 'call_started' | 'call_ended' | 'file' | 'poll' | 'form' | 'money' | 'iframe' | 'code' | 'location';
  content: string | null;
  gif_url: string | null;
  media_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  duration_seconds: number | null;
  code_language: string | null;
  reactions: Record<string, string[]>;
  reply_to: string | null;
  reply_excerpt?: string | null;
  text_effect?: TextEffect | null;
  text_effect_spans?: TextEffectSpan[] | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  sender?: Profile;
  caption?: string | null;
  read_by?: string[];
};

export type Notification = {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  notification_type: 'message' | 'call' | 'facetime' | 'voicemail' | 'mention' | 'reaction';
  title: string;
  body: string | null;
  conversation_id: string | null;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
};

export function effectiveStatus(profile: Profile | null | undefined): 'online' | 'away' | 'busy' | 'offline' {
  if (!profile) return 'offline';
  // 'auto' status: online if recently active, otherwise offline
  if (profile.status === 'auto') {
    const lastSeen = new Date(profile.last_seen).getTime();
    if (isNaN(lastSeen)) return 'offline';
    return Date.now() - lastSeen < 45 * 1000 ? 'online' : 'offline';
  }
  const lastSeen = new Date(profile.last_seen).getTime();
  if (isNaN(lastSeen)) return 'offline';
  const now = Date.now();
  // Use 45-second window with hysteresis to prevent flicker at the boundary
  if (now - lastSeen < 45 * 1000) {
    return profile.status === 'online' ? 'online' : profile.status;
  }
  return profile.status === 'online' ? 'offline' : profile.status;
}

export type GIF = {
  id: string;
  creator_id: string;
  title: string;
  url: string;
  thumbnail_url: string | null;
  tags: string[];
  width: number | null;
  height: number | null;
  is_public: boolean;
  created_at: string;
  creator?: Profile;
};

export type GifCollection = {
  id: string;
  name: string;
  conversation_id: string | null;
  created_by: string;
  is_group_collection: boolean;
  created_at: string;
  gifs?: GIF[];
};

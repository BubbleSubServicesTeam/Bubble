import { useState, useEffect } from 'react';
import { supabase, Profile, effectiveStatus } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';
import { useLocationSharing } from '../lib/location';
import LocationShareControl from './LocationShareControl';
import ContactDetailsForm from './ContactDetailsForm';
import Avatar from './Avatar';
import { LocationMap } from './LocationMap';
import { saveContactPriority } from '../lib/contactPriority';
import { X, Mail, Bell, BellOff, MessageCircle, Calendar, Clock, Phone, MapPin, Copy, Check, Star, Volume2 } from 'lucide-react';

type Props = {
  profile: Profile;
  conversationId?: string;
  onClose: () => void;
  onStartChat?: () => void;
};

export default function ProfileModal({ profile, conversationId, onClose, onStartChat }: Props) {
  const { user } = useAuth();
  const { sendNotification } = useNotifications();
  const [nudgeSent, setNudgeSent] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [contactInfo, setContactInfo] = useState<{
    phone_number: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  }>({ phone_number: profile.phone_number ?? null, address: null, city: null, state: null, postal_code: null, country: null });
  const [isCloseFriend, setIsCloseFriend] = useState(false);

  const isMe = user?.id === profile.user_id;
  const status = effectiveStatus(profile);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.display_name;

  const loc = useLocationSharing(isMe ? null : profile.user_id);

  const [contactPriority, setContactPriority] = useState<'silenced' | 'normal' | 'prioritized'>('normal');

  useEffect(() => {
    if (!profile.user_id) return;
    if (isMe) {
      supabase
        .from('profiles')
        .select('phone_number, address, city, state, postal_code, country')
        .eq('user_id', profile.user_id)
        .maybeSingle()
        .then(({ data }) => { if (data) setContactInfo(data); });
      return;
    }
    supabase
      .from('profiles')
      .select('phone_number')
      .eq('user_id', profile.user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setContactInfo(prev => ({ ...prev, phone_number: data.phone_number }));
      });
    supabase
      .rpc('get_close_friend_location', { p_user_id: profile.user_id })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : null;
        if (row) setContactInfo(prev => ({ ...prev, address: row.address, city: row.city, state: row.state, postal_code: row.postal_code, country: row.country }));
      });
  }, [profile.user_id, isMe]);

  useEffect(() => {
    if (!user || !profile.user_id || isMe) return;
    supabase
      .from('contact_preferences')
      .select('priority, is_close_friend')
      .eq('user_id', user.id)
      .eq('contact_id', profile.user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setContactPriority(data.priority);
        setIsCloseFriend(data?.is_close_friend ?? false);
      });
  }, [user, profile.user_id, isMe]);

  async function setPriority(priority: 'silenced' | 'normal' | 'prioritized') {
    if (!user || !profile.user_id) return;
    setContactPriority(priority);
    await saveContactPriority(user.id, profile.user_id, priority);
  }

  async function toggleCloseFriend() {
    if (!user || !profile.user_id) return;
    const next = !isCloseFriend;
    setIsCloseFriend(next);
    const { error } = await supabase
      .from('contact_preferences')
      .upsert(
        { user_id: user.id, contact_id: profile.user_id, is_close_friend: next },
        { onConflict: 'user_id,contact_id' }
      );
    if (error) setIsCloseFriend(!next);
  }

  async function handleNudge() {
    if (!user || nudging) return;
    if (contactPriority === 'silenced') return;
    setNudging(true);
    try {
      await sendNotification(
        profile.user_id,
        'mention',
        `${profile.display_name}, check Bubble!`,
        'Someone is nudging you to open Bubble.',
        conversationId
      );
      setNudgeSent(true);
      setTimeout(() => setNudgeSent(false), 3000);
    } catch (err) {
      console.error('Nudge failed:', err);
    } finally {
      setNudging(false);
    }
  }

  function copyToClipboard(value: string, field: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  function formatLastSeen(ts?: string) {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const seenDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((today.getTime() - seenDay.getTime()) / 86400000);
    if (dayDiff === 0) {
      return `Today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    if (dayDiff === 1) {
      return `Yesterday at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    if (dayDiff < 7) {
      return `${d.toLocaleDateString([], { weekday: 'long' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return d.toLocaleString([], {
      month: 'long',
      day: 'numeric',
      year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover banner */}
        <div className="h-24 bg-gradient-to-br from-sky-600/30 via-blue-700/20 to-slate-900 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white/80 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Avatar */}
        <div className="px-6 -mt-12 relative">
          <div className="w-24 h-24 rounded-full ring-4 ring-[#0d1117] overflow-hidden shadow-xl">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {profile.display_name?.charAt(0).toUpperCase() ?? '?'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-slate-900 dark:text-white font-bold text-xl">{fullName}</h2>
              <span className={`w-2.5 h-2.5 rounded-full ${
                status === 'online' ? 'bg-green-400' : status === 'away' ? 'bg-yellow-400' : 'bg-slate-500'
              }`} />
            </div>
            {profile.display_name !== fullName && (
              <p className="text-slate-500 text-sm">@{profile.display_name}</p>
            )}
            {profile.status_message && (
              <p className="text-slate-400 text-sm mt-1 italic">"{profile.status_message}"</p>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-white/5">
            {profile.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail size={15} className="text-slate-600 flex-shrink-0" />
                <span className="text-slate-500 dark:text-slate-400">Email</span>
                <span className="text-slate-700 dark:text-slate-200 truncate ml-auto text-[13px]">{profile.email}</span>
                <button
                  onClick={() => copyToClipboard(profile.email!, 'email')}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                  title="Copy email"
                >
                  {copiedField === 'email' ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
            )}
            {contactInfo.phone_number && (
              <div className="flex items-center gap-3 text-sm">
                <Phone size={15} className="text-slate-600 flex-shrink-0" />
                <span className="text-slate-500 dark:text-slate-400">Phone</span>
                <span className="text-slate-700 dark:text-slate-200 truncate ml-auto text-[13px]">{contactInfo.phone_number}</span>
                <button
                  onClick={() => copyToClipboard(contactInfo.phone_number!, 'phone')}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                  title="Copy phone number"
                >
                  {copiedField === 'phone' ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
            )}
            {!isMe && (contactInfo.city || contactInfo.state || contactInfo.postal_code || contactInfo.country) && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin size={15} className="text-slate-600 flex-shrink-0" />
                <span className="text-slate-500 dark:text-slate-400">Location</span>
                <span className="text-slate-700 dark:text-slate-200 truncate ml-auto text-[13px]">{[contactInfo.city, contactInfo.state, contactInfo.postal_code, contactInfo.country].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {contactInfo.address && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin size={15} className="text-slate-600 flex-shrink-0" />
                <span className="text-slate-500 dark:text-slate-400">Address</span>
                <span className="text-slate-700 dark:text-slate-200 truncate ml-auto text-[13px]">{contactInfo.address}</span>
                <button
                  onClick={() => copyToClipboard(contactInfo.address!, 'address')}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                  title="Copy address"
                >
                  {copiedField === 'address' ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Clock size={15} className="text-slate-600 flex-shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Last seen</span>
              <span className="text-slate-700 dark:text-slate-200 ml-auto">{formatLastSeen(profile.last_seen)}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={15} className="text-slate-600 flex-shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Joined</span>
              <span className="text-slate-700 dark:text-slate-200 ml-auto">
                {new Date(profile.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Location sharing */}
          {!isMe && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
              <div className="flex items-center gap-2">
                <MapPin size={15} className="text-sky-500" />
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Location</span>
              </div>
              <LocationShareControl viewerId={profile.user_id} viewerName={profile.display_name} />

              {loc.theirShareEnabled && loc.theirLocation && (
                <div className="space-y-1.5">
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <MapPin size={12} className="text-green-400" />
                    {profile.display_name} shared their location
                  </p>
                  <LocationMap
                    latitude={loc.theirLocation.latitude}
                    longitude={loc.theirLocation.longitude}
                    label={`${profile.display_name}'s location`}
                    height={180}
                  />
                  <ul className="space-y-1">
                    {loc.theirDeviceLocations.map(device => (
                      <li key={device.device_id} className="flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">{device.device_label ?? device.device_id}</span>
                        <span className="flex-shrink-0 ml-3">{formatLastSeen(device.updated_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {loc.theirShareEnabled && !loc.theirLocation && (
                <p className="text-[12px] text-slate-400">{profile.display_name} allowed you to see their location, but hasn't shared coordinates yet.</p>
              )}
            </div>
          )}

          {!isMe && <ContactDetailsForm contactId={profile.user_id} contactName={profile.display_name} />}

          {/* Close friend */}
          {!isMe && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/5">
              <div>
                <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Close friend</p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">Lets {profile.display_name} see your city, address, and location.</p>
              </div>
              <button
                onClick={toggleCloseFriend}
                role="switch"
                aria-checked={isCloseFriend}
                title="Toggle close friend"
                className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${
                  isCloseFriend ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
                    isCloseFriend ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Contact priority */}
          {!isMe && (
            <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-white/5">
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Contact priority</p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  {contactPriority === 'silenced' && 'Silenced: no unread badges or push alerts, and their chats sit at the bottom.'}
                  {contactPriority === 'normal' && 'Normal: standard notifications and chat order.'}
                  {contactPriority === 'prioritized' && 'Prioritized: their chats stay at the top of your list.'}
                </p>
              </div>
              <div role="radiogroup" aria-label="Contact priority" className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.04]">
                {([
                  { key: 'silenced', label: 'Silenced', icon: BellOff },
                  { key: 'normal', label: 'Normal', icon: Volume2 },
                  { key: 'prioritized', label: 'Priority', icon: Star },
                ] as const).map(({ key, label, icon: Icon }) => {
                  const active = contactPriority === key;
                  return (
                    <button
                      key={key}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPriority(key)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-[0.97] ${
                        active
                          ? 'bg-white dark:bg-white/[0.12] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isMe && (
            <div className="flex gap-3 pt-2">
              {onStartChat && (
                <button
                  onClick={onStartChat}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm rounded-2xl transition-all shadow-lg shadow-sky-500/20"
                >
                  <MessageCircle size={16} />
                  Message
                </button>
              )}
              <button
                onClick={handleNudge}
                disabled={nudging}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-semibold text-sm rounded-2xl transition-all ${
                  nudgeSent
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-slate-100 dark:bg-white/[0.06] hover:bg-white/[0.10] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10'
                }`}
              >
                <Bell size={16} />
                {nudgeSent ? 'Nudged!' : 'Nudge'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

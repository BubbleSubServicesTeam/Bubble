import { useNotifications } from '../lib/notifications';
import { X, Bell, CheckCheck, MessageCircle, Phone, Video, Mic, Smile, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import type { Notification } from '../lib/supabase';

type Props = { onClose: () => void };

const typeIcons = {
  message: <MessageCircle size={15} className="text-sky-400" />,
  call: <Phone size={15} className="text-green-400" />,
  facetime: <Video size={15} className="text-blue-400" />,
  voicemail: <Mic size={15} className="text-orange-400" />,
  mention: <MessageCircle size={15} className="text-yellow-400" />,
  reaction: <Smile size={15} className="text-pink-400" />,
};

const typeLabels = {
  message: 'Message',
  call: 'Call',
  facetime: 'FaceTime',
  voicemail: 'Voicemail',
  mention: 'Mention',
  reaction: 'Reaction',
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function NotificationsPanel({ onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications();

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — slides in from the right, full height */}
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-[#0d1117] border-l border-slate-200 dark:border-white/[0.06] shadow-2xl flex flex-col animate-in">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Bell size={18} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[18px] leading-tight">Notifications</h2>
              <p className="text-slate-500 text-[12px]">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.08] text-slate-400 hover:text-slate-900 dark:hover:text-white text-[12px] font-medium transition-all border border-slate-200 dark:border-white/[0.06]"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.08] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center">
                <Bell size={26} className="text-slate-400 dark:text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-slate-900 dark:text-white font-semibold text-[16px] mb-1">No notifications</p>
                <p className="text-slate-500 text-[14px]">You're all caught up!</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {notifications.map(notif => (
                <NotifRow
                  key={notif.id}
                  notif={notif}
                  onRead={() => markRead(notif.id)}
                  onDismiss={() => dismiss(notif.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 dark:border-white/[0.06]">
            <button
              onClick={async () => {
                await markAllRead();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:bg-white/[0.08] border border-slate-200 dark:border-white/[0.06] text-slate-400 hover:text-slate-900 dark:hover:text-white text-[14px] font-medium rounded-xl transition-all"
            >
              <CheckCheck size={14} />
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NotifRow({ notif, onRead, onDismiss }: { notif: Notification; onRead: () => void; onDismiss: () => void }) {
  return (
    <div
      className={`flex items-start gap-4 px-6 py-4 transition-colors cursor-pointer group ${
        !notif.is_read ? 'bg-sky-500/[0.04] hover:bg-sky-500/[0.07]' : 'hover:bg-slate-50 dark:bg-white/[0.02]'
      }`}
      onClick={onRead}
    >
      {/* Avatar + type icon */}
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar profile={(notif as any).sender} size="md" />
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center">
          {typeIcons[notif.notification_type]}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className={`text-[14px] leading-snug ${!notif.is_read ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-300 font-medium'}`}>
            {notif.title}
          </p>
          {!notif.is_read && (
            <div className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0 mt-1.5" />
          )}
        </div>
        {notif.body && (
          <p className="text-[13px] text-slate-500 truncate mb-1">{notif.body}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 dark:text-slate-600">{timeAgo(notif.created_at)}</span>
          <span className="text-slate-700">·</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-600">{typeLabels[notif.notification_type]}</span>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss(); }}
        title="Delete notification"
        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-red-500/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { showPushNotification, usePushNotifications, ensurePushSubscription, sendPushToRecipient } from './push';
import { supabase, Notification, Profile } from './supabase';
import { useAuth } from './auth';
import { X, MessageCircle, Phone, Video, Mic, Smile } from 'lucide-react';

type NotifCtx = {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  sendNotification: (recipientId: string, type: Notification['notification_type'], title: string, body: string, conversationId?: string) => Promise<void>;
};

const NotifContext = createContext<NotifCtx | null>(null);

type Toast = Notification & { removing: boolean };

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icons = {
    message: <MessageCircle size={18} className="text-sky-400" />,
    call: <Phone size={18} className="text-green-400" />,
    facetime: <Video size={18} className="text-blue-400" />,
    voicemail: <Mic size={18} className="text-orange-400" />,
    mention: <MessageCircle size={18} className="text-yellow-400" />,
    reaction: <Smile size={18} className="text-pink-400" />,
  };

  return (
    <div
      className={`flex items-start gap-3 bg-slate-800/95 backdrop-blur border border-white/10 rounded-2xl p-4 shadow-2xl w-full max-w-[380px] transition-all duration-300 ${
        toast.removing ? 'opacity-0 translate-x-full scale-95' : 'opacity-100 translate-x-0 scale-100'
      }`}
    >
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
        {icons[toast.notification_type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm leading-snug">{toast.title}</p>
        {toast.body && (
          <p className="text-slate-400 text-xs mt-0.5 truncate">{toast.body}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center flex-shrink-0 transition-colors group"
      >
        <X size={13} className="text-slate-400 group-hover:text-white transition-colors" />
      </button>
    </div>
  );
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  usePushNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Register for Web Push when user logs in
  useEffect(() => {
    if (!user) return;
    ensurePushSubscription(user.id);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    supabase
      .from('notifications')
      .select('*, sender:profiles!notifications_sender_profile_fkey(display_name, avatar_url, status)')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setNotifications(data as Notification[]);
      });

    const channel = supabase
      .channel(`notifs:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        async (payload) => {
          const notif = payload.new as Notification;
          let silenced = false;
          if (notif.sender_id) {
            const { data: senderData } = await supabase
              .from('profiles')
              .select('display_name, avatar_url, status')
              .eq('user_id', notif.sender_id)
              .maybeSingle();
            if (senderData) (notif as any).sender = senderData;
            const { data: pref } = await supabase
              .from('contact_preferences')
              .select('priority')
              .eq('user_id', user.id)
              .eq('contact_id', notif.sender_id)
              .maybeSingle();
            silenced = pref?.priority === 'silenced';
          }
          setNotifications(prev => [notif, ...prev]);
          if (silenced) return;
          showToast(notif);
          showPushNotification(notif.title, notif.body ?? '', notif.id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  function showToast(notif: Notification) {
    const toast: Toast = { ...notif, removing: false };
    setToasts(prev => [toast, ...prev.slice(0, 4)]);

    const timer = setTimeout(() => {
      dismissToast(notif.id);
    }, 5000);
    toastTimers.current.set(notif.id, timer);
  }

  function dismissToast(id: string) {
    const timer = toastTimers.current.get(id);
    if (timer) { clearTimeout(timer); toastTimers.current.delete(id); }
    setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', user.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function dismiss(id: string) {
    // Mark read but keep the notification — user can view history
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    dismissToast(id);
  }

  async function sendNotification(
    recipientId: string,
    type: Notification['notification_type'],
    title: string,
    body: string,
    conversationId?: string
  ) {
    if (!user) return;
    await supabase.from('notifications').insert({
      recipient_id: recipientId,
      sender_id: user.id,
      notification_type: type,
      title,
      body,
      conversation_id: conversationId ?? null,
    });
    // Send real Web Push to all of the recipient's devices
    sendPushToRecipient(recipientId, user.id, title, body, 'bubble-notification', {
      conversation_id: conversationId ?? null,
      type,
    });
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, dismiss, sendNotification }}>
      {children}
      {/* Toast container — top center */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none w-full max-w-[400px] px-4">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto w-full">
            <ToastItem toast={toast} onDismiss={() => dismissToast(toast.id)} />
          </div>
        ))}
      </div>
    </NotifContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotifContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider');
  return ctx;
}

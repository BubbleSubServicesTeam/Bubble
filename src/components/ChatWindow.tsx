import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, Conversation, Profile, Message, smartName, effectiveStatus } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCall } from '../lib/calls';
import { translateText } from '../lib/translate';
import { GifMedia, isVideoUrl } from './GifStudio';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import { Bell, Languages } from 'lucide-react';
import GifPicker from './GifPicker';
import GroupInfoModal from './GroupInfoModal';
import AttachMenu from './AttachMenu';
import PollCreator, { PollData } from './PollCreator';
import FormCreator, { FormData as FormCreatorData } from './FormCreator';
import IframeModal from './IframeModal';
import CodePreviewModal from './CodePreviewModal';
import SelfieModal from './SelfieModal';
import SendMoneyModal from './SendMoneyModal';
import VoiceRecorder from './VoiceRecorder';
import PollMessage from './PollMessage';
import FormMessage from './FormMessage';
import DraftPanel from './DraftPanel';
import ConversationSummaryModal from './ConversationSummaryModal';
import {
  Send, Smile, Mic, Phone, Video,
  X, Edit2, Trash2, Reply, Play, Pause,
  ChevronDown, Check, Users, ArrowLeft,
  MoreVertical, Trash, LogOut, Ban, Camera,
  Paperclip, Copy, Download, FileText,
  DollarSign, Link, BarChart2, ExternalLink, Eye,
  Code2, Link2, Trophy, MessageCircle, Sparkles, Maximize2, Minimize2, BookOpen, ScanText,
  Bookmark, BookmarkCheck, FolderOpen, Palette, Star, StarOff
} from 'lucide-react';
import { useNotifications } from '../lib/notifications';
import { useAppLang } from '../lib/i18n';
import BubbleLoader from './BubbleLoader';
import FilesViewer from './FilesViewer';
import NotificationSettings from './NotificationSettings';
import WallpaperPicker from './WallpaperPicker';
import { getWallpaperCss } from '../lib/wallpapers';
import { LocationMap, LocationPicker } from './LocationMap';
import { detectContactInfo, hasNewInfo } from '../lib/contactAutofill';
import { fetchContactDetails, saveContactDetails, CONTACT_DETAIL_FIELDS, type ContactDetails } from '../lib/contactDetails';

type Props = {
  conversation: Conversation;
  onOpenGifStudio: () => void;
  onBack?: () => void;
  onLeave?: (convId: string) => void;
  onTrash?: (convId: string) => void;
  onMembersChanged?: () => void;
};

const EMOJI_LIST = [
  '❤️','👍','👎','🔥','💧','🙏','🧻','✔','❌','🤣',
  '😭','🙄','😬','🤫','🤔','👿','😈','😂','☠','😮',
  '😩','🤧','🤮','😢','🌐','🗑','⌚','🚫','⚠️','🎉'
];

type LensRect = { left: number; top: number; right: number; bottom: number };
type LensEdge = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
type LensDrag = { edge: LensEdge; startX: number; startY: number; startRect: LensRect; latest: LensRect };
type LensHit = { id: string; text: string; mine: boolean };

const LENS_HANDLES: { edge: Exclude<LensEdge, 'move'>; pos: string; cursor: string }[] = [
  { edge: 'nw', pos: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { edge: 'n', pos: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { edge: 'ne', pos: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { edge: 'e', pos: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { edge: 'se', pos: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { edge: 's', pos: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { edge: 'sw', pos: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { edge: 'w', pos: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

function moveLensRect(drag: LensDrag, dx: number, dy: number, width: number, height: number): LensRect {
  const s = drag.startRect;
  const clampX = (v: number) => Math.min(Math.max(v, 0), width);
  const clampY = (v: number) => Math.min(Math.max(v, 0), height);
  if (drag.edge === 'move') {
    const w = s.right - s.left;
    const h = s.bottom - s.top;
    const left = Math.min(Math.max(s.left + dx, 0), Math.max(width - w, 0));
    const top = Math.min(Math.max(s.top + dy, 0), Math.max(height - h, 0));
    return { left, top, right: left + w, bottom: top + h };
  }
  let { left, top, right, bottom } = s;
  if (drag.edge.includes('w')) left = clampX(s.left + dx);
  if (drag.edge.includes('e')) right = clampX(s.right + dx);
  if (drag.edge.includes('n')) top = clampY(s.top + dy);
  if (drag.edge.includes('s')) bottom = clampY(s.bottom + dy);
  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
  };
}

export default function ChatWindow({ conversation, onOpenGifStudio, onBack, onLeave, onTrash, onMembersChanged }: Props) {
  const { user, profile } = useAuth();
  const { startCall } = useCall();
  const { sendNotification } = useNotifications();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showProfile, setShowProfile] = useState<Profile | null>(null);
  const [nudged, setNudged] = useState(false);
  const { t } = useAppLang();
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [editName, setEditName] = useState(conversation.name ?? '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(conversation.avatar_url ?? '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [touchMsgId, setTouchMsgId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showFormCreator, setShowFormCreator] = useState(false);
  const [showIframeModal, setShowIframeModal] = useState(false);
  const [showSelfieModal, setShowSelfieModal] = useState(false);
  const [showSendMoney, setShowSendMoney] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [undoDelete, setUndoDelete] = useState<{ msg: Message; index: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [undoEdit, setUndoEdit] = useState<{ messageId: string; previousContent: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Profile[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pastedCode, setPastedCode] = useState('');
  const [pastedLang, setPastedLang] = useState('');
  const [codeViewModes, setCodeViewModes] = useState<Record<string, 'preview' | 'raw'>>({});
  const [fullscreenCode, setFullscreenCode] = useState<{ code: string; language: string; note: string | null } | null>(null);
  const [myPayPalEmail, setMyPayPalEmail] = useState<string | null>(null);
  const [recipientPayPalEmail, setRecipientPayPalEmail] = useState<string | null>(null);
  const [ffLeagueId, setFfLeagueId] = useState<string | null>(null);
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [savedMsgIds, setSavedMsgIds] = useState<Set<string>>(new Set());
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showFilesViewer, setShowFilesViewer] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [wallpaper, setWallpaper] = useState('none');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [autofillSuggestion, setAutofillSuggestion] = useState<{
    senderId: string;
    senderName: string;
    info: Record<string, string | null>;
  } | null>(null);

  // Reply selection box
  const [lensActive, setLensActive] = useState(false);
  const [lensRect, setLensRect] = useState<LensRect | null>(null);
  const [lensHits, setLensHits] = useState<LensHit[]>([]);
  const [lensScope, setLensScope] = useState<'all' | 'mine'>('all');
  const lensDragRef = useRef<LensDrag | null>(null);
  const lensSelected = lensHits.filter(h => lensScope === 'all' || h.mine);

  function startLensReply() {
    setLensActive(true);
    setLensRect(null);
    setLensHits([]);
    setLensScope('all');
  }

  function closeLens() {
    setLensActive(false);
    setLensRect(null);
    setLensHits([]);
    lensDragRef.current = null;
  }

  function lensPoint(e: React.PointerEvent) {
    const rect = scrollRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function beginLensDrag(e: React.PointerEvent<HTMLElement>, edge: LensEdge, startRect: LensRect) {
    const p = lensPoint(e);
    lensDragRef.current = { edge, startX: p.x, startY: p.y, startRect, latest: startRect };
    setLensRect(startRect);
    setLensHits([]);
    scrollRef.current?.setPointerCapture(e.pointerId);
  }

  function onLensPointerDown(e: React.PointerEvent<HTMLElement>) {
    const p = lensPoint(e);
    beginLensDrag(e, 'se', { left: p.x, top: p.y, right: p.x, bottom: p.y });
  }

  function onLensPointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = lensDragRef.current;
    if (!drag) return;
    const p = lensPoint(e);
    const el = scrollRef.current;
    const next = moveLensRect(drag, p.x - drag.startX, p.y - drag.startY, el?.clientWidth ?? 0, el?.clientHeight ?? 0);
    drag.latest = next;
    setLensRect(next);
  }

  function onLensPointerUp() {
    const drag = lensDragRef.current;
    if (!drag) return;
    lensDragRef.current = null;
    const { latest } = drag;
    if (latest.right - latest.left < 10 || latest.bottom - latest.top < 10) {
      setLensRect(null);
      setLensHits([]);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const origin = el.getBoundingClientRect();
    const hits: LensHit[] = [];
    el.querySelectorAll<HTMLElement>('[data-msg-text]').forEach(node => {
      const text = node.dataset.msgText?.trim();
      const id = node.dataset.msgId;
      if (!text || !id) return;
      const r = node.getBoundingClientRect();
      const overlaps =
        r.right - origin.left > latest.left &&
        r.left - origin.left < latest.right &&
        r.bottom - origin.top > latest.top &&
        r.top - origin.top < latest.bottom;
      if (overlaps) hits.push({ id, text, mine: messages.find(m => m.id === id)?.sender_id === user?.id });
    });
    setLensHits(hits);
  }

  function stopLensTouch(e: React.TouchEvent) {
    e.stopPropagation();
  }

  function confirmLensReply() {
    if (lensSelected.length === 0) return;
    const quoted = lensSelected.map(h => `> ${h.text}`).join('\n');
    const first = messages.find(m => m.id === lensSelected[0].id);
    if (first) setReplyTo(first);
    setText(prev => prev + (prev ? '\n' : '') + quoted + '\n');
    closeLens();
    inputRef.current?.focus();
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const otherProfile = !conversation.is_group && !conversation.is_self_chat
    ? conversation.members?.find(m => m.user_id !== user?.id) ?? null
    : null;

  // Load draft from localStorage on conversation switch
  useEffect(() => {
    const draftKey = `bubble-draft-${conversation.id}`;
    const saved = localStorage.getItem(draftKey);
    setText(saved ?? '');
  }, [conversation.id]);

  // Save draft to localStorage on text change (debounced via timeout)
  useEffect(() => {
    const draftKey = `bubble-draft-${conversation.id}`;
    if (text.trim()) {
      localStorage.setItem(draftKey, text);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [text, conversation.id]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from('paypal_connections')
      .select('paypal_email')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setMyPayPalEmail(data?.paypal_email ?? null));
  }, [user?.id]);

  // Check if the other person has PayPal connected (for DMs only)
  useEffect(() => {
    if (!otherProfile?.user_id) { setRecipientPayPalEmail(null); return; }
    supabase
      .from('paypal_connections')
      .select('paypal_email')
      .eq('user_id', otherProfile.user_id)
      .maybeSingle()
      .then(({ data }) => setRecipientPayPalEmail(data?.paypal_email ?? null));
  }, [otherProfile?.user_id]);

  // Check if this conversation is linked to a fantasy football league
  useEffect(() => {
    if (!conversation.id) return;
    supabase
      .from('ff_leagues')
      .select('id')
      .eq('conversation_id', conversation.id)
      .maybeSingle()
      .then(({ data }) => { setFfLeagueId(data?.id ?? null); });
  }, [conversation.id]);

  // Fetch last_read_at for the summary "what you missed" feature
  useEffect(() => {
    if (!user || !conversation.id) return;
    supabase
      .from('conversation_members')
      .select('last_read_at')
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => { setLastReadAt(data?.last_read_at ?? null); });
  }, [user, conversation.id]);

  // Load saved message IDs for this conversation
  useEffect(() => {
    if (!user || !conversation.id) return;
    supabase
      .from('saved_messages')
      .select('message_id')
      .eq('user_id', user.id)
      .eq('conversation_id', conversation.id)
      .then(({ data }) => {
        setSavedMsgIds(new Set((data ?? []).map(d => d.message_id).filter(Boolean) as string[]));
      });
  }, [user, conversation.id]);

  // Load wallpaper
  useEffect(() => {
    if (!user || !conversation.id) return;
    supabase
      .from('chat_wallpapers')
      .select('wallpaper')
      .eq('user_id', user.id)
      .eq('conversation_id', conversation.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setWallpaper(data.wallpaper); else setWallpaper('none'); });
  }, [user, conversation.id]);

  async function toggleSaveMessage(msg: Message) {
    if (!user) return;
    const isSaved = savedMsgIds.has(msg.id);
    if (isSaved) {
      await supabase.from('saved_messages').delete().eq('user_id', user.id).eq('message_id', msg.id);
      setSavedMsgIds(prev => { const n = new Set(prev); n.delete(msg.id); return n; });
    } else {
      await supabase.from('saved_messages').insert({ user_id: user.id, message_id: msg.id, conversation_id: conversation.id });
      setSavedMsgIds(prev => new Set(prev).add(msg.id));
    }
  }

  const displayProfile = conversation.is_self_chat ? profile : otherProfile;

  const allPeers = conversation.members?.filter(m => m.user_id !== user?.id) ?? [];

  async function handleStartCall(type: 'audio' | 'video') {
    if (conversation.is_self_chat) return;
    const peerIds = allPeers.map(m => m.user_id);
    if (peerIds.length === 0) return;
    const peer = !conversation.is_group ? otherProfile : null;
    await startCall({
      conversationId: conversation.id,
      conversationName: convName,
      conversationAvatarUrl: conversation.avatar_url,
      isGroup: conversation.is_group,
      type,
      peer,
      peerIds,
    });
    if (user) {
      const senderName = profile?.display_name ?? 'Someone';
      sendNotificationToMembers(
        `${senderName} is calling`,
        type === 'video' ? 'Incoming FaceTime call' : 'Incoming voice call',
        'call'
      );
    }
  }

  const convName = conversation.is_self_chat
    ? 'My Notes'
    : conversation.is_group
    ? (conversation.name ?? 'Group Chat')
    : smartName(otherProfile, allPeers);

  // Check block status
  useEffect(() => {
    if (!user || !otherProfile) return;
    supabase
      .from('user_blocks')
      .select('id')
      .eq('blocker_id', user.id)
      .eq('blocked_id', otherProfile.user_id)
      .maybeSingle()
      .then(({ data }) => setIsBlocked(!!data));
  }, [user, otherProfile?.user_id]);

  // Subscribe to typing indicators from other members
  useEffect(() => {
    const typingChannel = supabase
      .channel(`typing_${conversation.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'typing_indicators',
        filter: `conversation_id=eq.${conversation.id}`,
      }, async () => {
        const { data: typingData } = await supabase
          .from('typing_indicators')
          .select('user_id, updated_at')
          .eq('conversation_id', conversation.id)
          .neq('user_id', user?.id ?? '');
        if (!typingData) return;
        const now = Date.now();
        const activeTyping = typingData.filter(t => now - new Date(t.updated_at).getTime() < 4000);
        if (activeTyping.length === 0) {
          setTypingUsers([]);
          return;
        }
        const activeUserIds = activeTyping.map(t => t.user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, first_name, last_name, avatar_url')
          .in('user_id', activeUserIds);
        if (profilesData) setTypingUsers(profilesData as Profile[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(typingChannel); };
  }, [conversation.id, user?.id]);

  async function broadcastTyping() {
    if (!user) return;
    await supabase
      .from('typing_indicators')
      .upsert({ conversation_id: conversation.id, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'conversation_id,user_id' });
  }

  async function clearTyping() {
    if (!user) return;
    await supabase
      .from('typing_indicators')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id);
  }

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel(`messages_${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversation.id}`
      }, async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select('*, sender:profiles!messages_profile_sender_id_fkey(*)')
          .eq('id', payload.new.id)
          .maybeSingle();
        if (data) {
          setMessages(prev => {
            if (prev.some(m => m.id === data.id)) return prev;
            // Also dedup optimistic messages: same sender + same content within 5 seconds
            const isOptimisticDup = prev.some(m =>
              m.id.startsWith('temp-') &&
              m.sender_id === data.sender_id &&
              m.message_type === data.message_type &&
              m.content === data.content &&
              Math.abs(new Date(m.created_at).getTime() - new Date(data.created_at).getTime()) < 5000
            );
            if (isOptimisticDup) {
              return prev.map(m =>
                m.id.startsWith('temp-') &&
                m.sender_id === data.sender_id &&
                m.message_type === data.message_type &&
                m.content === data.content &&
                Math.abs(new Date(m.created_at).getTime() - new Date(data.created_at).getTime()) < 5000
                  ? { ...m, ...data, id: data.id } as Message
                  : m
              );
            }
            return [...prev, data as Message];
          });
          setTimeout(() => scrollToBottom('smooth'), 50);
          // Mark as read when a new message arrives AND the chat is visible
          if (document.visibilityState === 'visible') markAsRead();

          // Contact info autofill: detect phone/address in incoming text messages
          if (data.message_type === 'text' && data.content && data.sender_id !== user?.id) {
            const detected = detectContactInfo(data.content);
            if (detected) {
              const existingDetails = user ? await fetchContactDetails(user.id, data.sender_id) : null;
              if (hasNewInfo(detected, existingDetails ?? {})) {
                setAutofillSuggestion({
                  senderId: data.sender_id,
                  senderName: (data.sender as any)?.display_name ?? 'Someone',
                  info: detected as Record<string, string | null>,
                });
              }
            }
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversation.id}`
      }, (payload) => {
        const updated = payload.new as Message;
        if (updated.deleted_at) {
          setMessages(prev => prev.filter(m => m.id !== updated.id));
        } else {
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversation.id]);

  // Mark messages as read only when the chat is actually visible on screen
  const markAsRead = useCallback(() => {
    if (!user) return;
    supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id)
      .then(() => {
        // Update read_by locally so receipts update instantly
        setMessages(prev => prev.map(m => {
          if (m.sender_id === user.id) return m;
          if (m.read_by?.includes(user.id)) return m;
          return { ...m, read_by: [...(m.read_by ?? []), user.id] };
        }));
      });
  }, [user, conversation.id]);

  // Fire markAsRead when: messages load, the tab becomes visible, or new messages arrive while visible
  useEffect(() => {
    if (!user || messages.length === 0) return;
    if (document.visibilityState === 'visible') {
      markAsRead();
    }
  }, [messages.length, user, markAsRead]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') markAsRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markAsRead]);

  const [loadingMessages, setLoadingMessages] = useState(() => {
    try { return !localStorage.getItem(`bubble-msgs-${conversation.id}`); } catch { return true; }
  });

  async function loadMessages() {
    const cacheKey = `bubble-msgs-${conversation.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedMsgs = JSON.parse(cached) as Message[];
        setMessages(cachedMsgs);
        setLoadingMessages(false);
        setTimeout(() => scrollToBottom('auto'), 0);
      }
    } catch { /* ignore */ }

    // Fetch messages and read receipts in parallel
    const [msgResult, membersResult] = await Promise.all([
      supabase
        .from('messages')
        .select('*, sender:profiles!messages_profile_sender_id_fkey(*)')
        .eq('conversation_id', conversation.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('conversation_members')
        .select('user_id, last_read_at')
        .eq('conversation_id', conversation.id),
    ]);

    if (msgResult.data) {
      const msgs = msgResult.data as Message[];
      if (membersResult.data) {
        for (const msg of msgs) {
          const msgTime = new Date(msg.created_at).getTime();
          const readers = membersResult.data
            .filter(m => m.user_id !== msg.sender_id && m.last_read_at && new Date(m.last_read_at).getTime() >= msgTime)
            .map(m => m.user_id);
          (msg as any).read_by = readers;
        }
      }
      setMessages(msgs);
      try { localStorage.setItem(cacheKey, JSON.stringify(msgs)); } catch { /* ignore */ }
    }
    setLoadingMessages(false);
    setTimeout(() => scrollToBottom('auto', true), 50);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth', force = false) {
    const el = scrollRef.current;
    if (!el) return;
    // Don't yank the view when the user has scrolled up to read history
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (!force && distanceFromBottom > 400) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  }

  async function sendMessage(type: Message['message_type'] = 'text', extra: Partial<Message> = {}) {
    if (!user) return;
    if (type === 'text' && !text.trim()) return;
    // Send push notification to other members for text messages
    if (type === 'text') {
      const senderName = profile?.display_name ?? 'Someone';
      sendNotificationToMembers(
        `${senderName} in ${convName}`,
        text.trim(),
        'message'
      );
    }
    setSending(true);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const messageContent = type === 'text' ? text.trim() : null;
    const payload: any = {
      conversation_id: conversation.id,
      sender_id: user.id,
      message_type: type,
      content: messageContent,
      reply_to: replyTo?.id ?? null,
      reactions: {},
      ...extra,
    };
    // Optimistic insert — show immediately
    const optimisticMsg: Message = {
      ...payload,
      id: tempId,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      duration_seconds: null,
      sender: profile ?? undefined,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setText('');
    // Reset textarea height after clearing text
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    // Clear draft after sending
    localStorage.removeItem(`bubble-draft-${conversation.id}`);
    setReplyTo(null);
    requestAnimationFrame(() => scrollToBottom('smooth', true));
    const { data, error } = await supabase.from('messages').insert(payload).select('id').single();
    if (error) {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setText(messageContent ?? '');
      setSending(false);
      return;
    }
    // Replace temp message with real one
    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));
    }
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
    setSending(false);
  }

  async function sendGif(url: string) {
    if (!user) return;
    setShowGifPicker(false);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload: any = {
      conversation_id: conversation.id,
      sender_id: user.id,
      message_type: 'gif',
      gif_url: url,
      content: null,
      reply_to: replyTo?.id ?? null,
      reactions: {},
    };
    const optimisticMsg: Message = {
      ...payload,
      id: tempId,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      duration_seconds: null,
      sender: profile ?? undefined,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setReplyTo(null);
    scrollToBottom();
    const { data, error } = await supabase.from('messages').insert(payload).select('id').single();
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return;
    }
    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));
    }
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id);
  }

  async function sendNotificationToMembers(title: string, body: string, type: 'message' | 'call') {
    if (!user) return;
    const peers = allPeers;
    await Promise.all(peers.map(peer =>
      supabase.from('notifications').insert({
        recipient_id: peer.user_id,
        sender_id: user.id,
        notification_type: type === 'message' ? 'message' : 'call',
        title,
        body,
        conversation_id: conversation.id,
      })
    ));
  }

  async function handleSendPoll(data: PollData) {
    if (!user) return;
    setShowPollCreator(false);
    const { data: pollRow, error } = await supabase
      .from('polls')
      .insert({
        conversation_id: conversation.id,
        creator_id: user.id,
        question: data.question,
        options: data.options,
        votes: {},
        allows_multiple: data.allowsMultiple,
        max_choices: data.allowsMultiple ? data.maxChoices : null,
      })
      .select('id')
      .single();
    if (error || !pollRow) return;
    await sendMessage('poll', { content: pollRow.id });
  }

  async function handleSendForm(data: FormCreatorData) {
    if (!user) return;
    setShowFormCreator(false);
    const { data: formRow, error } = await supabase
      .from('forms')
      .insert({
        conversation_id: conversation.id,
        creator_id: user.id,
        title: data.title,
        description: data.description || null,
        fields: data.fields,
      })
      .select('id')
      .single();
    if (error || !formRow) return;
    await sendMessage('form', { content: formRow.id });
  }

  async function handleSendIframe(url: string, title: string, message: string) {
    setShowIframeModal(false);
    if (message) {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const textPayload: any = {
        conversation_id: conversation.id,
        sender_id: user!.id,
        message_type: 'text',
        content: message,
        reply_to: replyTo?.id ?? null,
        reactions: {},
      };
      setMessages(prev => [...prev, { ...textPayload, id: tempId, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, duration_seconds: null, sender: profile ?? undefined }]);
      scrollToBottom();
      await supabase.from('messages').insert(textPayload);
    }
    await sendMessage('iframe', { content: url, file_name: title });
  }

  function detectLanguage(code: string): string {
    const trimmed = code.trim();
    if (trimmed.startsWith('<iframe')) return 'iframe';
    if (trimmed.startsWith('<') && trimmed.includes('>')) return 'html';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { JSON.parse(trimmed); return 'json'; } catch {}
    }
    if (/function\s|const\s|let\s|var\s|=>|console\.log/.test(trimmed)) return 'javascript';
    if (/def\s|print\s|import\s/.test(trimmed)) return 'python';
    if (/#include|int\smain|std::/.test(trimmed)) return 'cpp';
    if (/public\sclass|System\.out|import\sjava/.test(trimmed)) return 'java';
    if (/SELECT\s|INSERT\s|UPDATE\s|DELETE\s|CREATE\s/i.test(trimmed)) return 'sql';
    if (/^\s*\.[a-z]/m.test(trimmed) || /display\s*:|margin\s*:|padding\s*:/.test(trimmed)) return 'css';
    return 'text';
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text');
    if (!pasted || pasted.length < 10) return;
    const lang = detectLanguage(pasted);
    // Only intercept code-like content, not regular text
    if (lang === 'iframe' || lang === 'html' || lang === 'json' || lang === 'javascript' || lang === 'css' || lang === 'python' || lang === 'sql') {
      e.preventDefault();
      setPastedCode(pasted);
      setPastedLang(lang);
      setShowCodePreview(true);
    }
  }

  async function handleSendCode(code: string, language: string, message: string) {
    setShowCodePreview(false);
    if (language === 'iframe') {
      const srcMatch = code.match(/src=["']([^"']+)["']/i);
      const url = srcMatch ? srcMatch[1] : code.trim();
      const titleMatch = code.match(/title=["']([^"']+)["']/i);
      const title = titleMatch ? titleMatch[1] : '';
      await handleSendIframe(url, title || getAutoTitle(url), message);
      return;
    }
    await sendMessage('code', { content: code, code_language: language, file_name: message || null });
    setPastedCode('');
    setPastedLang('');
  }

  function getAutoTitle(u: string) {
    if (u.includes('spotify.com')) return 'Spotify';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('soundcloud.com')) return 'SoundCloud';
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('vimeo.com')) return 'Vimeo';
    try { return new URL(u).hostname.replace('www.', ''); } catch { return 'Embed'; }
  }

  async function handleSelfieCapture(dataUrl: string) {
    if (!user) return;
    setShowSelfieModal(false);
    setUploadingFile(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const path = `uploads/${user.id}/selfie-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      await sendMessage('image', { media_url: urlData.publicUrl, file_name: 'selfie.jpg', file_mime: 'image/jpeg' });
    } catch (err: any) {
      alert(err.message ?? 'Upload failed');
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleMoneyDone(amount: number, note: string, recipientPayPalEmail: string) {
    setShowSendMoney(false);
    const label = note ? `${amount} — ${note}` : `${amount}`;
    await sendMessage('money', { content: label, file_name: recipientPayPalEmail });
  }

  async function handleVoiceSend(blob: Blob, durationSeconds: number) {
    if (!user) return;
    setShowVoiceRecorder(false);
    setUploadingFile(true);
    try {
      const mime = blob.type || 'audio/webm';
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const path = `voicemails/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: mime, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      await sendMessage('voicemail', { media_url: urlData.publicUrl, duration_seconds: durationSeconds });
    } catch (err: any) {
      alert(err.message ?? 'Upload failed');
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 50 * 1024 * 1024) { alert('File must be under 50 MB.'); return; }
    setUploadingFile(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `uploads/${user.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      const isImage = file.type.startsWith('image/');
      await sendMessage(isImage ? 'image' : 'file', {
        media_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_mime: file.type,
      });
    } catch (err: any) {
      alert(err.message ?? 'Upload failed');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveEdit() {
    if (!editingId || !editText.trim()) return;
    const message = messages.find(m => m.id === editingId);
    if (!message || editText.trim() === message.content?.trim()) {
      setEditingId(null);
      setEditText('');
      return;
    }
    const previousContent = message.content ?? '';
    const nextContent = editText.trim();
    const { error } = await supabase.from('messages').update({
      content: nextContent,
      edited_at: new Date().toISOString(),
    }).eq('id', editingId);
    if (error) return;
    setMessages(prev => prev.map(m => m.id === editingId ? { ...m, content: nextContent, edited_at: new Date().toISOString() } : m));
    if (undoEdit) clearTimeout(undoEdit.timer);
    const timer = setTimeout(() => setUndoEdit(null), 120000);
    setUndoEdit({ messageId: editingId, previousContent, timer });
    setEditingId(null);
    setEditText('');
  }

  async function undoEditMessage() {
    if (!undoEdit) return;
    clearTimeout(undoEdit.timer);
    const { error } = await supabase.from('messages').update({
      content: undoEdit.previousContent,
      edited_at: null,
    }).eq('id', undoEdit.messageId);
    if (!error) {
      setMessages(prev => prev.map(m => m.id === undoEdit.messageId ? { ...m, content: undoEdit.previousContent, edited_at: null } : m));
    }
    setUndoEdit(null);
  }

  async function deleteMessage(id: string) {
    const msg = messages.find(m => m.id === id);
    const index = messages.findIndex(m => m.id === id);
    if (!msg) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      loadMessages();
      return;
    }
    const timer = setTimeout(() => setUndoDelete(null), 120000);
    setUndoDelete({ msg, index, timer });
  }

  function undoDeleteMessage() {
    if (!undoDelete) return;
    clearTimeout(undoDelete.timer);
    setMessages(prev => {
      const arr = [...prev];
      arr.splice(Math.min(undoDelete.index, arr.length), 0, undoDelete.msg);
      return arr;
    });
    supabase.from('messages').update({ deleted_at: null }).eq('id', undoDelete.msg.id);
    setUndoDelete(null);
  }

  // Translation state: per-message translation results
  const [translations, setTranslations] = useState<Record<string, { translatedText: string; detectedLangName: string | null; targetLangName: string | null }>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [showOriginalIds, setShowOriginalIds] = useState<Set<string>>(new Set());
  const nativeLang = profile?.native_language ?? null;

  // Auto-translate all text messages when native language is set
  useEffect(() => {
    if (!nativeLang) return;
    messages.forEach(msg => {
      if (msg.message_type !== 'text' || !msg.content) return;
      if (translations[msg.id]) return;
      if (translatingIds.has(msg.id)) return;

      setTranslatingIds(prev => new Set(prev).add(msg.id));
      translateText(msg.content, nativeLang).then(result => {
        setTranslatingIds(prev => { const n = new Set(prev); n.delete(msg.id); return n; });
        if (result && result.translatedText && result.translatedText !== msg.content) {
          setTranslations(prev => ({
            ...prev,
            [msg.id]: {
              translatedText: result.translatedText,
              detectedLangName: result.detectedLangName,
              targetLangName: result.targetLangName,
            },
          }));
        }
      });
    });
  }, [messages, nativeLang]);

  function toggleShowOriginal(msgId: string) {
    setShowOriginalIds(prev => {
      const n = new Set(prev);
      if (n.has(msgId)) n.delete(msgId); else n.add(msgId);
      return n;
    });
  }

  async function copyMessage(content: string, id: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  async function toggleReaction(msgId: string, emoji: string, _currentReactions?: Record<string, string[]>) {
    if (!user) return;
    const prevReactions = messages.find(m => m.id === msgId)?.reactions ?? {};
    // Optimistic: update local state immediately
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const updated = { ...(m.reactions ?? {}) };
      const users = updated[emoji] ?? [];
      if (users.includes(user.id)) {
        updated[emoji] = users.filter(u => u !== user.id);
        if (updated[emoji].length === 0) delete updated[emoji];
      } else {
        updated[emoji] = [...users, user.id];
      }
      return { ...m, reactions: updated };
    }));
    // Use RPC so ANY conversation member can react to ANY message
    const { error } = await supabase.rpc('toggle_message_reaction', { p_message_id: msgId, p_emoji: emoji });
    if (error) {
      // Revert optimistic update on failure
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: prevReactions } : m));
    }
    setShowEmojiFor(null);
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported in this browser.'); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let accumulated = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          accumulated += transcript;
        } else {
          interim += transcript;
        }
      }
      setText(prev => {
        const base = prev.replace(/\s+$/, '');
        const finalPart = accumulated ? (base && !base.endsWith(' ') ? ' ' : '') + accumulated.trim() : '';
        const interimPart = interim ? (finalPart || base ? ' ' : '') + interim : '';
        return base + finalPart + interimPart;
      });
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  function toggleAudio(id: string, url: string) {
    if (playingId === id) {
      audioRefs.current[id]?.pause();
      setPlayingId(null);
    } else {
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId].pause();
      }
      if (!audioRefs.current[id]) {
        const audio = new Audio(url);
        audio.onended = () => setPlayingId(null);
        audioRefs.current[id] = audio;
      }
      audioRefs.current[id].play();
      setPlayingId(id);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function trashConversation() {
    if (!user) return;
    setShowMenu(false);
    onTrash?.(conversation.id);
    onBack?.();
    await supabase
      .from('conversation_members')
      .update({ trashed_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id);
  }

  async function leaveConversation() {
    if (!user) return;
    setShowMenu(false);
    setShowLeaveConfirm(true);
  }

  async function confirmLeave() {
    if (!user) return;
    setShowLeaveConfirm(false);
    onLeave?.(conversation.id);
    onBack?.();
    await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', user.id);
  }

  async function handleNudge() {
    if (!user || !otherProfile || nudged) return;
    setShowMenu(false);
    try {
      await sendNotification(
        otherProfile.user_id,
        'mention',
        'Check Bubble!',
        `${profile?.display_name ?? 'Someone'} is nudging you to open Bubble.`,
        conversation.id
      );
      setNudged(true);
      setTimeout(() => setNudged(false), 3000);
    } catch (err) {
      console.error('Nudge failed:', err);
    }
  }

  async function toggleBlock() {
    if (!user || !otherProfile) return;
    setShowMenu(false);
    if (isBlocked) {
      setIsBlocked(false);
      await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', otherProfile.user_id);
    } else {
      setIsBlocked(true);
      await supabase.from('user_blocks').insert({
        blocker_id: user.id,
        blocked_id: otherProfile.user_id,
      });
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) return;
    setUploadingAvatar(true);
    try {
      const path = `group-avatars/${user.id}/${Date.now()}.${file.name.split('.').pop() ?? 'jpg'}`;
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('media').getPublicUrl(path);
      setEditAvatarUrl(data.publicUrl);
    } catch (err: any) {
      alert(err.message ?? 'Upload failed');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function saveEditInfo() {
    await supabase.from('conversations').update({
      name: editName.trim() || null,
      avatar_url: editAvatarUrl || null,
    }).eq('id', conversation.id);
    setShowEditInfo(false);
  }

  const replyMsg = replyTo ? messages.find(m => m.id === replyTo.id) ?? replyTo : null;

  function getReplyPreview(msg: Message) {
    if (msg.message_type === 'gif') return 'GIF';
    if (msg.message_type === 'image') return 'Photo';
    if (msg.message_type === 'voicemail') return 'Voice message';
    if (msg.message_type === 'poll') return 'Poll';
    if (msg.message_type === 'form') return 'Survey';
    if (msg.message_type === 'money') return `Money: ${msg.content}`;
    if (msg.message_type === 'iframe') return `Embed: ${msg.file_name || msg.content}`;
    if (msg.message_type === 'code') return msg.file_name ? `Code: ${msg.file_name}` : `Code: ${msg.code_language || 'snippet'}`;
    if (msg.message_type === 'file') return msg.file_name ?? 'File';
    if (msg.message_type === 'location') return `Location: ${msg.file_name ?? 'Shared'}`;
    return msg.content ?? '';
  }

  function getSenderName(msg: Message) {
    const sender = msg.sender as Profile | undefined;
    if (!sender) return '';
    return smartName(sender, conversation.members ?? []);
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatLastSeenHeader(ts?: string) {
    if (!ts) return 'recently';
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const seenDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((today.getTime() - seenDay.getTime()) / 86400000);
    if (dayDiff === 1) return `yesterday at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    if (dayDiff < 7) return `${d.toLocaleDateString([], { weekday: 'long' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    return d.toLocaleString([], {
      month: 'long',
      day: 'numeric',
      year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatDate(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86_400_000 && d.getDate() === now.getDate()) return 'Today';
    if (diff < 172_800_000) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Render text with auto-linked URLs
  function renderTextContent(content: string) {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s]+)|([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[^\s]*)?)/gi;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      if (part && i % 2 === 1) {
        const href = part.startsWith('http://') || part.startsWith('https://') ? part : 'https://' + part;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/40 hover:decoration-white/80 transition-all break-all"
            onClick={e => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  // Group messages by date and consecutive sender
  type MessageGroup = { date: string; items: { msg: Message; showAvatar: boolean; isFirst: boolean }[] };
  const grouped: MessageGroup[] = [];
  for (const msg of messages) {
    const date = formatDate(msg.created_at);
    let group = grouped[grouped.length - 1];
    if (!group || group.date !== date) {
      group = { date, items: [] };
      grouped.push(group);
    }
    const prev = group.items[group.items.length - 1];
    const sameSender = prev && prev.msg.sender_id === msg.sender_id;
    const closeInTime = prev && (new Date(msg.created_at).getTime() - new Date(prev.msg.created_at).getTime()) < 120_000;
    const isFirst = !sameSender || !closeInTime;
    group.items.push({ msg, showAvatar: isFirst, isFirst });
  }

  const canEditInfo = conversation.is_group || conversation.is_self_chat;

  return (
    <div
      className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative transition-colors duration-300"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('button, a, input, textarea, select, [role="dialog"], [contenteditable]')) return;
        inputRef.current?.focus();
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 dark:border-white/[0.05] bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
        {onBack && (
          <button onClick={onBack} className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all flex-shrink-0">
            <ArrowLeft size={20} />
          </button>
        )}
        <div
          className="flex-shrink-0 cursor-pointer"
          onClick={() => {
            if (conversation.is_group) setShowGroupInfo(true);
            else if (canEditInfo) setShowEditInfo(true);
            else if (otherProfile) setShowProfile(otherProfile);
          }}
>
          {conversation.is_group ? (
            conversation.avatar_url ? (
              <img src={conversation.avatar_url} alt={convName} className="w-10 h-10 rounded-full object-cover shadow-md" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md">
                <Users size={17} className="text-white" />
              </div>
            )
          ) : (
            <Avatar profile={displayProfile} size="md" showStatus={!conversation.is_self_chat} />
          )}
        </div>
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => {
            if (conversation.is_group) setShowGroupInfo(true);
            else if (canEditInfo) setShowEditInfo(true);
            else if (otherProfile) setShowProfile(otherProfile);
          }}
>
          <p className="text-slate-900 dark:text-white font-semibold text-[15px] truncate leading-tight">{convName}</p>
          {conversation.is_group ? (
            <p className="text-slate-500 text-[12px]">{conversation.members?.length ?? 0} members</p>
          ) : !conversation.is_self_chat && (
            <p className="text-[12px] capitalize" style={{ color: effectiveStatus(otherProfile) === 'online' ? '#34d399' : '#64748b' }}>
              {effectiveStatus(otherProfile) === 'online'
                ? (otherProfile?.status_message ? `online · ${otherProfile.status_message}` : 'online')
                : `last seen ${formatLastSeenHeader(otherProfile?.last_seen)}`}
            </p>
          )}
        </div>

        {!conversation.is_self_chat && (
          <div className="flex items-center gap-1">
            <HeaderBtn title="Voice call" onClick={() => handleStartCall('audio')}><Phone size={16} /></HeaderBtn>
            <HeaderBtn title="Video call" onClick={() => handleStartCall('video')}><Video size={16} /></HeaderBtn>
          </div>
        )}

        {/* Fantasy football chat/league toggle */}
        {ffLeagueId && (
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setShowDraftPanel(false)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                !showDraftPanel ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <MessageCircle size={13} />
              <span className="hidden sm:inline">Chat</span>
            </button>
            <button
              onClick={() => setShowDraftPanel(true)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                showDraftPanel ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Trophy size={13} />
              <span className="hidden sm:inline">Fantasy</span>
            </button>
          </div>
        )}

        {/* More menu */}
        <div className="relative z-[101]">
          <HeaderBtn title="More options" onClick={() => setShowMenu(s => !s)}>
            <MoreVertical size={18} />
          </HeaderBtn>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-[90]" onPointerDown={() => setShowMenu(false)} />
              <div className="absolute right-0 top-11 z-[100] bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl py-1.5 w-56 overflow-hidden max-h-[70vh] overflow-y-auto">
                {canEditInfo && (
                  <MenuItem icon={<Edit2 size={14} />} onClick={() => { setShowMenu(false); setShowEditInfo(true); }}>
                    {t('editChatInfo')}
                  </MenuItem>
                )}
                <MenuItem icon={showSavedOnly ? <BookmarkCheck size={14} className="text-sky-400" /> : <Bookmark size={14} />} onClick={() => { setShowMenu(false); setShowSavedOnly(s => !s); }}>
                  {showSavedOnly ? 'Show all messages' : 'Saved messages only'}
                </MenuItem>
                <MenuItem icon={<FolderOpen size={14} />} onClick={() => { setShowMenu(false); setShowFilesViewer(true); }}>
                  All files in chat
                </MenuItem>
                <MenuItem icon={<Bell size={14} />} onClick={() => { setShowMenu(false); setShowNotifSettings(true); }}>
                  Notification settings
                </MenuItem>
                <MenuItem icon={<Palette size={14} />} onClick={() => { setShowMenu(false); setShowWallpaperPicker(true); }}>
                  Wallpaper
                </MenuItem>
                <div className="my-1 h-px bg-slate-200 dark:bg-white/10" />
                <MenuItem icon={<Trash size={14} />} onClick={() => { setShowMenu(false); trashConversation(); }}>
                    {t('trashAction')}
                  </MenuItem>
                {!conversation.is_self_chat && (
                  <MenuItem icon={<LogOut size={14} />} onClick={() => { setShowMenu(false); leaveConversation(); }} danger>
                    {t('leaveChat')}
                  </MenuItem>
                )}
                {otherProfile && (
                  <MenuItem icon={<Bell size={14} />} onClick={() => { setShowMenu(false); handleNudge(); }}>
                    {nudged ? t('nudged') : t('nudge')}
                  </MenuItem>
                )}
                {otherProfile && (
                  <MenuItem icon={isBlocked ? <Check size={14} /> : <Ban size={14} />} onClick={() => { setShowMenu(false); toggleBlock(); }} danger={!isBlocked}>
                    {isBlocked ? t('unblockUser') : t('blockUser')}
                  </MenuItem>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages OR Draft Panel */}
      {showDraftPanel && ffLeagueId ? (
        <DraftPanel leagueId={ffLeagueId} />
      ) : (
      <>
      <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onPointerDown={lensActive ? onLensPointerDown : undefined}
        onPointerMove={lensActive ? onLensPointerMove : undefined}
        onPointerUp={lensActive ? onLensPointerUp : undefined}
        onPointerCancel={lensActive ? onLensPointerUp : undefined}
        onTouchStart={lensActive ? stopLensTouch : undefined}
        onTouchMove={lensActive ? stopLensTouch : undefined}
        onTouchEnd={lensActive ? stopLensTouch : undefined}
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-0.5 scrollbar-thin ${lensActive ? 'cursor-crosshair' : ''}`}
        style={{
          ...(wallpaper !== 'none' ? { background: getWallpaperCss(wallpaper) } : {}),
          ...(lensActive ? { touchAction: 'none' } : {}),
        }}
      >
        {grouped.map(group => (
          <div key={group.date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.05]" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium px-2">{group.date}</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.05]" />
            </div>
            {group.items.map(({ msg, isFirst, showAvatar }) => {
              if (showSavedOnly && !savedMsgIds.has(msg.id)) return null;
              const isMe = msg.sender_id === user?.id;
              const reactions = msg.reactions ?? {};
              const replyTarget = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null;
              const isHovered = hoveredId === msg.id || touchMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 group select-none ${isMe ? 'flex-row-reverse' : 'flex-row'} ${isFirst ? 'mt-3' : 'mt-0.5'}`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onTouchStart={() => setTouchMsgId(msg.id)}
                  onTouchEnd={() => setTimeout(() => setTouchMsgId(null), 2000)}
                >
                  {/* Avatar */}
                  <div className="w-8 flex-shrink-0 self-end">
                    {!isMe && showAvatar && (
                      <button onClick={() => msg.sender && setShowProfile(msg.sender as Profile)} className="hover:opacity-80 transition-opacity">
                        <Avatar profile={msg.sender as Profile} size="sm" />
                      </button>
                    )}
                  </div>

                  {/* Bubble */}
                  {(() => { const isMedia = msg.message_type === 'gif' || msg.message_type === 'image' || msg.message_type === 'iframe' || msg.message_type === 'code' || msg.message_type === 'location'; return (
                  <div className={`flex flex-col ${isMedia ? 'max-w-[min(100%,calc(100vw-5rem))]' : 'max-w-[85%]'} ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && conversation.is_group && isFirst && (
                      <button onClick={() => msg.sender && setShowProfile(msg.sender as Profile)} className="text-[11px] text-slate-500 font-medium mb-1 ml-1 hover:text-sky-500 transition-colors">{getSenderName(msg)}</button>
                    )}

                    {replyTarget && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-xl mb-[-6px] max-w-full bg-slate-100 dark:bg-slate-800/80">
                        <div className="w-0.5 h-full bg-sky-500 rounded-full flex-shrink-0" />
                        <p className="text-[11px] text-slate-400 truncate">{getReplyPreview(replyTarget)}</p>
                      </div>
                    )}

                    <div className={`relative rounded-2xl overflow-hidden ${
                      msg.message_type === 'gif' || msg.message_type === 'image' || msg.message_type === 'voicemail' || msg.message_type === 'poll' || msg.message_type === 'form' || msg.message_type === 'iframe' || msg.message_type === 'money' || msg.message_type === 'code' || msg.message_type === 'location' ? '' :
                      isMe ? 'bg-sky-500 text-white shadow-[0_1px_2px_rgba(2,132,199,0.25)]' : 'bg-slate-100 dark:bg-slate-800 dark:text-slate-100 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                    } ${replyTarget ? 'rounded-tl-md rounded-tr-md' : ''}`}>

                      {msg.message_type === 'text' && (
                        editingId === msg.id ? (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <input
                              autoFocus
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                              className="bg-transparent text-current text-[14px] focus:outline-none min-w-[120px]"
                            />
                            <button onClick={saveEdit} className="opacity-70 hover:opacity-100"><Check size={14} /></button>
                            <button onClick={() => setEditingId(null)} className="opacity-70 hover:opacity-100"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="px-3.5 py-2" data-msg-text={showOriginalIds.has(msg.id) ? (msg.content ?? '') : (translations[msg.id]?.translatedText ?? msg.content ?? '')} data-msg-id={msg.id}>
                            <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                              {renderTextContent(showOriginalIds.has(msg.id) ? (msg.content ?? '') : (translations[msg.id]?.translatedText ?? msg.content ?? ''))}
                              {msg.edited_at && <span className="text-[10px] opacity-60 ml-1.5">(edited)</span>}
                            </p>
                            {translations[msg.id] && !showOriginalIds.has(msg.id) && (
                              <button
                                onClick={() => toggleShowOriginal(msg.id)}
                                className="flex items-center gap-1 mt-1 text-[10px] opacity-60 hover:opacity-90 transition-opacity"
                              >
                                <Languages size={10} />
                                Auto-translated from {translations[msg.id].detectedLangName ?? 'another language'}
                              </button>
                            )}
                            {translations[msg.id] && showOriginalIds.has(msg.id) && (
                              <button
                                onClick={() => toggleShowOriginal(msg.id)}
                                className="flex items-center gap-1 mt-1 text-[10px] opacity-60 hover:opacity-90 transition-opacity"
                              >
                                <Languages size={10} />
                                Show translation
                              </button>
                            )}
                            {translatingIds.has(msg.id) && !translations[msg.id] && (
                              <p className="text-[10px] opacity-50 mt-1">Translating...</p>
                            )}
                          </div>
                        )
                      )}

                      {msg.message_type === 'gif' && msg.gif_url && (
                        <GifMedia src={msg.gif_url} alt="GIF" className="w-full max-w-[min(640px,calc(100vw-4rem))] max-h-[460px] object-contain rounded-2xl" />
                      )}

                      {msg.message_type === 'image' && msg.media_url && (
                        <img src={msg.media_url} alt="Image" className="w-full max-w-[min(640px,calc(100vw-4rem))] max-h-[520px] object-contain rounded-2xl" />
                      )}

                      {msg.message_type === 'file' && msg.media_url && (
                        <a
                          href={msg.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-3 px-4 py-3 min-w-[180px] ${isMe ? '' : ''}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isMe ? 'bg-white/20' : 'bg-sky-500/20'
                          }`}>
                            <FileText size={18} className="text-current" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-current truncate">{msg.file_name ?? 'File'}</p>
                            <p className="text-[11px] opacity-60">{formatFileSize(msg.file_size)}</p>
                          </div>
                          <Download size={14} className="opacity-60 flex-shrink-0" />
                        </a>
                      )}

                      {msg.message_type === 'voicemail' && msg.media_url && (
                        <div className={`flex items-center gap-3 px-4 py-3 min-w-[180px] ${isMe ? 'bg-sky-500' : 'bg-slate-100 dark:bg-slate-800'}`}>
                          <button
                            onClick={() => toggleAudio(msg.id, msg.media_url!)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isMe ? 'bg-white/20 hover:bg-white/30' : 'bg-sky-500/20 hover:bg-sky-500/30'
                            } transition-all`}
                          >
                            {playingId === msg.id ? <Pause size={15} className="text-current" /> : <Play size={15} className="text-current ml-0.5" />}
                          </button>
                          <div className="flex-1 flex items-center gap-0.5">
                            {Array.from({ length: 20 }).map((_, i) => (
                              <div key={i} className="w-0.5 rounded-full bg-slate-100 dark:bg-white/50" style={{ height: `${8 + Math.sin(i * 0.8) * 6}px` }} />
                            ))}
                          </div>
                          <Mic size={13} className="opacity-60 flex-shrink-0" />
                        </div>
                      )}

                      {msg.message_type === 'poll' && msg.content && user && (
                        <PollMessage pollId={msg.content} userId={user.id} />
                      )}

                      {msg.message_type === 'form' && msg.content && user && (
                        <FormMessage formId={msg.content} userId={user.id} />
                      )}

                      {msg.message_type === 'iframe' && msg.content && (
                        <EmbedFrame url={msg.content} file_name={msg.file_name} />
                      )}

                      {msg.message_type === 'location' && msg.content && (() => {
                        const [lat, lng] = msg.content.split(',').map(Number);
                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                        return (
                          <div className="w-full max-w-[min(360px,calc(100vw-3rem))]">
                            <LocationMap latitude={lat} longitude={lng} label={msg.file_name ?? 'Meeting point'} height={160} />
                          </div>
                        );
                      })()}

                      {msg.message_type === 'code' && msg.content && (() => {
                        const codeLang = msg.code_language || 'code';
                        const canPreviewCode = codeLang === 'html' || codeLang === 'iframe';
                        const codeMode = codeViewModes[msg.id] ?? (canPreviewCode ? 'preview' : 'raw');
                        const note = msg.file_name || null;
                        const activeTabCls = 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm';
                        const inactiveTabCls = 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5';
                        const headerCls = note ? 'flex items-center gap-1 px-2 py-1.5 bg-slate-100 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/[0.06]' : 'flex items-center gap-1 px-2 py-1.5 bg-slate-100 dark:bg-white/[0.04] rounded-t-2xl border-b border-slate-200 dark:border-white/[0.06]';
                        return (
                          <div className="w-full max-w-[min(640px,calc(100vw-3rem))]">
                            {note && (
                              <div className="flex items-start gap-2 px-3 py-2 bg-sky-500/10 dark:bg-sky-500/[0.08] rounded-t-2xl border border-b-0 border-sky-500/20 dark:border-sky-500/15">
                                <MessageCircle size={13} className="text-sky-500 flex-shrink-0 mt-0.5" />
                                <p className="text-[13px] text-slate-700 dark:text-sky-100 font-medium leading-snug break-words">{note}</p>
                              </div>
                            )}
                            <div className={headerCls}>
                              <div className="flex items-center gap-1.5 px-2 flex-shrink-0">
                                <div className="w-5 h-5 rounded-md bg-sky-500/15 flex items-center justify-center">
                                  <Code2 size={10} className="text-sky-500" />
                                </div>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{codeLang}</span>
                              </div>
                              <div className="flex items-center gap-0.5 ml-1">
                                {canPreviewCode && (
                                  <button
                                    onClick={() => setCodeViewModes(prev => ({ ...prev, [msg.id]: 'preview' }))}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${codeMode === 'preview' ? activeTabCls : inactiveTabCls}`}
                                  >
                                    <Eye size={11} /> Preview
                                  </button>
                                )}
                                <button
                                  onClick={() => setCodeViewModes(prev => ({ ...prev, [msg.id]: 'raw' }))}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${codeMode === 'raw' ? activeTabCls : inactiveTabCls}`}
                                >
                                  <Code2 size={11} /> Code
                                </button>
                              </div>
                              <button
                                onClick={() => setFullscreenCode({ code: msg.content!, language: codeLang, note })}
                                className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5 transition-all"
                                title="Open fullscreen"
                              >
                                <Maximize2 size={12} />
                              </button>
                            </div>
                            <div className="bg-slate-950 dark:bg-black/40 rounded-b-2xl overflow-hidden border border-t-0 border-slate-200 dark:border-white/[0.06]" style={{ maxHeight: '320px' }}>
                              {canPreviewCode && codeMode === 'preview' ? (
                                <iframe
                                  srcDoc={msg.content}
                                  title="Code preview"
                                  sandbox="allow-scripts"
                                  className="w-full bg-white"
                                  style={{ height: '280px', border: 'none' }}
                                />
                              ) : (
                                <div className="overflow-auto scrollbar-thin" style={{ maxHeight: '320px' }}>
                                  <pre className="p-3 text-[12px] leading-relaxed font-mono text-sky-200 whitespace-pre-wrap break-words">
                                    <code>{msg.content}</code>
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {msg.message_type === 'money' && (
                        <div className="min-w-[200px] rounded-2xl overflow-hidden border border-emerald-500/20">
                          <div className="bg-emerald-500/10 px-4 py-2.5 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <DollarSign size={14} className="text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-[12px]">
                                {isMe ? 'You sent' : 'You received'}
                              </p>
                              <p className="text-slate-900 dark:text-white font-bold text-[15px]">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 px-4 py-2 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">via PayPal</span>
                            <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                              <Check size={10} /> Completed
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Reactions */}
                    {Object.keys(reactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji, reactions)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] transition-all ${
                              users.includes(user?.id ?? '')
                                ? 'bg-sky-500/20 border border-sky-500/40'
                                : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:bg-white/10'
                            }`}
                          >
                            <span>{emoji}</span>
                            {users.length > 1 && <span className="text-slate-500 dark:text-slate-400">{users.length}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[10px] text-slate-600 mt-0 ${isMe ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isMe && !msg.id.startsWith('temp-') && (
                        msg.read_by && msg.read_by.length > 0 ? (
                          <span className="flex items-center" title={`Read by ${msg.read_by.length} ${msg.read_by.length === 1 ? 'person' : 'people'}`}>
                            <Eye size={12} className="text-sky-400" />
                          </span>
                        ) : (
                          <span className="flex items-center" title="Sent">
                            <Check size={12} className="text-slate-400" />
                          </span>
                        )
                      )}
                    </div>
                    <style>{`@keyframes receiptDot { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }`}</style>
                  </div>
                  ); })()}

                  {/* Actions */}
                  {isHovered && (
                    <div className={`flex items-center gap-0.5 flex-shrink-0 self-end mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <MsgAction onClick={startLensReply} title="Reply">
                        <Reply size={13} />
                      </MsgAction>
                      {msg.message_type === 'text' && (
                        <MsgAction onClick={() => copyMessage(msg.content ?? '', msg.id)} title="Copy">
                          {copiedId === msg.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                        </MsgAction>
                      )}
                      {msg.message_type === 'code' && (
                        <MsgAction onClick={() => copyMessage(msg.content ?? '', msg.id)} title="Copy code">
                          {copiedId === msg.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                        </MsgAction>
                      )}
                      <MsgAction onClick={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)} title="React">
                        <Smile size={13} />
                      </MsgAction>
                      <MsgAction onClick={() => toggleSaveMessage(msg)} title={savedMsgIds.has(msg.id) ? 'Unsave' : 'Save'}>
                        {savedMsgIds.has(msg.id) ? <BookmarkCheck size={13} className="text-sky-400" /> : <Bookmark size={13} />}
                      </MsgAction>
                      {isMe && msg.message_type === 'text' && (
                        <MsgAction onClick={() => { setEditingId(msg.id); setEditText(msg.content ?? ''); }} title="Edit">
                          <Edit2 size={13} />
                        </MsgAction>
                      )}
                      {isMe && (
                        <MsgAction onClick={() => deleteMessage(msg.id)} title="Delete">
                          <Trash2 size={13} />
                        </MsgAction>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {loadingMessages && messages.length === 0 && (Date.now() - new Date(conversation.created_at).getTime() > 10000) && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <BubbleLoader size={32} />
            <p className="text-slate-500 text-[13px]">Loading messages...</p>
          </div>
        )}

        {messages.length === 0 && !loadingMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
              {conversation.is_group
                ? <Users size={22} className="text-slate-500 dark:text-slate-500" />
                : <Avatar profile={displayProfile} size="lg" />
              }
            </div>
            <p className="text-slate-900 dark:text-white font-semibold">
              {conversation.is_self_chat ? 'Your private notes' : conversation.is_group ? convName : `Chat with ${convName}`}
            </p>
            <p className="text-slate-500 text-sm">
              {conversation.is_self_chat ? 'Only you can see this.' : 'Send your first message!'}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply selection overlay */}
      {lensActive && lensRect && (
        <div
          onTouchStart={stopLensTouch}
          onTouchMove={stopLensTouch}
          onTouchEnd={stopLensTouch}
          className="absolute pointer-events-none border-2 border-sky-500 bg-sky-500/15 rounded-md z-20"
          style={{
            left: lensRect.left,
            top: lensRect.top,
            width: lensRect.right - lensRect.left,
            height: lensRect.bottom - lensRect.top,
          }}
        >
          <div
            onPointerDown={e => beginLensDrag(e, 'move', lensRect)}
            className="absolute inset-0 pointer-events-auto touch-none cursor-move"
          />
          {LENS_HANDLES.map(h => (
            <div
              key={h.edge}
              onPointerDown={e => beginLensDrag(e, h.edge, lensRect)}
              className={`absolute w-7 h-7 flex items-center justify-center pointer-events-auto touch-none ${h.pos}`}
              style={{ cursor: h.cursor }}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-sky-500 border-2 border-white shadow" />
            </div>
          ))}
        </div>
      )}
      </div>

      {lensActive && (
        <div
          onTouchStart={stopLensTouch}
          onTouchMove={stopLensTouch}
          onTouchEnd={stopLensTouch}
          className="flex-shrink-0 px-3 py-2.5 bg-sky-500/10 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-2"
        >
          {lensRect ? (
            <div className="flex items-center gap-2">
              <div className="flex p-0.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10">
                {(['all', 'mine'] as const).map(scope => (
                  <button
                    key={scope}
                    onClick={() => setLensScope(scope)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      lensScope === scope ? 'bg-sky-500 text-white shadow' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {scope === 'all' ? 'Everyone' : 'Only mine'}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-slate-600 dark:text-slate-300">{lensSelected.length} selected</span>
            </div>
          ) : (
            <span className="text-[12px] text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1.5">
              <ScanText size={14} />
              Drag over messages to select them
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={closeLens}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            {lensRect && (
              <button
                onClick={confirmLensReply}
                disabled={lensSelected.length === 0}
                className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-semibold transition-all"
              >
                Reply
              </button>
            )}
          </div>
        </div>
      )}

      {/* Emoji reaction picker — fixed bottom sheet so it never gets clipped */}
      {showEmojiFor && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setShowEmojiFor(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-[90] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 rounded-t-3xl shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in" style={{ animation: 'slideUp 0.2s ease-out' }}>
            <div className="w-10 h-1 bg-slate-300 dark:bg-white/20 rounded-full mx-auto mb-3" />
            <p className="text-center text-[13px] text-slate-500 dark:text-slate-400 mb-3">React with an emoji</p>
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-w-md mx-auto">
              {EMOJI_LIST.map(e => (
                <button
                  key={e}
                  onClick={() => {
                    const targetMsg = messages.find(m => m.id === showEmojiFor);
                    if (targetMsg) toggleReaction(targetMsg.id, e, targetMsg.reactions ?? {});
                  }}
                  className="w-10 h-10 flex items-center justify-center hover:scale-125 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all text-[26px] leading-none"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Scroll to bottom button + Smart Summary button */}
      {showScrollBtn && (
        <div className="absolute bottom-24 right-6 flex flex-col gap-2 z-10 items-end">
          <button
            onClick={() => { setShowSummary(true); }}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 flex items-center justify-center text-white shadow-lg transition-all active:scale-90"
            title="Smart summary"
            style={{ animation: 'summarySlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <BookOpen size={16} />
          </button>
          <button
            onClick={() => { scrollToBottom('smooth', true); inputRef.current?.focus(); }}
            className="w-10 h-10 rounded-full bg-sky-500 hover:bg-sky-400 flex items-center justify-center text-white shadow-lg shadow-sky-500/30 transition-all active:scale-90"
            style={{ animation: 'arrowFadeIn 0.3s ease-out 0.25s both' }}
          >
            <ChevronDown size={16} />
          </button>
          <style>{`@keyframes summarySlideUp { 0% { opacity: 0; transform: translateY(44px) scale(0.8); } 100% { opacity: 1; transform: translateY(0) scale(1); } } @keyframes arrowFadeIn { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Typing indicator — above the text bar, only when someone is typing */}
      {typingUsers.length > 0 && (
        <div className="flex-shrink-0 px-4 pt-2 flex items-center gap-2">
          <span className="flex gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" style={{ animation: 'typingDot 1.2s ease-in-out infinite' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" style={{ animation: 'typingDot 1.2s ease-in-out infinite 0.15s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" style={{ animation: 'typingDot 1.2s ease-in-out infinite 0.3s' }} />
          </span>
          <span className="text-[12px] text-slate-500 dark:text-slate-400">
            {typingUsers.length === 1
              ? `${smartName(typingUsers[0], conversation.members ?? [])} is typing…`
              : typingUsers.length === 2
              ? `${smartName(typingUsers[0], conversation.members ?? [])} and ${smartName(typingUsers[1], conversation.members ?? [])} are typing…`
              : `${typingUsers.length} people are typing…`}
          </span>
          <style>{`@keyframes typingDot { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }`}</style>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-white/[0.05] bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm px-2 sm:px-3 py-2 sm:py-2.5" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {replyMsg && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/[0.05]">
            <Reply size={13} className="text-sky-400 flex-shrink-0" />
            <p className="flex-1 text-[12px] text-slate-400 truncate">{getReplyPreview(replyMsg)}</p>
            <button onClick={() => setReplyTo(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {/* Attach button opens menu */}
          <button
            onClick={() => setShowAttachMenu(true)}
            disabled={uploadingFile}
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-300 transition-all"
            title="Attach"
          >
            {uploadingFile ? (
              <BubbleLoader size={22} />
            ) : (
              <Paperclip size={18} />
            )}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <input ref={docInputRef} type="file" className="hidden" onChange={handleFileUpload} />

          {/* Text area */}
          <div className="flex-1 relative flex flex-col bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] hover:border-white/[0.12] focus-within:border-sky-500/50 rounded-2xl px-3 py-2 transition-all">
            {pastedCode && !showCodePreview && (
              <div className="flex items-center gap-2 mb-1.5 px-2 py-1.5 bg-sky-500/10 rounded-lg border border-sky-500/20">
                {pastedLang === 'iframe' ? <Link2 size={13} className="text-sky-500 flex-shrink-0" /> : <Code2 size={13} className="text-sky-500 flex-shrink-0" />}
                <span className="text-[11px] text-sky-600 dark:text-sky-400 font-medium truncate flex-1">
                  {pastedLang === 'iframe' ? 'Embed code' : `${pastedLang} snippet`} ready to send
                </span>
                {(pastedLang === 'html' || pastedLang === 'iframe') && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold flex-shrink-0">
                    VISUAL + CODE
                  </span>
                )}
                <button onClick={() => { setShowCodePreview(true); }} className="text-[11px] text-sky-500 hover:text-sky-400 font-medium transition-colors flex-shrink-0">Preview</button>
                <button onClick={() => { setPastedCode(''); setPastedLang(''); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex-shrink-0">
                  <X size={12} />
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => {
                setText(e.target.value);
                broadcastTyping();
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => {
                  clearTyping();
                }, 2500);
              }}
              onKeyDown={(e) => {
                handleKeyDown(e);
              }}
              onPaste={handlePaste}
              onBlur={() => { if (!text.trim()) clearTyping(); }}
              placeholder={isBlocked ? t('blockedPlaceholder') : t('messagePlaceholder')}
              disabled={isBlocked}
              rows={1}
              className="flex-1 bg-transparent text-[14px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none resize-none scrollbar-thin disabled:opacity-50"
              style={{ maxHeight: 300, height: 'auto' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 300) + 'px';
              }}
            />
          </div>

          {/* Right buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowGifPicker(s => !s)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                showGifPicker ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="GIFs"
            >
              <Smile size={18} />
            </button>
            <button
              onClick={toggleDictation}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                listening ? 'bg-sky-500/20 text-sky-400 animate-pulse' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title={listening ? 'Stop dictation' : 'Dictate text'}
            >
              <Mic size={18} />
            </button>
            <button
              onClick={() => sendMessage()}
              disabled={!text.trim() || sending || isBlocked}
              className="w-9 h-9 rounded-full bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 flex items-center justify-center text-white transition-all shadow-lg shadow-sky-500/20"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {showGifPicker && (
          <div className="mt-2">
            <GifPicker
              onSelect={sendGif}
              onClose={() => setShowGifPicker(false)}
              conversationId={conversation.id}
              onOpenStudio={() => { setShowGifPicker(false); onOpenGifStudio(); }}
            />
          </div>
        )}
      </div>
      </>
      )}

      {/* Edit chat info modal */}
      {showEditInfo && canEditInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/5">
              <h2 className="text-slate-900 dark:text-white font-bold text-lg">Edit Chat Info</h2>
              <button onClick={() => setShowEditInfo(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {conversation.is_group && (
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="relative w-20 h-20 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center cursor-pointer overflow-hidden group"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {editAvatarUrl ? (
                      <img src={editAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Users size={28} className="text-white" />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingAvatar ? <BubbleLoader size={22} /> : <Camera size={18} className="text-white" />}
                    </div>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>
                  <p className="text-slate-500 text-xs">Tap to change photo</p>
                </div>
              )}
              <div className="bg-slate-100 dark:bg-white/5 rounded-xl px-4 py-3">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chat name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Enter chat name..."
                  className="block w-full mt-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-500 text-[15px] focus:outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={saveEditInfo}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group info modal — view members, add/remove */}
      {showGroupInfo && conversation.is_group && (
        <GroupInfoModal
          conversation={conversation}
          onClose={() => setShowGroupInfo(false)}
          onMembersChanged={() => onMembersChanged?.()}
        />
      )}

      {/* Leave chat confirmation modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <LogOut size={24} className="text-red-400" />
              </div>
              <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-2">Leave chat?</h2>
              <p className="text-slate-400 text-[14px] leading-relaxed">
                You will be removed from this conversation and it will disappear from your chats. Someone can add you back later.
              </p>
            </div>
            <div className="flex gap-3 p-6 pt-4">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] text-slate-900 dark:text-white font-semibold text-[14px] rounded-xl transition-all border border-slate-200 dark:border-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeave}
                className="flex-1 py-3 bg-red-500 hover:bg-red-400 text-white font-semibold text-[14px] rounded-xl transition-all shadow-lg shadow-red-500/20"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <ProfileModal
          profile={showProfile}
          conversationId={conversation.id}
          onClose={() => setShowProfile(null)}
        />
      )}

      {showAttachMenu && (
        <AttachMenu
          hasPayPal={!!myPayPalEmail && !!recipientPayPalEmail && !conversation.is_group && !conversation.is_self_chat}
          onClose={() => setShowAttachMenu(false)}
          onSelect={(opt) => {
            setShowAttachMenu(false);
            if (opt === 'file') fileInputRef.current?.click();
            else if (opt === 'document') docInputRef.current?.click();
            else if (opt === 'voice') setShowVoiceRecorder(true);
            else if (opt === 'iframe') setShowIframeModal(true);
            else if (opt === 'poll') setShowPollCreator(true);
            else if (opt === 'form') setShowFormCreator(true);
            else if (opt === 'selfie') setShowSelfieModal(true);
            else if (opt === 'money') setShowSendMoney(true);
            else if (opt === 'gif') setShowGifPicker(true);
            else if (opt === 'location') setShowLocationPicker(true);
          }}
        />
      )}

      {autofillSuggestion && (
        <div className="absolute bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] left-1/2 -translate-x-1/2 z-[70] w-full max-w-sm px-4">
          <div className="bg-slate-800 dark:bg-slate-700 text-white rounded-2xl shadow-2xl p-3.5 flex items-start gap-3 animate-in" style={{ animation: 'slideUp 0.25s ease-out' }}>
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
              <Phone size={14} className="text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white">
                Save this to your contact info for {autofillSuggestion.senderName}?
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {CONTACT_DETAIL_FIELDS
                  .filter(f => autofillSuggestion.info[f.key])
                  .map(f => `${f.label}: ${autofillSuggestion.info[f.key]}`)
                  .join(' · ')}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={async () => {
                    if (!user) return;
                    const patch = Object.fromEntries(
                      Object.entries(autofillSuggestion.info).filter(([, v]) => v),
                    ) as Partial<ContactDetails>;
                    await saveContactDetails(user.id, autofillSuggestion.senderId, patch);
                    setAutofillSuggestion(null);
                  }}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-[12px] font-semibold rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setAutofillSuggestion(null)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-300 text-[12px] font-medium rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLocationPicker && (
        <LocationPicker
          onClose={() => setShowLocationPicker(false)}
          onPick={(lat, lng, label) => {
            setShowLocationPicker(false);
            sendMessage('location', { content: `${lat},${lng}`, file_name: label });
          }}
        />
      )}

      {showVoiceRecorder && (
        <div className="fixed inset-0 z-[11000] flex items-end justify-center p-4 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5.5rem))] bg-black/40 backdrop-blur-[2px]" onClick={() => setShowVoiceRecorder(false)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <VoiceRecorder
              onSend={handleVoiceSend}
              onCancel={() => setShowVoiceRecorder(false)}
            />
          </div>
        </div>
      )}

      {showPollCreator && (
        <PollCreator
          onSubmit={handleSendPoll}
          onClose={() => setShowPollCreator(false)}
        />
      )}

      {showFormCreator && (
        <FormCreator
          onSubmit={handleSendForm}
          onClose={() => setShowFormCreator(false)}
        />
      )}

      {showIframeModal && (
        <IframeModal
          onSubmit={handleSendIframe}
          onClose={() => setShowIframeModal(false)}
        />
      )}

      {showCodePreview && pastedCode && (
        <CodePreviewModal
          code={pastedCode}
          language={pastedLang}
          onSubmit={handleSendCode}
          onClose={() => { setShowCodePreview(false); setPastedCode(''); setPastedLang(''); }}
        />
      )}

      {showSelfieModal && (
        <SelfieModal
          onCapture={handleSelfieCapture}
          onClose={() => setShowSelfieModal(false)}
        />
      )}

      {showSendMoney && otherProfile && user && (
        <SendMoneyModal
          recipientId={otherProfile.user_id}
          recipientName={otherProfile.display_name}
          senderPayPalEmail={myPayPalEmail ?? ''}
          onSent={handleMoneyDone}
          onClose={() => setShowSendMoney(false)}
        />
      )}

      {(undoDelete || undoEdit) && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] bg-slate-800 dark:bg-slate-700 text-white rounded-full shadow-2xl flex items-center gap-3 pl-4 pr-2 py-2 animate-in"
          style={{ animation: 'slideUp 0.2s ease-out' }}
        >
          <span className="text-[13px] font-medium">{undoEdit ? 'Message edited' : 'Message deleted'}</span>
          <button
            onClick={undoEdit ? undoEditMessage : undoDeleteMessage}
            className="text-sky-400 hover:text-sky-300 text-[13px] font-bold transition-colors px-3 py-1 rounded-full hover:bg-white/10"
          >
            Undo
          </button>
          <button
            onClick={() => {
              if (undoEdit) { clearTimeout(undoEdit.timer); setUndoEdit(null); }
              if (undoDelete) { clearTimeout(undoDelete.timer); setUndoDelete(null); }
            }}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {showSummary && (
        <ConversationSummaryModal
          conversationId={conversation.id}
          conversationName={convName}
          lastReadAt={lastReadAt}
          onClose={() => setShowSummary(false)}
        />
      )}

      {fullscreenCode && (
        <FullscreenCodeViewer
          code={fullscreenCode.code}
          language={fullscreenCode.language}
          note={fullscreenCode.note}
          onClose={() => setFullscreenCode(null)}
        />
      )}

      {showFilesViewer && (
        <FilesViewer conversationId={conversation.id} onClose={() => setShowFilesViewer(false)} />
      )}

      {showNotifSettings && (
        <NotificationSettings conversationId={conversation.id} onClose={() => setShowNotifSettings(false)} />
      )}

      {showWallpaperPicker && (
        <WallpaperPicker
          conversationId={conversation.id}
          isGroup={conversation.is_group}
          isCreator={conversation.created_by === user?.id}
          onClose={() => setShowWallpaperPicker(false)}
        />
      )}
    </div>
  );
}

function FullscreenCodeViewer({ code, language, note, onClose }: { code: string; language: string; note: string | null; onClose: () => void }) {
  const [view, setView] = useState<'preview' | 'raw'>(language === 'html' || language === 'iframe' ? 'preview' : 'raw');
  const canPreview = language === 'html' || language === 'iframe';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
            <Code2 size={16} className="text-sky-500" />
          </div>
          <div>
            <h2 className="text-white font-bold text-[15px]">Code Viewer</h2>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{language}</span>
              {canPreview && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                  Visual + Code
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Note at top */}
      {note && (
        <div className="flex items-start gap-2 px-5 py-3 bg-sky-500/10 border-b border-sky-500/15 flex-shrink-0">
          <MessageCircle size={15} className="text-sky-400 flex-shrink-0 mt-0.5" />
          <p className="text-[14px] text-sky-100 font-medium leading-snug break-words">{note}</p>
        </div>
      )}

      {/* Tab toggle */}
      {canPreview && (
        <div className="flex gap-1 p-1 mx-5 mt-4 bg-white/5 rounded-xl flex-shrink-0 max-w-xs">
          <button
            onClick={() => setView('preview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              view === 'preview' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400'
            }`}
          >
            <Eye size={14} /> Visual Preview
          </button>
          <button
            onClick={() => setView('raw')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              view === 'raw' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400'
            }`}
          >
            <Code2 size={14} /> Source Code
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-5 overflow-hidden">
        <div className="bg-black/40 rounded-2xl border border-white/10 overflow-hidden h-full">
          {canPreview && view === 'preview' ? (
            <iframe
              srcDoc={code}
              title="Code preview"
              sandbox="allow-scripts"
              className="w-full bg-white"
              style={{ height: '100%', border: 'none' }}
            />
          ) : (
            <div className="overflow-auto scrollbar-thin h-full">
              <pre className="p-5 text-[13px] leading-relaxed font-mono text-sky-200 whitespace-pre-wrap break-words">
                <code>{code}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-300 transition-all"
    >
      {children}
    </button>
  );
}

function MsgAction({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-200"
    >
      {children}
    </button>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-all ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
      }`}
    >
      <span className={danger ? 'text-red-400' : 'text-slate-500 dark:text-slate-400'}>{icon}</span>
      {children}
    </button>
  );
}

function getEmbedInfo(raw: string): { src: string; thumb: string | null; isVideo: boolean; height: number } {
  let u = raw;
  const srcMatch = u.match(/src=["']([^"']+)["']/i);
  if (srcMatch) u = srcMatch[1];

  // YouTube
  const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([^&?#/]+)/);
  if (ytMatch) {
    return {
      src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`,
      thumb: `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
      isVideo: true,
      height: 400,
    };
  }

  // Spotify
  if (u.includes('spotify.com')) {
    if (u.includes('/embed/')) return { src: u, thumb: null, isVideo: false, height: 380 };
    let s = u.split('?')[0];
    s = s.replace('open.spotify.com/', 'open.spotify.com/embed/');
    return { src: s, thumb: null, isVideo: false, height: 380 };
  }

  // SoundCloud
  if (u.includes('soundcloud.com') && !u.includes('w.soundcloud.com')) {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&color=%23ff5500&auto_play=false`,
      thumb: null,
      isVideo: false,
      height: 400,
    };
  }

  // TikTok
  if (u.includes('tiktok.com') && !u.includes('embed')) {
    const tm = u.match(/tiktok\.com\/@([^/]+)\/video\/(\d+)/);
    if (tm) return { src: `https://www.tiktok.com/embed/v2/${tm[2]}`, thumb: null, isVideo: true, height: 400 };
  }

  // Vimeo
  const vimeoMatch = u.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { src: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`, thumb: null, isVideo: true, height: 400 };

  return { src: u, thumb: null, isVideo: false, height: 240 };
}

function EmbedFrame({ url, file_name }: { url: string; file_name: string | null }) {
  const [activated, setActivated] = useState(false);
  const info = getEmbedInfo(url);
  const displayUrl = url.includes('src=') ? (url.match(/src=["']([^"']+)["']/i)?.[1] ?? url) : url;

  if (activated || !info.isVideo) {
    return (
      <div className="p-1.5 space-y-1.5 w-full max-w-[min(720px,calc(100vw-4rem))]">
        <div className="flex items-center gap-2 px-1.5">
          <ExternalLink size={13} className="text-purple-400 flex-shrink-0" />
          <p className="opacity-70 text-[11px] truncate">{file_name || url}</p>
        </div>
        <iframe
          src={info.src}
          allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share; autoplay"
          allowFullScreen
          className="w-full rounded-xl border-0"
          style={{ height: info.height }}
          title={file_name || 'Embed'}
          loading="lazy"
          tabIndex={-1}
        />
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-[11px] transition-colors px-1.5"
        >
          <ExternalLink size={11} /> Open in browser
        </a>
      </div>
    );
  }

  // Click-to-play thumbnail for video embeds
  return (
    <div className="p-1.5 space-y-1.5 w-full max-w-[min(720px,calc(100vw-4rem))]">
      <div className="flex items-center gap-2 px-1.5">
        <ExternalLink size={13} className="text-purple-400 flex-shrink-0" />
        <p className="opacity-70 text-[11px] truncate">{file_name || url}</p>
      </div>
      <button
        onClick={() => setActivated(true)}
        className="relative w-full rounded-xl overflow-hidden group"
        style={{ height: info.height }}
      >
        {info.thumb ? (
          <img
            src={info.thumb}
            alt={file_name ?? 'Video thumbnail'}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-slate-800 dark:bg-slate-700" />
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-all flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-red-600/90 group-hover:bg-red-500 group-hover:scale-110 transition-all flex items-center justify-center shadow-2xl">
            <Play size={28} className="text-white ml-1" fill="white" />
          </div>
        </div>
      </button>
      <a
        href={displayUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-[11px] transition-colors px-1.5"
      >
        <ExternalLink size={11} /> Open in browser
      </a>
    </div>
  );
}

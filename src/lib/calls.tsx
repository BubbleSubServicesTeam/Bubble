import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Profile } from './supabase';

export type CallType = 'audio' | 'video';
export type CallRole = 'caller' | 'callee';
export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export type ActiveCall = {
  callId: string;
  conversationId: string;
  conversationName: string;
  callerName: string | null;
  conversationAvatarUrl: string | null;
  isGroup: boolean;
  type: CallType;
  role: CallRole;
  peer: Profile | null;
  peerIds: string[];
  state: CallState;
  startedAt: number | null;
  micOn: boolean;
  camOn: boolean;
  videoUrl: string | null;
};

type SignalingPayload =
  | { kind: 'offer'; callId: string; type: CallType; callerId: string; callerName: string; conversationId: string; conversationName: string; conversationAvatarUrl: string | null; isGroup: boolean; targetId: string; videoUrl: string | null }
  | { kind: 'answer'; sdp: string; callId: string }
  | { kind: 'ice'; candidate: string; callId: string; from: string }
  | { kind: 'reject'; callId: string }
  | { kind: 'cancel'; callId: string }
  | { kind: 'end'; callId: string }
  | { kind: 'video_join'; callId: string; videoUrl: string };

type CallCtx = {
  activeCall: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (params: {
    conversationId: string; conversationName: string; conversationAvatarUrl: string | null;
    isGroup: boolean; type: CallType; peer: Profile | null; peerIds: string[];
  }) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
};

const CallContext = createContext<CallCtx | null>(null);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const VIDEO_CALL_BASE = 'https://bubblesubserviceteam.github.io/ZXYsupernova/';

function generateVideoCallId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function buildVideoUrl(callId: string): string {
  return `${VIDEO_CALL_BASE}#${callId}`;
}

function convChannelName(conversationId: string) {
  return `call_signal_${conversationId}`;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);

  useEffect(() => { 
    activeCallRef.current = activeCall; 
    window.__bubbleInCall = !!activeCall && (activeCall.state === 'active' || activeCall.state === 'connecting' || activeCall.state === 'outgoing' || activeCall.state === 'incoming');
  }, [activeCall]);

  const cleanupStreams = useCallback(() => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop(); } catch {} });
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pendingIceRef.current = [];
    pendingOfferRef.current = null;
    callIdRef.current = null;
  }, []);

  const removeChannel = useCallback(() => {
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
  }, []);

  const sendSignal = useCallback((payload: SignalingPayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload });
  }, []);

  const endCall = useCallback(() => {
    if (callIdRef.current && activeCallRef.current && activeCallRef.current.state !== 'incoming') {
      sendSignal({ kind: 'end', callId: callIdRef.current });
    }
    removeChannel();
    cleanupStreams();
    setActiveCall(null);
    // After the call ends, check if PIN should re-lock
    window.__bubbleInCall = false;
    setTimeout(() => {
      if (!document.hasFocus() || document.visibilityState === 'hidden') {
        // Will be handled by visibility/focus listeners when returning
      }
    }, 100);
  }, [sendSignal, removeChannel, cleanupStreams]);

  const setupPeerConnection = useCallback((role: CallRole) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        sendSignal({
          kind: 'ice',
          candidate: JSON.stringify(event.candidate.toJSON()),
          callId: callIdRef.current,
          from: user!.id,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        setActiveCall((c) => (c ? { ...c, state: 'active', startedAt: c.startedAt ?? Date.now() } : c));
      } else if (s === 'failed') {
        endCall();
      }
    };

    return pc;
  }, [user, sendSignal, endCall]);

  const startCall: CallCtx['startCall'] = useCallback(async (params) => {
    if (!user) return;
    if (activeCallRef.current) return;

    // For video calls, use the embedded ZXYsupernova link — no WebRTC needed
    if (params.type === 'video') {
      const callId = generateVideoCallId();
      const videoUrl = buildVideoUrl(callId);
      callIdRef.current = callId;

      setActiveCall({
        callId,
        conversationId: params.conversationId,
        conversationName: params.conversationName,
        callerName: profile?.display_name ?? 'Someone',
        conversationAvatarUrl: params.conversationAvatarUrl,
        isGroup: params.isGroup,
        type: 'video',
        role: 'caller',
        peer: params.peer,
        peerIds: params.peerIds,
        state: 'active',
        startedAt: Date.now(),
        micOn: true,
        camOn: true,
        videoUrl,
      });

      // Send the video call link to all peers
      const channel = supabase.channel(convChannelName(params.conversationId), {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, ({ payload }: { payload: SignalingPayload }) => {
        if (!payload || payload.callId !== callIdRef.current) return;
        if (payload.kind === 'reject' || payload.kind === 'end' || payload.kind === 'cancel') {
          endCall();
        }
      });

      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        for (const targetId of params.peerIds) {
          const targetChannel = supabase.channel(`call_incoming_${targetId}`, {
            config: { broadcast: { self: false } },
          });
          targetChannel.subscribe((st) => {
            if (st === 'SUBSCRIBED') {
              targetChannel.send({
                type: 'broadcast',
                event: 'signal',
                payload: {
                  kind: 'offer',
                  callId,
                  type: 'video' as CallType,
                  callerId: user.id,
                  callerName: profile?.display_name ?? 'Someone',
                  conversationId: params.conversationId,
                  conversationName: params.conversationName,
                  conversationAvatarUrl: params.conversationAvatarUrl,
                  isGroup: params.isGroup,
                  targetId,
                  videoUrl,
                },
              });
              setTimeout(() => { try { supabase.removeChannel(targetChannel); } catch {} }, 5000);
            }
          });
        }
      });

      return;
    }

    // Audio calls use WebRTC
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      console.error('Failed to get media:', err);
      alert('Could not access microphone. Please check your browser permissions.');
      return;
    }

    cleanupStreams();
    removeChannel();

    const callId = `${user.id}-${Date.now()}`;
    callIdRef.current = callId;
    localStreamRef.current = stream;
    setLocalStream(stream);

    setActiveCall({
      callId,
      conversationId: params.conversationId,
      conversationName: params.conversationName,
      callerName: profile?.display_name ?? 'Someone',
      conversationAvatarUrl: params.conversationAvatarUrl,
      isGroup: params.isGroup,
      type: 'audio',
      role: 'caller',
      peer: params.peer,
      peerIds: params.peerIds,
      state: 'outgoing',
      startedAt: null,
      micOn: true,
      camOn: false,
      videoUrl: null,
    });

    const channel = supabase.channel(convChannelName(params.conversationId), {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    let pc: RTCPeerConnection | null = null;

    channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalingPayload }) => {
      if (!payload || payload.callId !== callIdRef.current) return;
      if (!pc) return;

      if (payload.kind === 'answer') {
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(c); } catch {} }
          pendingIceRef.current = [];
          setActiveCall((c) => (c ? { ...c, state: 'connecting' } : c));
        } catch {}
      } else if (payload.kind === 'ice' && payload.from !== user.id) {
        const cand = JSON.parse(payload.candidate) as RTCIceCandidateInit;
        if (pc.remoteDescription) { try { await pc.addIceCandidate(cand); } catch {} }
        else pendingIceRef.current.push(cand);
      } else if (payload.kind === 'reject' || payload.kind === 'end' || payload.kind === 'cancel') {
        endCall();
      }
    });

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;

      pc = setupPeerConnection('caller');
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        for (const targetId of params.peerIds) {
          const targetChannel = supabase.channel(`call_incoming_${targetId}`, {
            config: { broadcast: { self: false } },
          });
          targetChannel.subscribe((st) => {
            if (st === 'SUBSCRIBED') {
              targetChannel.send({
                type: 'broadcast',
                event: 'signal',
                payload: {
                  kind: 'offer',
                  sdp: offer.sdp ?? '',
                  callId,
                  type: 'audio' as CallType,
                  callerId: user.id,
                  callerName: profile?.display_name ?? 'Someone',
                  conversationId: params.conversationId,
                  conversationName: params.conversationName,
                  conversationAvatarUrl: params.conversationAvatarUrl,
                  isGroup: params.isGroup,
                  targetId,
                  videoUrl: null,
                },
              });
              setTimeout(() => { try { supabase.removeChannel(targetChannel); } catch {} }, 5000);
            }
          });
        }
      } catch (err) {
        console.error('Failed to create offer:', err);
        endCall();
      }
    });

    ringTimerRef.current = setTimeout(() => {
      sendSignal({ kind: 'cancel', callId });
      endCall();
    }, 30000);
  }, [user, profile, cleanupStreams, removeChannel, setupPeerConnection, sendSignal, endCall]);

  // Incoming call listener (personal channel)
  useEffect(() => {
    if (!user) return;
    const personalChannel = supabase.channel(`call_incoming_${user.id}`, {
      config: { broadcast: { self: false } },
    });

    personalChannel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalingPayload }) => {
      if (!payload || payload.kind !== 'offer') return;
      if (activeCallRef.current) {
        const ch = supabase.channel(convChannelName(payload.conversationId), {
          config: { broadcast: { self: false } },
        });
        ch.subscribe((st) => {
          if (st === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event: 'signal', payload: { kind: 'reject', callId: payload.callId } });
            setTimeout(() => { try { supabase.removeChannel(ch); } catch {} }, 2000);
          }
        });
        return;
      }
      callIdRef.current = payload.callId;

      // Video call incoming — show the embedded link
      if (payload.type === 'video' && payload.videoUrl) {
        setActiveCall({
          callId: payload.callId,
          conversationId: payload.conversationId,
          conversationName: payload.conversationName,
          callerName: payload.callerName ?? null,
          conversationAvatarUrl: payload.conversationAvatarUrl,
          isGroup: payload.isGroup,
          type: 'video',
          role: 'callee',
          peer: null,
          peerIds: [payload.callerId],
          state: 'incoming',
          startedAt: null,
          micOn: true,
          camOn: true,
          videoUrl: payload.videoUrl,
        });

        ringTimerRef.current = setTimeout(() => {
          if (activeCallRef.current?.state === 'incoming') {
            endCall();
          }
        }, 45000);

        const convChannel = supabase.channel(convChannelName(payload.conversationId), {
          config: { broadcast: { self: false } },
        });
        channelRef.current = convChannel;

        convChannel.on('broadcast', { event: 'signal' }, ({ payload: p }: { payload: SignalingPayload }) => {
          if (!p || p.callId !== callIdRef.current) return;
          if (p.kind === 'cancel' || p.kind === 'end') {
            endCall();
          }
        });

        convChannel.subscribe();
        return;
      }

      // Audio call incoming — WebRTC
      pendingOfferRef.current = (payload as any).sdp ?? null;

      setActiveCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        conversationName: payload.conversationName,
        callerName: payload.callerName ?? null,
        conversationAvatarUrl: payload.conversationAvatarUrl,
        isGroup: payload.isGroup,
        type: 'audio',
        role: 'callee',
        peer: null,
        peerIds: [payload.callerId],
        state: 'incoming',
        startedAt: null,
        micOn: true,
        camOn: false,
        videoUrl: null,
      });

      ringTimerRef.current = setTimeout(() => {
        if (activeCallRef.current?.state === 'incoming') {
          sendSignal({ kind: 'reject', callId: payload.callId });
          endCall();
        }
      }, 30000);

      const convChannel = supabase.channel(convChannelName(payload.conversationId), {
        config: { broadcast: { self: false } },
      });
      channelRef.current = convChannel;

      convChannel.on('broadcast', { event: 'signal' }, async ({ payload: p }: { payload: SignalingPayload }) => {
        if (!p || p.callId !== callIdRef.current) return;
        const pc = pcRef.current;
        if (p.kind === 'ice' && p.from !== user.id) {
          const cand = JSON.parse(p.candidate) as RTCIceCandidateInit;
          if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(cand); } catch {} }
          else pendingIceRef.current.push(cand);
        } else if (p.kind === 'cancel' || p.kind === 'end') {
          endCall();
        }
      });

      convChannel.subscribe();
    });

    personalChannel.subscribe();
    return () => { try { supabase.removeChannel(personalChannel); } catch {} };
  }, [user, endCall, sendSignal]);

  const acceptCall: CallCtx['acceptCall'] = useCallback(async () => {
    if (!user || !activeCallRef.current) return;
    const call = activeCallRef.current;

    // Video call — just join the embedded URL
    if (call.type === 'video' && call.videoUrl) {
      setActiveCall((c) => (c ? { ...c, state: 'active', startedAt: Date.now() } : c));
      return;
    }

    // Audio call — WebRTC
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      console.error('Failed to get media:', err);
      sendSignal({ kind: 'reject', callId: call.callId });
      endCall();
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      const pc = setupPeerConnection('callee');
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offerSdp = pendingOfferRef.current;
      if (!offerSdp) { endCall(); return; }
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      for (const c of pendingIceRef.current) { try { await pc.addIceCandidate(c); } catch {} }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ kind: 'answer', sdp: answer.sdp ?? '', callId: call.callId });
      setActiveCall((c) => (c ? { ...c, state: 'connecting' } : c));
    } catch (err) {
      console.error('Failed to accept call:', err);
      sendSignal({ kind: 'reject', callId: call.callId });
      endCall();
    }
  }, [user, setupPeerConnection, sendSignal, endCall]);

  const rejectCall = useCallback(() => {
    const call = activeCallRef.current;
    if (call) {
      if (!channelRef.current) {
        const ch = supabase.channel(convChannelName(call.conversationId), {
          config: { broadcast: { self: false } },
        });
        ch.subscribe((st) => {
          if (st === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event: 'signal', payload: { kind: 'reject', callId: call.callId } });
            setTimeout(() => { try { supabase.removeChannel(ch); } catch {} }, 2000);
          }
        });
      } else {
        sendSignal({ kind: 'reject', callId: call.callId });
      }
    }
    endCall();
  }, [sendSignal, endCall]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setActiveCall((c) => (c ? { ...c, micOn: track.enabled } : c));
    }
  }, []);

  const toggleCam = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setActiveCall((c) => (c ? { ...c, camOn: track.enabled } : c));
    }
  }, []);

  useEffect(() => {
    return () => {
      removeChannel();
      pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop(); } catch {} });
      try { pcRef.current?.close(); } catch {}
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [removeChannel]);

  return (
    <CallContext.Provider value={{ activeCall, localStream, remoteStream, startCall, acceptCall, rejectCall, endCall, toggleMic, toggleCam }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}

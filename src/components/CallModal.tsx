import { useEffect, useRef, useState } from 'react';
import { useCall } from '../lib/calls';
import { showPushNotification } from '../lib/push';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff, Users, Minimize2, Maximize2, ArrowLeft, X } from 'lucide-react';

export default function CallModal() {
  const { activeCall, localStream, remoteStream, acceptCall, rejectCall, endCall, toggleMic, toggleCam } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => { setMinimized(false); }, [activeCall?.state]);

  useEffect(() => {
    if (activeCall?.state !== 'incoming') {
      if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;
      return;
    }

    showPushNotification(
      `Incoming ${activeCall.type === 'video' ? 'video' : 'voice'} call`,
      activeCall.conversationName,
      'incoming-call'
    );

    if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400]);

    function playRingPulse() {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        osc.onended = () => { try { ctx.close(); } catch {} };
      } catch {}
    }

    playRingPulse();
    ringRef.current = setInterval(playRingPulse, 1800);

    return () => {
      if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
      try { audioCtxRef.current?.close(); } catch {}
      if ('vibrate' in navigator) navigator.vibrate(0);
    };
  }, [activeCall?.state, activeCall?.type, activeCall?.conversationName]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (activeCall?.state !== 'active') { setElapsed(0); return; }
    const start = activeCall.startedAt ?? Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeCall?.state, activeCall?.startedAt]);

  if (!activeCall) return null;

  const isVideo = activeCall.type === 'video';
  const isVideoCall = isVideo && activeCall.videoUrl;

  function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function statusText() {
    if (activeCall!.state === 'outgoing') return 'Calling…';
    if (activeCall!.state === 'connecting') return 'Connecting…';
    if (activeCall!.state === 'active') return formatDuration(elapsed);
    return '';
  }

  // Video call with embedded iframe — active state
  if (isVideoCall && activeCall.state === 'active') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-black">
        {/* The embedded video call page */}
        <iframe
          src={activeCall.videoUrl!}
          className="flex-1 w-full border-0"
          allow="camera; microphone; display-capture; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          title="Video Call"
        />

        {/* Top bar overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white text-sm font-medium">
              Video Call · {activeCall.conversationName}
            </span>
            <span className="text-white/70 text-sm font-mono ml-1">{formatDuration(elapsed)}</span>
          </div>
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setMinimized(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all"
              title="Back to chats"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Chats</span>
            </button>
            <button
              onClick={endCall}
              className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-semibold transition-all shadow-lg shadow-red-500/30"
            >
              <PhoneOff size={15} />
              End Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Incoming call — always full screen
  if (activeCall.state === 'incoming') {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-gradient-to-b from-slate-900 via-slate-950 to-black p-8"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}>
        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Incoming {isVideo ? 'Video Call' : 'Call'}
            </p>
            <p className="text-white text-3xl font-bold">{activeCall.role === 'callee' && activeCall.callerName ? activeCall.callerName : activeCall.conversationName}</p>
            <p className="text-slate-400 text-sm mt-1">Bubble · {isVideo ? 'Video' : 'Audio'}</p>
          </div>
          <div className="w-36 h-36 rounded-full overflow-hidden ring-4 ring-white/10 shadow-2xl">
            {activeCall.conversationAvatarUrl ? (
              <img src={activeCall.conversationAvatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                <Users size={52} className="text-white" />
              </div>
            )}
          </div>
          {isVideo && (
            <p className="text-slate-500 text-xs text-center max-w-[280px]">
              Accepting will open a video call page where you can turn on your camera and mic.
            </p>
          )}
        </div>
        <div className="flex items-center gap-20 pb-8"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <button onClick={rejectCall} className="flex flex-col items-center gap-2 group">
            <span className="w-[72px] h-[72px] rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all group-active:scale-95">
              <PhoneOff size={28} className="text-white" />
            </span>
            <span className="text-slate-300 text-xs font-medium">Decline</span>
          </button>
          <button onClick={acceptCall} className="flex flex-col items-center gap-2 group">
            <span className="w-[72px] h-[72px] rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all group-active:scale-95 animate-pulse">
              {isVideo ? <Video size={28} className="text-white" /> : <Phone size={28} className="text-white" />}
            </span>
            <span className="text-slate-300 text-xs font-medium">Accept</span>
          </button>
        </div>
      </div>
    );
  }

  // Minimized — mini floating window
  if (minimized) {
    return (
      <>
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <div className="fixed bottom-20 right-3 z-[90] w-44 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-slate-900">
          <div className="relative h-28 bg-black">
            {isVideoCall ? (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sky-900 to-slate-900">
                <div className="flex flex-col items-center gap-1">
                  <Video size={20} className="text-sky-400" />
                  <span className="text-white text-[10px] font-medium">Video call active</span>
                </div>
              </div>
            ) : isVideo && localStream ? (
              <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${activeCall.camOn ? '' : 'opacity-0'}`} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900">
                <div className="w-12 h-12 rounded-full overflow-hidden">
                  {activeCall.conversationAvatarUrl ? (
                    <img src={activeCall.conversationAvatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                      <Users size={20} className="text-white" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="absolute top-1.5 left-1.5 bg-black/60 rounded-full px-2 py-0.5 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${activeCall.state === 'active' ? 'bg-green-400' : 'bg-amber-400'} animate-pulse`} />
              <span className="text-white text-[10px] font-medium">{statusText()}</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-2 py-2 bg-slate-900">
            <span className="text-white text-[11px] font-medium truncate max-w-[60px]">{activeCall.conversationName}</span>
            <div className="flex items-center gap-1">
              {!isVideoCall && (
                <button onClick={toggleMic} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all">
                  {activeCall.micOn ? <Mic size={13} /> : <MicOff size={13} />}
                </button>
              )}
              <button onClick={() => setMinimized(false)} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all" title="Expand">
                <Maximize2 size={13} />
              </button>
              <button onClick={endCall} className="w-7 h-7 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-400 text-white transition-all">
                <PhoneOff size={13} />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Full audio call screen — outgoing / connecting / active
  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div
        className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
        style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}
      >
        {/* Avatar background */}
        <div className="flex-1 relative overflow-hidden">
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-900 to-black">
            <div className="w-36 h-36 rounded-full overflow-hidden ring-4 ring-white/10 shadow-2xl">
              {activeCall.conversationAvatarUrl ? (
                <img src={activeCall.conversationAvatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                  <Users size={52} className="text-white" />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-white text-2xl font-bold">{activeCall.conversationName}</p>
              <p className="text-slate-400 text-sm mt-1">{statusText()}</p>
            </div>
          </div>

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${activeCall.state === 'active' ? 'bg-green-400' : 'bg-amber-400'} animate-pulse`} />
              <span className="text-white text-sm font-medium">
                Voice Call · {activeCall.conversationName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {activeCall.state === 'active' && (
                <span className="text-white/80 text-sm font-mono">{formatDuration(elapsed)}</span>
              )}
              <button
                onClick={() => setMinimized(true)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all"
                title="Back to chats"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">Chats</span>
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div
          className="flex-shrink-0 p-6 flex items-center justify-center gap-4 bg-black/80 backdrop-blur-md"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <ControlBtn active={activeCall.micOn} onClick={toggleMic} onIcon={<Mic size={22} />} offIcon={<MicOff size={22} />} label="Mic" />
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-all active:scale-95"
          >
            <PhoneOff size={26} className="text-white" />
          </button>
        </div>
      </div>
    </>
  );
}

function ControlBtn({
  active, onClick, onIcon, offIcon, label,
}: {
  active: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string;
}) {
  const isOff = !active;
  return (
    <button
      onClick={onClick}
      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${
        isOff ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
      title={isOff ? `Turn on ${label}` : `Turn off ${label}`}
    >
      {isOff ? offIcon : onIcon}
    </button>
  );
}

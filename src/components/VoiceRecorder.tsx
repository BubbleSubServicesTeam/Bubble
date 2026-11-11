import { useRef, useState, useEffect } from 'react';
import { Mic, X, Send } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  onSend: (blob: Blob, durationSeconds: number) => void;
  onCancel: () => void;
};

export default function VoiceRecorder({ onSend, onCancel }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    startRecording();
    return () => cleanup();
  }, []);

  async function startRecording() {
    setState('idle');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = candidates.find(t =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
      );
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const type = mr.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('preview');
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      setState('recording');
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setError('Microphone access denied. Allow microphone access in your browser settings and try again.');
      } else if (err?.name === 'NotFoundError') {
        setError('No microphone found on this device.');
      } else {
        setError(err?.message || 'Could not start recording. Please try again.');
      }
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
  }

  function handleSend() {
    if (!blobRef.current) return;
    onSend(blobRef.current, duration);
  }

  function handleCancel() {
    cleanup();
    onCancel();
  }

  function formatDuration(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl">
        <p className="text-red-400 text-[13px] flex-1">{error}</p>
        <button onClick={handleCancel} className="text-slate-400 hover:text-white transition-colors"><X size={15} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
      {state === 'recording' && (
        <>
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-red-400 font-mono text-[14px] font-medium flex-1">{formatDuration(duration)}</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-0.5 bg-red-400 rounded-full animate-pulse"
                style={{ height: `${8 + Math.abs(Math.sin((Date.now() / 200) + i)) * 12}px`, animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
          <button onClick={stopRecording} className="ml-2 px-4 py-1.5 bg-red-500 hover:bg-red-400 text-white text-[12px] font-semibold rounded-xl transition-all flex-shrink-0">
            Stop
          </button>
          <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors flex-shrink-0">
            <X size={15} />
          </button>
        </>
      )}

      {state === 'preview' && audioUrl && (
        <>
          <audio src={audioUrl} controls className="flex-1 h-9 min-w-0" style={{ height: 36 }} />
          <span className="text-slate-500 text-[12px] flex-shrink-0">{formatDuration(duration)}</span>
          <button
            onClick={handleSend}
            className="w-9 h-9 rounded-full bg-sky-500 hover:bg-sky-400 flex items-center justify-center text-white transition-all shadow-lg shadow-sky-500/20 flex-shrink-0"
          >
            <Send size={15} />
          </button>
          <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors flex-shrink-0">
            <X size={15} />
          </button>
        </>
      )}

      {state === 'idle' && (
        <div className="flex items-center gap-2">
          <BubbleLoader size={24} />
          <span className="text-slate-500 dark:text-slate-400 text-[13px]">Starting...</span>
        </div>
      )}
    </div>
  );
}

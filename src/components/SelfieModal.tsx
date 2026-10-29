import { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';

type Props = {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
};

export default function SelfieModal({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState('');

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facing]);

  async function startCamera() {
    stopCamera();
    setReady(false);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch {
      setError('Camera access denied or unavailable.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCaptured(dataUrl);
  }

  function retake() {
    setCaptured(null);
  }

  function confirm() {
    if (!captured) return;
    stopCamera();
    onCapture(captured);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-black rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl relative animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <X size={18} />
        </button>

        <div className="relative aspect-[3/4] bg-slate-900">
          {error ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <p className="text-slate-400 text-sm">{error}</p>
            </div>
          ) : captured ? (
            <img src={captured} alt="Captured" className="w-full h-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="p-4 flex items-center justify-between bg-black">
          <button
            onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}
            disabled={!!captured}
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 transition-all"
          >
            <RefreshCw size={18} />
          </button>

          {!captured ? (
            <button
              onClick={capture}
              disabled={!ready}
              className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
            >
              <Camera size={22} className="text-slate-900" />
            </button>
          ) : (
            <button
              onClick={confirm}
              className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-sky-500/40"
            >
              ✓
            </button>
          )}

          <button
            onClick={retake}
            disabled={!captured}
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 transition-all text-[13px] font-medium"
          >
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}

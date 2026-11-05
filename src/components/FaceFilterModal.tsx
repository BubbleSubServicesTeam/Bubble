import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Send, Download, Trash2, Sparkles } from 'lucide-react';

type FilterDef = {
  id: string;
  name: string;
  emoji: string;
  draw: (ctx: CanvasRenderingContext2D, landmarks: number[][], w: number, h: number) => void;
};

type SavedFace = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

const SAVED_KEY = 'bubble-face-filters-saved';

const FILTERS: FilterDef[] = [
  {
    id: 'none',
    name: 'None',
    emoji: '🚫',
    draw: () => {},
  },
  {
    id: 'unicorn',
    name: 'Unicorn',
    emoji: '🦄',
    draw: (ctx, lm, w, h) => {
      const forehead = lm[10];
      const fx = forehead[0] * w;
      const fy = forehead[1] * h;
      ctx.save();
      ctx.translate(fx, fy - h * 0.08);
      ctx.font = `${h * 0.18}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🦄', 0, 0);
      ctx.restore();
    },
  },
  {
    id: 'dog',
    name: 'Dog',
    emoji: '🐶',
    draw: (ctx, lm, w, h) => {
      const nose = lm[1];
      const leftEar = lm[234];
      const rightEar = lm[454];
      ctx.save();
      ctx.font = `${h * 0.12}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🐶', leftEar[0] * w - w * 0.06, leftEar[1] * h - h * 0.02);
      ctx.fillText('🐶', rightEar[0] * w + w * 0.06, rightEar[1] * h - h * 0.02);
      ctx.font = `${h * 0.08}px serif`;
      ctx.fillText('⚫', nose[0] * w, nose[1] * h + h * 0.02);
      ctx.restore();
    },
  },
  {
    id: 'cat',
    name: 'Cat',
    emoji: '🐱',
    draw: (ctx, lm, w, h) => {
      const leftEar = lm[234];
      const rightEar = lm[454];
      const nose = lm[1];
      ctx.save();
      ctx.font = `${h * 0.1}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🔺', leftEar[0] * w - w * 0.04, leftEar[1] * h - h * 0.06);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.fillText('🔺', -(rightEar[0] * w + w * 0.04), rightEar[1] * h - h * 0.06);
      ctx.restore();
      ctx.font = `${h * 0.06}px serif`;
      ctx.fillText('🐱', nose[0] * w, nose[1] * h + h * 0.01);
      ctx.restore();
    },
  },
  {
    id: 'bunny',
    name: 'Bunny',
    emoji: '🐰',
    draw: (ctx, lm, w, h) => {
      const leftEar = lm[234];
      const rightEar = lm[454];
      const nose = lm[1];
      ctx.save();
      ctx.font = `${h * 0.07}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🐰', leftEar[0] * w - w * 0.03, leftEar[1] * h - h * 0.1);
      ctx.fillText('🐰', rightEar[0] * w + w * 0.03, rightEar[1] * h - h * 0.1);
      ctx.font = `${h * 0.05}px serif`;
      ctx.fillText('🌸', nose[0] * w, nose[1] * h + h * 0.01);
      ctx.restore();
    },
  },
  {
    id: 'glasses',
    name: 'Glasses',
    emoji: '👓',
    draw: (ctx, lm, w, h) => {
      const leftEye = lm[33];
      const rightEye = lm[263];
      const lx = leftEye[0] * w;
      const ly = leftEye[1] * h;
      const rx = rightEye[0] * w;
      const ry = rightEye[1] * h;
      const eyeR = h * 0.05;
      ctx.save();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = h * 0.006;
      ctx.beginPath();
      ctx.arc(lx, ly, eyeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, eyeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx + eyeR, ly);
      ctx.lineTo(rx - eyeR, ry);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'crown',
    name: 'Crown',
    emoji: '👑',
    draw: (ctx, lm, w, h) => {
      const forehead = lm[10];
      ctx.save();
      ctx.translate(forehead[0] * w, forehead[1] * h - h * 0.05);
      ctx.font = `${h * 0.14}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('👑', 0, 0);
      ctx.restore();
    },
  },
  {
    id: 'flower',
    name: 'Flower',
    emoji: '🌺',
    draw: (ctx, lm, w, h) => {
      const leftTemple = lm[234];
      const rightTemple = lm[454];
      ctx.save();
      ctx.font = `${h * 0.09}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🌺', leftTemple[0] * w - w * 0.02, leftTemple[1] * h);
      ctx.fillText('🌺', rightTemple[0] * w + w * 0.02, rightTemple[1] * h);
      ctx.restore();
    },
  },
  {
    id: 'hearts',
    name: 'Hearts',
    emoji: '💕',
    draw: (ctx, lm, w, h) => {
      const leftEye = lm[33];
      const rightEye = lm[263];
      ctx.save();
      ctx.font = `${h * 0.07}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('💕', leftEye[0] * w - w * 0.05, leftEye[1] * h - h * 0.05);
      ctx.fillText('💕', rightEye[0] * w + w * 0.05, rightEye[1] * h - h * 0.05);
      ctx.restore();
    },
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    emoji: '🌈',
    draw: (ctx, lm, w, h) => {
      const forehead = lm[10];
      ctx.save();
      ctx.translate(forehead[0] * w, forehead[1] * h - h * 0.1);
      ctx.font = `${h * 0.16}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🌈', 0, 0);
      ctx.restore();
    },
  },
  {
    id: 'pig',
    name: 'Pig',
    emoji: '🐷',
    draw: (ctx, lm, w, h) => {
      const nose = lm[1];
      ctx.save();
      ctx.font = `${h * 0.08}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🐷', nose[0] * w, nose[1] * h + h * 0.01);
      ctx.restore();
    },
  },
  {
    id: 'stars',
    name: 'Stars',
    emoji: '⭐',
    draw: (ctx, lm, w, h) => {
      const leftEye = lm[33];
      const rightEye = lm[263];
      const forehead = lm[10];
      ctx.save();
      ctx.font = `${h * 0.06}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('⭐', leftEye[0] * w - w * 0.04, leftEye[1] * h - h * 0.06);
      ctx.fillText('⭐', rightEye[0] * w + w * 0.04, rightEye[1] * h - h * 0.06);
      ctx.fillText('✨', forehead[0] * w, forehead[1] * h - h * 0.04);
      ctx.restore();
    },
  },
];

type Props = {
  onSend?: (dataUrl: string) => void;
  onClose: () => void;
};

export default function FaceFilterModal({ onSend, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const lastVideoTimeRef = useRef(-1);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterDef>(FILTERS[0]);
  const [captured, setCaptured] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedFace[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persistSaved = useCallback((items: SavedFace[]) => {
    setSaved(items);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        await startCamera();
        await loadFaceLandmarker();
      } catch (err) {
        setError('Could not initialize face filters. Camera access is required.');
      }
      setLoading(false);
    }
    init();
    return () => { stopCamera(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [facing]);

  async function loadFaceLandmarker() {
    if (faceLandmarkerRef.current) return;
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    } catch {
      setError('Face tracking could not start. You can still capture photos without filters.');
    }
  }

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
        videoRef.current.onloadedmetadata = () => {
          setReady(true);
          startRenderLoop();
        };
      }
    } catch {
      setError('Camera access denied or unavailable.');
    }
  }

  function stopCamera() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function startRenderLoop() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    function render() {
      if (!video || !overlay || !ctx) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        if (faceLandmarkerRef.current && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          try {
            const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
              const landmarks = results.faceLandmarks[0];
              if (activeFilter.id !== 'none') {
                activeFilter.draw(ctx, landmarks, overlay.width, overlay.height);
              }
            }
          } catch { /* ignore detection errors */ }
        }
      }
      rafRef.current = requestAnimationFrame(render);
    }
    render();
  }

  useEffect(() => {
    if (ready) startRenderLoop();
  }, [ready, activeFilter]);

  function capture() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    if (facing === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.drawImage(overlay, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCaptured(dataUrl);
  }

  function retake() {
    setCaptured(null);
  }

  function saveCurrent() {
    if (!captured) return;
    const item: SavedFace = {
      id: `face-${Date.now()}`,
      dataUrl: captured,
      createdAt: Date.now(),
    };
    persistSaved([item, ...saved].slice(0, 30));
  }

  function deleteSaved(id: string) {
    persistSaved(saved.filter(s => s.id !== id));
  }

  async function sendCaptured(dataUrl: string) {
    if (!onSend) return;
    setSending(true);
    stopCamera();
    onSend(dataUrl);
  }

  function downloadCaptured() {
    if (!captured) return;
    const a = document.createElement('a');
    a.href = captured;
    a.download = `bubble-face-${Date.now()}.jpg`;
    a.click();
  }

  const mirror = facing === 'user';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-black rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl relative animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '100dvh' }}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-white" />
            <span className="text-white font-semibold text-[14px]">Face Filters</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Camera / Preview area */}
        <div className="relative aspect-[3/4] bg-slate-900">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Loading filters...</p>
            </div>
          ) : error && !ready ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <p className="text-slate-400 text-sm">{error}</p>
            </div>
          ) : captured ? (
            <img src={captured} alt="Captured" className="w-full h-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`}
              />
              <canvas ref={overlayRef} className={`absolute inset-0 w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`} />
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Filter selector strip */}
        {!captured && !showSaved && (
          <div className="bg-black p-2 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all ${
                    activeFilter.id === f.id
                      ? 'bg-sky-500/30 ring-2 ring-sky-500'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="text-2xl">{f.emoji}</span>
                  <span className="text-[10px] text-white font-medium">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Saved faces gallery */}
        {showSaved && (
          <div className="bg-black p-3 max-h-[40dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-[14px]">Saved Faces</span>
              <button onClick={() => setShowSaved(false)} className="text-slate-400 hover:text-white text-[13px]">Back</button>
            </div>
            {saved.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No saved faces yet. Capture one and save it!</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {saved.map(item => (
                  <div key={item.id} className="relative group rounded-xl overflow-hidden aspect-square">
                    <img src={item.dataUrl} alt="Saved face" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      {onSend && (
                        <button
                          onClick={() => sendCaptured(item.dataUrl)}
                          className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white"
                        >
                          <Send size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteSaved(item.id)}
                        className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom controls */}
        <div className="p-4 flex items-center justify-between bg-black">
          {captured ? (
            <>
              <button
                onClick={retake}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"
                title="Retake"
              >
                <RefreshCw size={18} />
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveCurrent}
                  className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"
                  title="Save"
                >
                  <Download size={18} />
                </button>
                {onSend && (
                  <button
                    onClick={() => sendCaptured(captured)}
                    disabled={sending}
                    className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-sky-500/40 disabled:opacity-50"
                    title="Send"
                  >
                    {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={22} />}
                  </button>
                )}
                {!onSend && (
                  <button
                    onClick={downloadCaptured}
                    className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-lg shadow-sky-500/40"
                    title="Download"
                  >
                    <Download size={22} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowSaved(true)}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all relative"
                title="Saved faces"
              >
                <Camera size={18} />
                {saved.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-sky-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {saved.length}
                  </span>
                )}
              </button>
            </>
          ) : showSaved ? (
            <>
              <button
                onClick={() => setShowSaved(false)}
                className="px-4 py-2.5 rounded-full bg-white/10 text-white text-[13px] font-medium hover:bg-white/20 transition-all"
              >
                Back to Camera
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"
              >
                <RefreshCw size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"
              >
                <RefreshCw size={18} />
              </button>
              <button
                onClick={capture}
                disabled={!ready}
                className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
              >
                <Camera size={22} className="text-slate-900" />
              </button>
              <button
                onClick={() => setShowSaved(true)}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all relative"
                title="Saved faces"
              >
                <Camera size={18} />
                {saved.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-sky-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {saved.length}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Send, Download, Trash2, ScanFace } from 'lucide-react';

const MEDIAPIPE_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

type FilterDef = {
  id: string;
  name: string;
  emoji: string;
  creator?: string;
  description?: string;
  draw: (ctx: CanvasRenderingContext2D, landmarks: number[][], w: number, h: number) => void;
};

type SavedFace = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

const SAVED_KEY = 'bubble-face-filters-saved';

function drawFunnyFace(ctx: CanvasRenderingContext2D, lm: number[][], w: number, h: number) {
  const leftEye = lm[33];
  const rightEye = lm[263];
  const nose = lm[1];
  const mouthLeft = lm[61];
  const mouthRight = lm[291];
  const eyeRadius = Math.max(h * 0.055, Math.abs(rightEye[0] - leftEye[0]) * w * 0.18);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = h * 0.012;
  for (const eye of [leftEye, rightEye]) {
    const x = eye[0] * w;
    const y = eye[1] * h;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, eyeRadius * 1.35, eyeRadius * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(x, y, eyeRadius * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - eyeRadius * 0.18, y - eyeRadius * 0.2, eyeRadius * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f2a07b';
  ctx.beginPath();
  ctx.ellipse(nose[0] * w, nose[1] * h + eyeRadius * 0.45, eyeRadius * 0.72, eyeRadius * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7e3f38';
  ctx.beginPath();
  ctx.ellipse((mouthLeft[0] + mouthRight[0]) * w / 2, (mouthLeft[1] + mouthRight[1]) * h / 2 + eyeRadius * 0.4, eyeRadius * 1.45, eyeRadius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const FILTERS: FilterDef[] = [
  {
    id: 'none', name: 'Clean camera', emoji: '—', creator: 'Bubble Studio', description: 'No lens', draw: () => {},
  },
  {
    id: 'funny-face', name: 'Funny Face', emoji: 'POP', creator: 'Milo & Co.', description: 'Big eyes, bigger energy', draw: drawFunnyFace,
  },
  {
    id: 'comic', name: 'Comic Pop', emoji: 'INK', creator: 'Kite Studio', description: 'Graphic shadows and sparkle', draw: (ctx, lm, w, h) => {
      const leftEye = lm[33];
      const rightEye = lm[263];
      const forehead = lm[10];
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = h * 0.012;
      for (const eye of [leftEye, rightEye]) {
        const x = eye[0] * w; const y = eye[1] * h;
        ctx.beginPath();
        ctx.arc(x, y, h * 0.07, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#111827';
      ctx.font = `900 ${h * 0.045}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('WOW', forehead[0] * w, forehead[1] * h - h * 0.08);
      ctx.restore();
    },
  },
  {
    id: 'unicorn',
    name: 'Dream Horn',
    emoji: 'UNICORN',
    creator: 'Moonroom',
    description: 'Soft fantasy glow',
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
    name: 'Pup Mode',
    emoji: 'PUP',
    creator: 'Good Dog Club',
    description: 'Playful ears and nose',
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
    name: 'Catwalk',
    emoji: 'CAT',
    creator: 'Studio Whisker',
    description: 'Sharp, glossy and cute',
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
      const vision = await import(/* @vite-ignore */ MEDIAPIPE_BUNDLE_URL);
      const { FaceLandmarker, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
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
            <ScanFace size={16} className="text-white" />
            <div>
              <span className="text-white font-semibold text-[14px] block">Creator lenses</span>
              <span className="text-white/50 text-[10px]">Made for Bubble by independent creators</span>
            </div>
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
          <div className="bg-[#08090c] px-3 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-white text-[12px] font-semibold">Choose a lens</p>
                <p className="text-white/40 text-[10px]">{activeFilter.description ?? 'Live face effects'}</p>
              </div>
              <span className="text-[10px] text-white/40">{activeFilter.creator}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f)}
                  className={`flex-shrink-0 w-[76px] rounded-2xl p-1.5 text-left transition-all ${
                    activeFilter.id === f.id
                      ? 'bg-white text-slate-950 ring-2 ring-sky-400 scale-[1.03]'
                      : 'bg-white/[0.07] text-white hover:bg-white/[0.14]'
                  }`}
                >
                  <div className={`h-12 rounded-xl flex items-center justify-center text-[9px] font-black tracking-wide ${activeFilter.id === f.id ? 'bg-sky-100 text-sky-700' : 'bg-white/[0.08] text-white/70'}`}>
                    {f.emoji}
                  </div>
                  <span className="block text-[10px] font-semibold truncate mt-1.5">{f.name}</span>
                  <span className={`block text-[9px] truncate ${activeFilter.id === f.id ? 'text-slate-500' : 'text-white/40'}`}>{f.creator}</span>
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

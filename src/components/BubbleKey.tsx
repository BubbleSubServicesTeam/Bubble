import { useEffect, useRef, useState } from 'react';

type BubbleKeyProps = {
  value: string;
  onPress: () => void;
  delay?: number;
  size?: number;
};

type Pop = { id: number };

let popId = 0;

const KEY_COLORS: Record<string, { glow: string; ripple: string; text: string; pressedText: string }> = {
  '1': { glow: 'rgba(56,189,248,0.3)', ripple: 'rgba(56,189,248,0.7)', text: '#0f172a', pressedText: '#0284c7' },
  '2': { glow: 'rgba(168,85,247,0.3)', ripple: 'rgba(168,85,247,0.7)', text: '#0f172a', pressedText: '#7c3aed' },
  '3': { glow: 'rgba(236,72,153,0.3)', ripple: 'rgba(236,72,153,0.7)', text: '#0f172a', pressedText: '#db2777' },
  '4': { glow: 'rgba(34,197,94,0.3)', ripple: 'rgba(34,197,94,0.7)', text: '#0f172a', pressedText: '#16a34a' },
  '5': { glow: 'rgba(249,115,22,0.3)', ripple: 'rgba(249,115,22,0.7)', text: '#0f172a', pressedText: '#ea580c' },
  '6': { glow: 'rgba(14,165,233,0.3)', ripple: 'rgba(14,165,233,0.7)', text: '#0f172a', pressedText: '#0284c7' },
  '7': { glow: 'rgba(234,179,8,0.3)', ripple: 'rgba(234,179,8,0.7)', text: '#0f172a', pressedText: '#ca8a04' },
  '8': { glow: 'rgba(239,68,68,0.3)', ripple: 'rgba(239,68,68,0.7)', text: '#0f172a', pressedText: '#dc2626' },
  '9': { glow: 'rgba(20,184,166,0.3)', ripple: 'rgba(20,184,166,0.7)', text: '#0f172a', pressedText: '#0d9488' },
  '0': { glow: 'rgba(99,102,241,0.3)', ripple: 'rgba(99,102,241,0.7)', text: '#0f172a', pressedText: '#4f46e5' },
};

export function BubbleKey({ value, onPress, delay = 0, size = 68 }: BubbleKeyProps) {
  const [pressed, setPressed] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const [hovered, setHovered] = useState(false);
  const heldRef = useRef<number | null>(null);

  const colors = KEY_COLORS[value] ?? KEY_COLORS['0'];

  useEffect(() => {
    return () => { if (heldRef.current) window.clearTimeout(heldRef.current); };
  }, []);

  function handlePress() {
    setPressed(true);
    const id = ++popId;
    setPops(p => [...p, { id }]);
    window.setTimeout(() => setPops(p => p.filter(x => x.id !== id)), 700);
    onPress();
    heldRef.current = window.setTimeout(() => setPressed(false), 250);
  }

  return (
    <button
      onClick={handlePress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative select-none"
      style={{
        width: size,
        height: size,
      }}
    >
      <style>{`
        @keyframes keyFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes keyRipple {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes keyShimmer {
          0% { transform: translateX(-120%) rotate(25deg); }
          100% { transform: translateX(220%) rotate(25deg); }
        }
        @keyframes keyGlowPulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.08); }
        }
      `}</style>

      {/* Colored ambient glow behind key */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: '-8px',
          background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`,
          opacity: pressed ? 1 : 0.3,
        }}
      />

      {/* Ripple on press */}
      {pops.map(p => (
        <span
          key={p.id}
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            animation: 'keyRipple 0.7s ease-out forwards',
            border: `2px solid ${colors.ripple}`,
          }}
        />
      ))}

      {/* The key itself — white glass with colored accents */}
      <span
        className="absolute inset-0 rounded-full transition-all duration-150"
        style={{
          transform: pressed ? 'scale(0.9)' : 'scale(1)',
          background: pressed
            ? `linear-gradient(145deg, rgba(255,255,255,0.95), rgba(241,245,249,0.85))`
            : 'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(248,250,252,0.7))',
          boxShadow: pressed
            ? `inset 0 3px 8px rgba(0,0,0,0.08), inset 0 -2px 6px rgba(0,0,0,0.04), 0 0 24px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.1)`
            : 'inset 0 1px 2px rgba(255,255,255,0.7), inset 0 -1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)',
          border: pressed
            ? `2px solid ${colors.ripple}`
            : '2px solid rgba(255,255,255,0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Number */}
        <span
          className="absolute inset-0 flex items-center justify-center font-bold transition-all duration-200"
          style={{
            fontSize: size * 0.36,
            color: pressed ? colors.pressedText : colors.text,
            textShadow: pressed
              ? `0 0 12px ${colors.glow}`
              : '0 1px 2px rgba(0,0,0,0.08)',
            transform: pressed ? 'scale(0.85)' : 'scale(1)',
          }}
        >
          {value}
        </span>
      </span>
    </button>
  );
}

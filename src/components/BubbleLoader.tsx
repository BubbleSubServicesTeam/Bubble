type Props = {
  size?: number;
  className?: string;
};

export default function BubbleLoader({ size = 40, className = '' }: Props) {
  const dotSize = size * 0.26;
  const maxLift = size * 0.55;

  return (
    <div
      className={`bubble-loader-bounce ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      {[0, 1, 2, 3, 4].map(i => {
        const offset = (i - 2) * (dotSize * 1.5);
        return (
          <span
            key={i}
            className="bubble-loader-bounce-dot"
            style={{
              width: dotSize,
              height: dotSize,
              left: `calc(50% + ${offset}px)`,
              marginLeft: -dotSize / 2,
              background:
                'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.5) 22%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.03) 100%)',
              border: '1px solid rgba(255,255,255,0.55)',
              boxShadow:
                'inset 0 1px 3px rgba(255,255,255,0.7), inset 0 -1px 3px rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06), 0 0 8px rgba(186,230,253,0.18)',
              ['--lift' as any]: `${maxLift}px`,
              animationDelay: `${i * 0.13}s`,
            } as React.CSSProperties}
          />
        );
      })}
      <style>{`
        .bubble-loader-bounce-dot::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: conic-gradient(from 190deg,
            rgba(255,255,255,0) 0%,
            rgba(186,230,253,0.18) 22%,
            rgba(167,243,208,0.12) 32%,
            rgba(255,255,255,0) 44%,
            rgba(255,255,255,0) 56%,
            rgba(253,224,71,0.1) 68%,
            rgba(244,114,182,0.12) 80%,
            rgba(186,230,253,0.16) 92%,
            rgba(255,255,255,0) 100%);
          mix-blend-mode: screen;
          filter: blur(1.5px);
          opacity: 0.6;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

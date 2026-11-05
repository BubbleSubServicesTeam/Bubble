import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTextRuns, type TextEffect, type TextEffectSpan } from '../lib/textEffects';

type Props = {
  text: string;
  effect: TextEffect | null;
  spans?: TextEffectSpan[] | null;
  autoplay?: boolean;
  className?: string;
};

const PER_CHARACTER_EFFECTS: TextEffect[] = ['bump', 'wave'];
const CHARACTER_STEP_MS: Partial<Record<TextEffect, number>> = { bump: 70, wave: 90 };

export default function TextEffectText({ text, effect, spans, autoplay = false, className = '' }: Props) {
  const runs = useMemo(() => buildTextRuns(text, spans ?? [], effect), [text, spans, effect]);
  if (runs.length <= 1) {
    return <EffectRun text={text} effect={runs[0]?.effect ?? null} autoplay={autoplay} className={className} />;
  }
  return (
    <span className={className}>
      {runs.map((run, i) => (
        <EffectRun key={i} text={run.text} effect={run.effect} autoplay={autoplay} />
      ))}
    </span>
  );
}

function EffectRun({ text, effect, autoplay, className = '' }: { text: string; effect: TextEffect | null; autoplay: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(autoplay);

  useEffect(() => {
    if (inView || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.6 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView]);

  if (!effect) {
    return <span className={className}>{text}</span>;
  }

  const playing = inView ? 'fx-play' : '';

  if (PER_CHARACTER_EFFECTS.includes(effect)) {
    const step = CHARACTER_STEP_MS[effect] ?? 80;
    return (
      <span ref={ref} className={`fx-${effect} ${playing} inline-block whitespace-pre-wrap ${className}`}>
        {Array.from(text).map((char, i) => (
          <span
            key={i}
            className="fx-char inline-block"
            style={{ animationDelay: `${i * step}ms` }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span ref={ref} className={`fx-${effect} ${playing} inline-block whitespace-pre-wrap ${className}`}>
      {text}
    </span>
  );
}

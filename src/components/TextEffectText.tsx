import { useEffect, useRef, useState } from 'react';
import type { TextEffect } from '../lib/textEffects';

type Props = {
  text: string;
  effect: TextEffect | null;
  autoplay?: boolean;
  className?: string;
};

const PER_CHARACTER_EFFECTS: TextEffect[] = ['bump', 'wave'];

export default function TextEffectText({ text, effect, autoplay = false, className = '' }: Props) {
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
    const step = effect === 'bump' ? 70 : 90;
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

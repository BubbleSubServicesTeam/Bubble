export const TEXT_EFFECTS = [
  { id: 'big', label: 'Big' },
  { id: 'small', label: 'Small' },
  { id: 'bump', label: 'Bump' },
  { id: 'shake', label: 'Shake' },
  { id: 'wave', label: 'Wave' },
  { id: 'glow', label: 'Glow' },
] as const;

export type TextEffect = (typeof TEXT_EFFECTS)[number]['id'];

export type TextEffectSpan = { start: number; end: number; effect: TextEffect };

export type TextRange = { start: number; end: number };

export function isTextEffect(value: unknown): value is TextEffect {
  return TEXT_EFFECTS.some(e => e.id === value);
}

export function applyTextEffectSpan(spans: TextEffectSpan[], start: number, end: number, effect: TextEffect | null): TextEffectSpan[] {
  const kept: TextEffectSpan[] = [];
  for (const span of spans) {
    if (span.end <= start || span.start >= end) {
      kept.push(span);
      continue;
    }
    if (span.start < start) kept.push({ ...span, end: start });
    if (span.end > end) kept.push({ ...span, start: end });
  }
  if (effect) kept.push({ start, end, effect });
  return kept.sort((a, b) => a.start - b.start);
}

export function remapTextEffectSpans(spans: TextEffectSpan[], oldText: string, newText: string): TextEffectSpan[] {
  if (spans.length === 0 || oldText === newText) return spans;
  const minLen = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < minLen && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < minLen - prefix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++;
  const editEnd = oldText.length - suffix;
  const delta = newText.length - oldText.length;
  return spans.flatMap((span): TextEffectSpan[] => {
    if (span.end <= prefix) return [span];
    if (span.start >= editEnd) return [{ ...span, start: span.start + delta, end: span.end + delta }];
    const pieces: TextEffectSpan[] = [];
    if (span.start < prefix) pieces.push({ ...span, end: prefix });
    if (span.end > editEnd) pieces.push({ ...span, start: editEnd + delta, end: span.end + delta });
    return pieces.filter(p => p.end > p.start);
  });
}

export type TextRun = { text: string; effect: TextEffect | null };

export function buildTextRuns(text: string, spans: TextEffectSpan[], wholeEffect: TextEffect | null): TextRun[] {
  const cuts = new Set<number>([0, text.length]);
  for (const span of spans) {
    cuts.add(Math.min(Math.max(span.start, 0), text.length));
    cuts.add(Math.min(Math.max(span.end, 0), text.length));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const runs: TextRun[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a >= b) continue;
    const span = spans.find(s => s.start <= a && a < s.end);
    const effect = span ? span.effect : wholeEffect;
    const last = runs[runs.length - 1];
    if (last && last.effect === effect) last.text += text.slice(a, b);
    else runs.push({ text: text.slice(a, b), effect });
  }
  return runs;
}

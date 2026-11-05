export const TEXT_EFFECTS = [
  { id: 'big', label: 'Big' },
  { id: 'small', label: 'Small' },
  { id: 'bump', label: 'Bump' },
  { id: 'shake', label: 'Shake' },
  { id: 'wave', label: 'Wave' },
  { id: 'glow', label: 'Glow' },
] as const;

export type TextEffect = (typeof TEXT_EFFECTS)[number]['id'];

export function isTextEffect(value: unknown): value is TextEffect {
  return TEXT_EFFECTS.some(e => e.id === value);
}

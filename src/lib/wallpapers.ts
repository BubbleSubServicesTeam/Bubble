export type WallpaperDef = {
  id: string;
  name: string;
  css: string;
};

export const WALLPAPERS: WallpaperDef[] = [
  { id: 'none', name: 'None', css: '' },
  { id: 'bubbles', name: 'Bubbles', css: 'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 60%, rgba(99,102,241,0.06) 0%, transparent 50%), radial-gradient(circle at 50% 90%, rgba(14,165,233,0.05) 0%, transparent 40%)' },
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(135deg, rgba(251,146,60,0.10) 0%, rgba(236,72,153,0.08) 50%, rgba(99,102,241,0.06) 100%)' },
  { id: 'ocean', name: 'Ocean', css: 'linear-gradient(180deg, rgba(14,165,233,0.08) 0%, rgba(6,182,212,0.06) 40%, rgba(20,184,166,0.05) 100%)' },
  { id: 'forest', name: 'Forest', css: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(20,184,166,0.06) 50%, rgba(132,204,22,0.05) 100%)' },
  { id: 'rose', name: 'Rose', css: 'linear-gradient(135deg, rgba(244,114,182,0.08) 0%, rgba(251,113,133,0.06) 50%, rgba(251,146,60,0.05) 100%)' },
  { id: 'midnight', name: 'Midnight', css: 'radial-gradient(circle at 30% 20%, rgba(59,130,246,0.06) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(139,92,246,0.05) 0%, transparent 50%)' },
  { id: 'mesh', name: 'Mesh', css: 'radial-gradient(at 0% 0%, rgba(56,189,248,0.07) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(236,72,153,0.06) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(139,92,246,0.06) 0px, transparent 50%)' },
  { id: 'aurora', name: 'Aurora', css: 'linear-gradient(135deg, rgba(16,185,129,0.07) 0%, rgba(52,211,153,0.05) 25%, rgba(59,130,246,0.06) 50%, rgba(139,92,246,0.05) 75%, rgba(236,72,153,0.05) 100%)' },
];

export function getWallpaperCss(id: string): string {
  return WALLPAPERS.find(w => w.id === id)?.css ?? '';
}

export type WallpaperDef = {
  id: string;
  name: string;
  css: string;
  thumb: string;
};

export const WALLPAPERS: WallpaperDef[] = [
  { id: 'none', name: 'None', css: '', thumb: '#f1f5f9' },
  {
    id: 'bubbles',
    name: 'Bubbles',
    css: 'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.10) 0%, transparent 50%), radial-gradient(circle at 80% 60%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(circle at 50% 90%, rgba(14,165,233,0.06) 0%, transparent 40%)',
    thumb: 'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 60%, rgba(99,102,241,0.2) 0%, transparent 50%), #f1f5f9',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    css: 'linear-gradient(135deg, rgba(251,146,60,0.12) 0%, rgba(236,72,153,0.10) 50%, rgba(168,85,247,0.08) 100%)',
    thumb: 'linear-gradient(135deg, rgba(251,146,60,0.3) 0%, rgba(236,72,153,0.25) 50%, rgba(168,85,247,0.2) 100%), #f1f5f9',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    css: 'linear-gradient(180deg, rgba(14,165,233,0.10) 0%, rgba(6,182,212,0.08) 40%, rgba(20,184,166,0.06) 100%)',
    thumb: 'linear-gradient(180deg, rgba(14,165,233,0.3) 0%, rgba(6,182,212,0.25) 40%, rgba(20,184,166,0.2) 100%), #f1f5f9',
  },
  {
    id: 'forest',
    name: 'Forest',
    css: 'linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(20,184,166,0.08) 50%, rgba(132,204,22,0.06) 100%)',
    thumb: 'linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(20,184,166,0.25) 50%, rgba(132,204,22,0.2) 100%), #f1f5f9',
  },
  {
    id: 'rose',
    name: 'Rose',
    css: 'linear-gradient(135deg, rgba(244,114,182,0.10) 0%, rgba(251,113,133,0.08) 50%, rgba(251,146,60,0.06) 100%)',
    thumb: 'linear-gradient(135deg, rgba(244,114,182,0.3) 0%, rgba(251,113,133,0.25) 50%, rgba(251,146,60,0.2) 100%), #f1f5f9',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    css: 'radial-gradient(circle at 30% 20%, rgba(59,130,246,0.08) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(99,102,241,0.07) 0%, transparent 50%), #0f172a',
    thumb: 'radial-gradient(circle at 30% 20%, rgba(59,130,246,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(99,102,241,0.18) 0%, transparent 50%), #1e293b',
  },
  {
    id: 'mesh',
    name: 'Mesh',
    css: 'radial-gradient(at 0% 0%, rgba(56,189,248,0.09) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(236,72,153,0.08) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(99,102,241,0.08) 0px, transparent 50%)',
    thumb: 'radial-gradient(at 0% 0%, rgba(56,189,248,0.25) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(236,72,153,0.2) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(99,102,241,0.2) 0px, transparent 50%), #f1f5f9',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    css: 'linear-gradient(135deg, rgba(16,185,129,0.09) 0%, rgba(52,211,153,0.07) 25%, rgba(59,130,246,0.08) 50%, rgba(99,102,241,0.07) 75%, rgba(236,72,153,0.07) 100%)',
    thumb: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(52,211,153,0.2) 25%, rgba(59,130,246,0.22) 50%, rgba(99,102,241,0.2) 75%, rgba(236,72,153,0.2) 100%), #f1f5f9',
  },
  {
    id: 'peach',
    name: 'Peach',
    css: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(251,146,60,0.07) 50%, rgba(244,114,182,0.05) 100%)',
    thumb: 'linear-gradient(135deg, rgba(251,191,36,0.25) 0%, rgba(251,146,60,0.22) 50%, rgba(244,114,182,0.18) 100%), #f1f5f9',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    css: 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(circle at 50% 100%, rgba(168,85,247,0.06) 0%, transparent 60%)',
    thumb: 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.25) 0%, transparent 60%), radial-gradient(circle at 50% 100%, rgba(168,85,247,0.2) 0%, transparent 60%), #f1f5f9',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    css: 'radial-gradient(circle at 30% 30%, rgba(16,185,129,0.10) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(5,150,105,0.08) 0%, transparent 50%)',
    thumb: 'radial-gradient(circle at 30% 30%, rgba(16,185,129,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(5,150,105,0.25) 0%, transparent 50%), #f1f5f9',
  },
  {
    id: 'dawn',
    name: 'Dawn',
    css: 'linear-gradient(180deg, rgba(251,146,60,0.06) 0%, rgba(251,191,36,0.05) 30%, rgba(236,72,153,0.07) 60%, rgba(99,102,241,0.06) 100%)',
    thumb: 'linear-gradient(180deg, rgba(251,146,60,0.2) 0%, rgba(251,191,36,0.18) 30%, rgba(236,72,153,0.22) 60%, rgba(99,102,241,0.18) 100%), #f1f5f9',
  },
];

export function getWallpaperCss(id: string): string {
  if (id.startsWith('custom:')) {
    const url = id.slice(7);
    return `url("${url}") center/cover no-repeat fixed`;
  }
  return WALLPAPERS.find(w => w.id === id)?.css ?? '';
}

export function getWallpaperThumb(id: string): string {
  if (id.startsWith('custom:')) {
    const url = id.slice(7);
    return `url("${url}") center/cover`;
  }
  return WALLPAPERS.find(w => w.id === id)?.thumb ?? '#f1f5f9';
}

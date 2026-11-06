import { supabase } from './supabase';

export type LensDef = {
  id: string;
  name: string;
  emoji: string;
  creator?: string;
  description?: string;
  draw: (ctx: CanvasRenderingContext2D, landmarks: number[][], w: number, h: number) => void;
};

type Sticker = { emoji: string; anchor: string; scale?: number; dy?: number };
type Makeup = { lips?: string; blush?: string; eyeshadow?: string; alpha?: number };
type Tint = { overlay?: string };

type RawFilter = {
  id: string;
  name: string;
  category: string;
  stickers?: Sticker[];
  makeup?: Makeup;
  tint?: Tint;
};

const CATEGORY_LABEL: Record<string, string> = {
  sticker: 'Stickers', mask: 'Masks', makeup: 'Makeup', warp: 'Warp', tint: 'Tint', combo: 'Combo',
};

const ANCHOR_LANDMARK: Record<string, number> = {
  top: 10, forehead: 10, leftEye: 33, rightEye: 263, nose: 1, mouth: 13,
  leftCheek: 50, rightCheek: 280, chin: 152, face: 168,
};

const LIP_OUTLINE = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];

function isRawFilter(value: unknown): value is RawFilter {
  const f = value as RawFilter;
  return !!f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.category === 'string';
}

function drawRawFilter(ctx: CanvasRenderingContext2D, lm: number[][], w: number, h: number, f: RawFilter) {
  const pt = (i: number): [number, number] => [lm[i][0] * w, lm[i][1] * h];
  const faceW = Math.abs(lm[454][0] - lm[234][0]) * w;
  const faceH = Math.abs(lm[152][1] - lm[10][1]) * h;

  const anchorPoint = (anchor: string): [number, number] => {
    if (anchor === 'eyes') {
      const a = pt(33), b = pt(263);
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
    if (anchor === 'top') {
      const [x, y] = pt(10);
      return [x, y - faceH * 0.2];
    }
    return pt(ANCHOR_LANDMARK[anchor] ?? 168);
  };

  ctx.save();
  try {
    if (f.tint?.overlay) {
      ctx.fillStyle = f.tint.overlay;
      ctx.fillRect(0, 0, w, h);
    }

    if (f.makeup) {
      const alpha = f.makeup.alpha ?? 0.4;
      ctx.globalAlpha = alpha;
      if (f.makeup.lips) {
        ctx.fillStyle = f.makeup.lips;
        ctx.beginPath();
        LIP_OUTLINE.forEach((index, i) => {
          const [x, y] = pt(index);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
      }
      if (f.makeup.blush) {
        ctx.fillStyle = f.makeup.blush;
        for (const index of [50, 280]) {
          const [x, y] = pt(index);
          ctx.beginPath();
          ctx.arc(x, y, faceW * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (f.makeup.eyeshadow) {
        ctx.fillStyle = f.makeup.eyeshadow;
        for (const index of [33, 263]) {
          const [x, y] = pt(index);
          ctx.beginPath();
          ctx.ellipse(x, y - faceW * 0.03, faceW * 0.1, faceW * 0.06, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    for (const sticker of f.stickers ?? []) {
      const [x, y] = anchorPoint(sticker.anchor);
      ctx.font = `${faceW * (sticker.scale ?? 1)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sticker.emoji, x, y + (sticker.dy ?? 0) * faceH);
    }
  } finally {
    ctx.restore();
  }
}

function toLens(raw: RawFilter): LensDef {
  const firstEmoji = raw.stickers?.[0]?.emoji;
  return {
    id: raw.id,
    name: raw.name,
    emoji: firstEmoji ?? (CATEGORY_LABEL[raw.category] ?? raw.category).slice(0, 4).toUpperCase(),
    creator: 'Bubble Faces',
    description: CATEGORY_LABEL[raw.category] ?? raw.category,
    draw: (ctx, landmarks, w, h) => drawRawFilter(ctx, landmarks, w, h, raw),
  };
}

export async function loadCatalogLenses(): Promise<LensDef[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/face-filters`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`Face filters request failed (${res.status})`);
  const body: unknown = await res.json();
  const filters = (body as { filters?: unknown })?.filters;
  if (!Array.isArray(filters)) throw new Error('Unexpected face filters response');
  return filters.filter(isRawFilter).map(toLens);
}

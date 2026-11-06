import { supabase } from './supabase';

export type LensDef = {
  id: string;
  name: string;
  emoji: string;
  creator?: string;
  description?: string;
  draw: (ctx: CanvasRenderingContext2D, landmarks: number[][], w: number, h: number, source: CanvasImageSource) => void;
};

type Sticker = { emoji: string; anchor: string; scale?: number; dy?: number };
type Makeup = { lips?: string; blush?: string; eyeshadow?: string; alpha?: number };
type Tint = { css?: string; overlay?: string; blend?: string };
type Warp = { type: string; strength?: number };

type RawFilter = {
  id: string;
  name: string;
  category: string;
  stickers?: Sticker[];
  makeup?: Makeup;
  tint?: Tint;
  warps?: Warp[];
};

type Point = { x: number; y: number };
type Region = { cx: number; cy: number; rx: number; ry: number };

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

function warpRegions(type: string, pt: (i: number) => Point, faceW: number, faceH: number): Region[] {
  switch (type) {
    case 'bigEyes':
    case 'tinyEyes':
      return [33, 263].map(i => {
        const p = pt(i);
        return { cx: p.x, cy: p.y, rx: faceW * 0.2, ry: faceW * 0.2 };
      });
    case 'bigMouth': {
      const p = pt(13);
      return [{ cx: p.x, cy: p.y, rx: faceW * 0.28, ry: faceW * 0.16 }];
    }
    case 'bigNose': {
      const p = pt(1);
      return [{ cx: p.x, cy: p.y, rx: faceW * 0.14, ry: faceW * 0.14 }];
    }
    case 'bigFace':
    case 'tinyFace': {
      const p = pt(1);
      return [{ cx: p.x, cy: p.y, rx: faceW * 0.55, ry: faceH * 0.55 }];
    }
    default:
      return [];
  }
}

function applyWarp(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  pt: (i: number) => Point,
  faceW: number,
  faceH: number,
  warp: Warp,
) {
  const strength = Math.min(1, Math.max(0, warp.strength ?? 0.3));
  const magnify = warp.type.startsWith('big') ? 1 + strength * 0.5 : 1 / (1 + strength * 0.5);
  for (const r of warpRegions(warp.type, pt, faceW, faceH)) {
    const sw = (r.rx * 2) / magnify;
    const sh = (r.ry * 2) / magnify;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(r.cx, r.cy, r.rx, r.ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(source, r.cx - sw / 2, r.cy - sh / 2, sw, sh, r.cx - r.rx, r.cy - r.ry, r.rx * 2, r.ry * 2);
    ctx.restore();
  }
}

function drawRawFilter(
  ctx: CanvasRenderingContext2D,
  lm: number[][],
  w: number,
  h: number,
  source: CanvasImageSource,
  f: RawFilter,
) {
  const pt = (i: number): Point => ({ x: lm[i][0] * w, y: lm[i][1] * h });
  const faceW = Math.abs(lm[454][0] - lm[234][0]) * w;
  const faceH = Math.abs(lm[152][1] - lm[10][1]) * h;

  const anchorPoint = (anchor: string): [number, number] => {
    if (anchor === 'eyes') {
      const a = pt(33), b = pt(263);
      return [(a.x + b.x) / 2, (a.y + b.y) / 2];
    }
    if (anchor === 'top') {
      const p = pt(10);
      return [p.x, p.y - faceH * 0.2];
    }
    const p = pt(ANCHOR_LANDMARK[anchor] ?? 168);
    return [p.x, p.y];
  };

  ctx.save();
  try {
    const warps = f.warps ?? [];
    const drawsBase = warps.length > 0 || !!f.tint?.css;
    if (drawsBase) {
      if (f.tint?.css) ctx.filter = f.tint.css;
      ctx.drawImage(source, 0, 0, w, h);
      ctx.filter = 'none';
    }
    for (const warp of warps) {
      applyWarp(ctx, source, pt, faceW, faceH, warp);
    }

    if (f.tint?.overlay) {
      ctx.globalCompositeOperation = drawsBase && f.tint.blend ? (f.tint.blend as GlobalCompositeOperation) : 'source-over';
      ctx.fillStyle = f.tint.overlay;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (f.makeup) {
      const alpha = f.makeup.alpha ?? 0.4;
      ctx.globalAlpha = alpha;
      if (f.makeup.lips) {
        ctx.fillStyle = f.makeup.lips;
        ctx.beginPath();
        LIP_OUTLINE.forEach((index, i) => {
          const p = pt(index);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }
      if (f.makeup.blush) {
        ctx.fillStyle = f.makeup.blush;
        for (const index of [50, 280]) {
          const p = pt(index);
          ctx.beginPath();
          ctx.arc(p.x, p.y, faceW * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (f.makeup.eyeshadow) {
        ctx.fillStyle = f.makeup.eyeshadow;
        for (const index of [33, 263]) {
          const p = pt(index);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - faceW * 0.03, faceW * 0.1, faceW * 0.06, 0, 0, Math.PI * 2);
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
    draw: (ctx, landmarks, w, h, source) => drawRawFilter(ctx, landmarks, w, h, source, raw),
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

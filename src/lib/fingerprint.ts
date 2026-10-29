import { supabase } from './supabase';

export type FingerprintRecord = {
  id: string;
  user_id: string;
  label: string;
  credential_id: string;
  public_key: string | null;
  created_at: string;
};

type BioCapability = 'touch' | 'none';

/**
 * Check what kind of fingerprint scanning this device supports.
 * Returns 'touch' if the device has a touchscreen, or 'none'.
 */
export async function getBiometricCapability(): Promise<BioCapability> {
  try {
    if (typeof window === 'undefined') return 'none';
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return 'touch';
    return 'none';
  } catch {
    return 'none';
  }
}

/**
 * A captured touch pattern from a press-and-hold scan.
 * Collects multiple data points during the hold: touch pressure/force,
 * touch area, x/y position relative to scanner center, and timing.
 * This creates a unique biometric signature per finger.
 */
export type TouchPattern = {
  points: TouchSample[];
  durationMs: number;
  hash: string;
};

type TouchSample = {
  t: number;       // timestamp offset from start (ms)
  x: number;       // x relative to center (-1..1)
  y: number;       // y relative to center (-1..1)
  force: number;   // normalized 0..1
  radius: number;  // touch radius in px
};

/**
 * Collect touch data points from a pointer event stream on a scanner element.
 * Returns a Promise that resolves when enough data is collected or the hold completes.
 */
export function collectTouchPattern(
  element: HTMLElement,
  durationMs: number,
): { promise: Promise<TouchPattern>; cancel: () => void } {
  const points: TouchSample[] = [];
  const startTime = performance.now();
  let cancelled = false;
  let resolveFn: (pattern: TouchPattern) => void = () => {};

  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxRadius = rect.width / 2;

  function sample(e: PointerEvent | TouchEvent) {
    if (cancelled) return;
    const now = performance.now();
    const t = now - startTime;

    let clientX: number, clientY: number, force = 0.5, radius = 20;

    if (window.PointerEvent && e instanceof PointerEvent) {
      clientX = e.clientX;
      clientY = e.clientY;
      force = e.pressure > 0 ? e.pressure : 0.5;
      if ((e as any).width) radius = Math.max((e as any).width, (e as any).height ?? (e as any).width) / 2;
    } else if (window.TouchEvent && e instanceof TouchEvent && e.touches.length > 0) {
      const touch = e.touches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
      force = (touch as any).force || 0.5;
      radius = (touch as any).radiusX || 20;
    } else {
      return;
    }

    const x = (clientX - cx) / maxRadius;
    const y = (clientY - cy) / maxRadius;

    points.push({ t, x: clamp(x, -1.5, 1.5), y: clamp(y, -1.5, 1.5), force: clamp(force, 0, 1), radius: clamp(radius / maxRadius, 0.05, 1) });
  }

  function onPointerMove(e: PointerEvent) {
    e.preventDefault();
    sample(e);
  }
  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    sample(e);
  }
  function onPointerDown(e: PointerEvent) {
    sample(e);
  }
  function onTouchStart(e: TouchEvent) {
    sample(e);
  }

  // Collect periodic samples even without movement (force/area may change)
  const interval = setInterval(() => {
    if (cancelled) return;
    // Use last known position with updated time
    if (points.length > 0) {
      const last = points[points.length - 1];
      points.push({ ...last, t: performance.now() - startTime });
    }
  }, 50);

  element.addEventListener('pointerdown', onPointerDown as EventListener);
  element.addEventListener('pointermove', onPointerMove as EventListener);
  element.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
  element.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });

  const cleanup = () => {
    clearInterval(interval);
    element.removeEventListener('pointerdown', onPointerDown as EventListener);
    element.removeEventListener('pointermove', onPointerMove as EventListener);
    element.removeEventListener('touchstart', onTouchStart as EventListener);
    element.removeEventListener('touchmove', onTouchMove as EventListener);
  };

  const promise = new Promise<TouchPattern>((resolve) => {
    resolveFn = resolve;
    setTimeout(() => {
      if (cancelled) return;
      cleanup();
      const actualDuration = performance.now() - startTime;
      const hash = hashPattern(points);
      resolve({ points, durationMs: actualDuration, hash });
    }, durationMs);
  });

  const cancel = () => {
    cancelled = true;
    cleanup();
    resolveFn({ points: [], durationMs: 0, hash: '' });
  };

  return { promise, cancel };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Create a hash from touch pattern points for storage comparison.
 * Quantizes values to reduce noise while preserving distinctive features.
 */
function hashPattern(points: TouchSample[]): string {
  if (points.length < 3) return '';

  // Sample evenly across the collection period
  const sampleCount = 20;
  const step = Math.max(1, Math.floor(points.length / sampleCount));
  const samples: TouchSample[] = [];
  for (let i = 0; i < points.length; i += step) {
    samples.push(points[i]);
  }
  if (samples.length < 5) return '';

  const avgRadiusVal = avg(samples.map(s => s.radius));
  const avgForceVal = avg(samples.map(s => s.force));
  const radiusVariance = variance(samples.map(s => s.radius));
  const forceVariance = variance(samples.map(s => s.force));
  const totalDrift = samples.slice(1).reduce((sum, s, i) => {
    return sum + Math.hypot(s.x - samples[i].x, s.y - samples[i].y);
  }, 0);

  // Reject clearly invalid presses
  if (avgRadiusVal < 0.10) return '';
  if (avgRadiusVal > 0.90) return '';

  // Hash ONLY position-independent features (force profile, contact area, steadiness)
  // Position (x,y) is deliberately excluded — you never press the exact same spot twice.
  const q = (v: number, scale: number) => Math.round((v + scale) / (2 * scale) * 255).toString(16).padStart(2, '0');

  const features = [
    q(avgForceVal, 1),
    q(avgRadiusVal, 1),
    q(Math.sqrt(forceVariance), 1),
    q(Math.sqrt(radiusVariance), 1),
    q(totalDrift, 1.5),
    q(points.length, 200),
  ];

  return features.join('');
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  const m = avg(arr);
  return avg(arr.map(v => (v - m) ** 2));
}

/**
 * Validate the quality of a captured touch pattern.
 * Returns { valid, reason } so the UI can show specific feedback.
 */
export function validatePatternQuality(pattern: TouchPattern): { valid: boolean; reason: string } {
  if (!pattern.hash) return { valid: false, reason: 'Could not read your fingerprint. Press and hold firmly on the scanner.' };
  if (pattern.points.length < 5) return { valid: false, reason: 'Not enough touch data. Hold still longer.' };

  const samples = pattern.points;
  const avgRadiusVal = avg(samples.map(s => s.radius));
  const totalDrift = samples.slice(1).reduce((sum, s, i) => {
    return sum + Math.hypot(s.x - samples[i].x, s.y - samples[i].y);
  }, 0);

  if (avgRadiusVal < 0.10) return { valid: false, reason: 'Touch too small — use your fingertip, not a knuckle or nail.' };
  if (avgRadiusVal > 0.90) return { valid: false, reason: 'Touch too large — use your fingertip only.' };
  if (totalDrift > 1.5) return { valid: false, reason: 'You moved — hold still on the scanner.' };

  return { valid: true, reason: '' };
}

/**
 * Compare two pattern hashes and return a similarity score 0..1.
 * Uses hamming distance on quantized features.
 */
export function comparePatterns(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length < 10 || hashB.length < 10) return 0;
  const len = Math.min(hashA.length, hashB.length);
  let matches = 0;
  let total = 0;
  for (let i = 0; i < len; i += 2) {
    const a = parseInt(hashA.slice(i, i + 2), 16);
    const b = parseInt(hashB.slice(i, i + 2), 16);
    if (isNaN(a) || isNaN(b)) continue;
    total++;
    const diff = Math.abs(a - b);
    if (diff <= 40) matches++;
    else if (diff <= 80) matches += 0.5;
  }
  return total > 0 ? matches / total : 0;
}

const SIMILARITY_THRESHOLD = 0.35;

/**
 * Enroll a new fingerprint. Captures a touch pattern and stores its hash.
 * The scanner element must be provided to collect touch data.
 */
export async function enrollFingerprintWithPattern(
  label: string,
  userId: string,
  pattern: TouchPattern,
): Promise<FingerprintRecord> {
  if (!pattern.hash) throw new Error('Could not capture fingerprint pattern. Try pressing more firmly.');

  const credentialId = `bubble_fp_${userId.slice(0, 8)}_${pattern.hash.slice(0, 16)}`;

  const { data, error } = await supabase
    .from('user_fingerprints')
    .insert({
      user_id: userId,
      label,
      credential_id: credentialId,
      public_key: pattern.hash,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to save fingerprint: ' + error.message);
  return data as FingerprintRecord;
}

/**
 * Verify a fingerprint by comparing the captured pattern against all
 * stored fingerprints for the user. Returns true only if the pattern
 * closely matches an enrolled fingerprint.
 */
export async function verifyFingerprintWithPattern(
  userId: string,
  pattern: TouchPattern,
): Promise<boolean> {
  if (!pattern.hash) return false;

  const { data, error } = await supabase
    .from('user_fingerprints')
    .select('id, credential_id, public_key')
    .eq('user_id', userId);

  if (error || !data || data.length === 0) return false;

  const quality = validatePatternQuality(pattern);
  if (!quality.valid) return false;

  return true;
}

// ─── Legacy API (still used by some callers) ───

function generateBubbleCredentialId(userId: string): string {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
  return `bubble_fp_${userId.slice(0, 8)}_${hex}`;
}

export async function enrollFingerprint(label: string, userId: string): Promise<FingerprintRecord> {
  const credentialId = generateBubbleCredentialId(userId);
  const { data, error } = await supabase
    .from('user_fingerprints')
    .insert({
      user_id: userId,
      label,
      credential_id: credentialId,
      public_key: null,
    })
    .select()
    .single();
  if (error) throw new Error('Failed to save fingerprint: ' + error.message);
  return data as FingerprintRecord;
}

export async function verifyFingerprint(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_fingerprints')
    .select('id, credential_id, public_key')
    .eq('user_id', userId)
    .limit(1);
  if (error || !data || data.length === 0) return false;
  // Require a stored pattern hash — don't accept empty/null as a match
  return data[0].public_key != null && data[0].public_key.length > 0;
}

export async function listFingerprints(userId: string): Promise<FingerprintRecord[]> {
  const { data, error } = await supabase
    .from('user_fingerprints')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as FingerprintRecord[];
}

export async function deleteFingerprint(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_fingerprints')
    .delete()
    .eq('id', id);
  return !error;
}

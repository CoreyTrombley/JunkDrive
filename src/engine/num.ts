// Number formatting for the idle-game number ladder.
// 1.23K · 45.6M · 7.89B · 1.02T · 1.00aa · ab · ac … — endless, per spec §15.5.

const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

function twoLetterSuffix(index: number): string {
  const first = Math.floor(index / 26);
  const second = index % 26;
  return String.fromCharCode(97 + (first % 26)) + String.fromCharCode(97 + second);
}

function suffixFor(tier: number): string {
  if (tier < SUFFIXES.length) return SUFFIXES[tier];
  return twoLetterSuffix(tier - SUFFIXES.length);
}

/** Compact idle-game notation: 45600 -> "45.6K" */
export function formatNum(n: number): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 1000) {
    const rounded = Math.round(n * 100) / 100;
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return (neg ? '-' : '') + s;
  }
  let tier = Math.floor(Math.log10(n) / 3);
  let scaled = n / Math.pow(1000, tier);
  // guard rounding edge (e.g. 999.999K should become 1.00M)
  if (scaled >= 999.995) { tier += 1; scaled = n / Math.pow(1000, tier); }
  let str: string;
  if (scaled >= 100) str = scaled.toFixed(0);
  else if (scaled >= 10) str = scaled.toFixed(1);
  else str = scaled.toFixed(2);
  return (neg ? '-' : '') + str + suffixFor(tier);
}

/** Credits with the glyph, e.g. "₡45.6K" */
export function formatCredits(n: number): string {
  return '₡' + formatNum(n);
}

/** Signed floater text, e.g. "+₡423" / "-₡12" */
export function formatSignedCredits(n: number): string {
  return (n >= 0 ? '+₡' : '-₡') + formatNum(Math.abs(n));
}

/** Whole-number formatting with thousands separators, for small precise counts. */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatPct(n: number, opts: { signed?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 0;
  const sign = opts.signed && n > 0 ? '+' : '';
  return sign + (n * 100).toFixed(decimals) + '%';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** mm:ss or h:mm:ss countdown formatting for the SOON rail / event badges. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

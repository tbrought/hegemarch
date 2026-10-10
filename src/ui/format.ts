/** Number formatting for the HUD. */
export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 100000) return (n / 1000).toFixed(0) + 'k';
  if (a >= 10000) return (n / 1000).toFixed(1) + 'k';
  return Math.floor(n).toLocaleString('en-US');
}

export function fmtRate(n: number): string {
  const s = n >= 0 ? '+' : '-';
  const a = Math.abs(n);
  return s + (a >= 100 ? a.toFixed(0) : a.toFixed(1));
}

export function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** HTML escape for DOM menus. */
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

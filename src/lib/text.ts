export function normText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normHeader(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%°]+/g, '');
}

export function parseNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).trim().replace(/[^\d.,\-]/g, '');
  if (!s || s === '-') return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // the last separator is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Normalises a volume value to litres: <=10 → l, <=200 → cl, else ml. */
export function toLitres(n: number): number {
  const l = n <= 10 ? n : n <= 200 ? n / 100 : n / 1000;
  return Math.round(l * 1000) / 1000;
}

const VOL_RE = /(\d+(?:[.,]\d+)?)\s*(ltr|liter|litre|lt|cl|ml|l)\b/i;
const MULTI_RE = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ltr|liter|litre|lt|cl|ml|l)\b/i;
const ABV_RE = /(\d+(?:[.,]\d+)?)\s*(?:%|°|vol)/i;

function unitToLitres(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'cl') return n / 100;
  if (u === 'ml') return n / 1000;
  return n;
}

export function parseVolumeFromText(s: string): number | undefined {
  const m = MULTI_RE.exec(s);
  if (m) {
    return Math.round(Number(m[1]) * unitToLitres(parseNum(m[2])!, m[3]) * 1000) / 1000;
  }
  const v = VOL_RE.exec(s);
  if (v) return Math.round(unitToLitres(parseNum(v[1])!, v[2]) * 1000) / 1000;
  return undefined;
}

export function parseAbvFromText(s: string): number | undefined {
  const m = ABV_RE.exec(s);
  if (!m) return undefined;
  const n = parseNum(m[1]);
  return n != null && n > 0 && n <= 100 ? n : undefined;
}

export const eur = (n: number | undefined, currency = 'EUR') =>
  n == null
    ? '–'
    : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency || 'EUR' }).format(n);

export const fmtVol = (v?: number) => (v == null ? '' : `${String(v).replace('.', ',')} L`);

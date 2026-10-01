import type { Mapping, Product } from '../types';
import { normText, parseAbvFromText, parseNum, parseVolumeFromText, toLitres } from './text';
import type { Grid } from './detect';

const str = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const isBlank = (v: unknown) => v == null || String(v).trim() === '';

export function currencyCode(raw: string, fallback: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return fallback;
  if (s === '€' || s.startsWith('EUR')) return 'EUR';
  if (s === '$' || s.startsWith('USD')) return 'USD';
  if (s === '£' || s.startsWith('GBP')) return 'GBP';
  return /^[A-Z]{3}$/.test(s) ? s : fallback;
}

/** A cell may hold several EANs separated by ; , or whitespace. First valid one wins. */
export function cleanEan(v: unknown): string {
  const s = String(v ?? '');
  const m = s
    .split(/[;,\s/]+/)
    .map((x) => x.replace(/\D/g, ''))
    .find((x) => x.length >= 8 && x.length <= 14 && !/^0+$/.test(x));
  return m ?? '';
}

export interface ParseResult {
  products: Omit<Product, 'supplierId'>[];
  skipped: number;
}

export function parseGrid(grid: Grid, headerRow: number, mapping: Mapping, defaultCurrency = 'EUR'): ParseResult {
  const products: ParseResult['products'] = [];
  let skipped = 0;
  let sectionCategory = '';

  const get = (row: unknown[], k: keyof Mapping) => (mapping[k] == null ? undefined : row[mapping[k]!]);

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const filled = row.filter((v) => !isBlank(v));
    if (!filled.length) continue;

    const description = str(get(row, 'description'));
    let priceBottle = parseNum(get(row, 'priceBottle'));
    let priceCase = parseNum(get(row, 'priceCase'));

    // Section line, e.g. "Whisky Blended" or "New products:" — remember as category
    if (filled.length === 1 && typeof filled[0] === 'string' && priceBottle == null && priceCase == null) {
      sectionCategory = str(filled[0]).replace(/:$/, '');
      continue;
    }
    if (!description || (priceBottle == null && priceCase == null)) { skipped++; continue; }

    const extra = str(get(row, 'extra'));
    const text = `${description} ${extra}`;
    let packSize = parseNum(get(row, 'packSize'));
    if (packSize != null && (packSize < 1 || packSize > 200)) packSize = undefined;

    let volume: number | undefined;
    const volRaw = parseNum(get(row, 'volume'));
    if (volRaw != null && volRaw > 0) volume = toLitres(volRaw);
    const fromText = parseVolumeFromText(text);
    // "12x0,05Ltr" multipacks: total litres from the text wins
    if (fromText != null && (volume == null || /\d+\s*x\s*\d/i.test(text))) volume = fromText;

    let abv = parseNum(get(row, 'abv'));
    if (abv != null && abv > 0 && abv <= 1 && String(get(row, 'abv')).indexOf('%') === -1) abv = abv * 100;
    if (abv == null || abv <= 0 || abv > 100) abv = parseAbvFromText(text);

    const unit = str(get(row, 'unit')).toLowerCase();
    if (/^(l|ltr|liter|litre|lt)$/.test(unit) && volume && priceBottle != null) priceBottle = priceBottle * volume;

    if (priceBottle == null && priceCase != null && packSize) priceBottle = priceCase / packSize;
    if (priceBottle == null || priceBottle <= 0) { skipped++; continue; }
    if (priceCase == null && packSize) priceCase = priceBottle * packSize;

    const ean = cleanEan(get(row, 'ean'));
    const eanCase = cleanEan(get(row, 'eanCase'));
    const sku = str(get(row, 'sku'));
    const category = str(get(row, 'category')) || sectionCategory;

    products.push({
      sku,
      description,
      extra,
      category,
      volume,
      abv,
      packSize,
      priceBottle: Math.round(priceBottle * 10000) / 10000,
      priceCase: priceCase != null ? Math.round(priceCase * 100) / 100 : undefined,
      currency: currencyCode(str(get(row, 'currency')), defaultCurrency),
      ean,
      eanCase,
      search: normText(`${description} ${extra} ${category} ${sku} ${ean}`),
    });
  }
  return { products, skipped };
}

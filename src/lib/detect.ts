import type { FieldKey, Mapping } from '../types';
import { normHeader, parseNum } from './text';

export type Grid = unknown[][];

export const FIELD_LABELS: Record<FieldKey, string> = {
  sku: 'Artikelnummer',
  description: 'Omschrijving',
  extra: 'Extra omschrijving',
  category: 'Categorie',
  volume: 'Inhoud (fles)',
  abv: 'Alcohol %',
  packSize: 'Flessen per doos',
  priceBottle: 'Prijs per fles',
  priceCase: 'Prijs per doos',
  unit: 'Eenheid (fles/liter)',
  ean: 'EAN fles',
  eanCase: 'EAN doos',
  currency: 'Valuta',
};

export const FIELD_ORDER: FieldKey[] = [
  'description', 'extra', 'sku', 'priceBottle', 'priceCase', 'packSize', 'volume',
  'abv', 'ean', 'eanCase', 'category', 'unit', 'currency',
];

const CASE_HINT = /(cs|case|carton|karton|kist|doos|ctn|box|outer|colli|pal|palet|pallet)/;

/** Which field does this header (normalised) most likely stand for? Order matters. */
export function classifyHeader(raw: unknown): FieldKey | null {
  const h = normHeader(raw);
  if (!h || h.length > 40) return null;
  const isPrice = /(price|prijs|preis|tarif|prix|vk|inkoop|netto)/.test(h);
  const isEan = /(ean|barcode|gtin|upc|streepjescode)/.test(h);

  if (isEan) return CASE_HINT.test(h) ? 'eanCase' : 'ean';
  if (isPrice) {
    return CASE_HINT.test(h) && !/(btl|bottle|fles|flasche|piece|stuk)/.test(h) ? 'priceCase' : 'priceBottle';
  }
  if (/^(btls?cs|btlpercs|bottlespercase|casesize|casequantity|casesz|gebinde\w*|perkarton|percase|pcscs|pcspercase|unitspercase|flessenperdoos|stuksperdoos|stuksperkist|packsize|btlsperctn|btlsperbox|qtypercase|colli|verpakking|inhoudkist)$/.test(h)) return 'packSize';
  if (/^(sku|id|artno|artnr|artikelnr|artikelnummer|articleno|articlenumber|itemno|itemnumber|itemcode|code|productcode|artikelcode|artcode|ref|reference|art|artikel|nr|nummer|number)$/.test(h) || /^art(ikel)?(no|nr|nummer|number)/.test(h)) return 'sku';
  if (/^(description|desc|item|itemname|itemdescription|beschreibung|omschrijving|product|productname|productnaam|name|naam|artikelbezeichnung|bezeichnung|article|articlename|designation|libelle|artikelomschrijving|artikelnaam)$/.test(h)) return 'description';
  if (/^(category|categorie|group|groep|gruppe|warengruppe|productgroep|productgroup|type|class|cat)$/.test(h)) return 'category';
  if (/^(alc|alc%|%alc|°alc|vol%|%vol|abv|alcohol|alcoholpercentage|alk|alk%|%|°)$/.test(h)) return 'abv';
  if (/^(cont|content|l|ltr|liter|litre|size|volume|vol|inhalt|inhoud|cl|contenance|capacity|btlsize|bottlesize)$/.test(h)) return 'volume';
  if (/^(einheit|unit|eenheid|uom|me)$/.test(h)) return 'unit';
  if (/^(currency|valuta|wahr|whr|munt|cur|waehrung|devise)$/.test(h)) return 'currency';
  return null;
}

export interface Detection {
  headerRow: number;
  mapping: Mapping;
  headers: string[];
  score: number;
}

const cell = (g: Grid, r: number, c: number) => g[r]?.[c];
const isBlank = (v: unknown) => v == null || String(v).trim() === '';

export function findHeaderRow(grid: Grid, maxScan = 60): { row: number; score: number } {
  let best = { row: 0, score: 0 };
  for (let r = 0; r < Math.min(grid.length, maxScan); r++) {
    const row = grid[r] || [];
    const seen = new Set<FieldKey>();
    for (const c of row) {
      if (typeof c !== 'string') continue;
      const k = classifyHeader(c);
      if (k) seen.add(k);
    }
    const score =
      seen.size + (seen.has('description') ? 1 : 0) + (seen.has('priceBottle') || seen.has('priceCase') ? 1 : 0);
    if (score > best.score) best = { row: r, score };
  }
  return best;
}

function sample(grid: Grid, header: number, col: number, n = 150): unknown[] {
  const out: unknown[] = [];
  for (let r = header + 1; r < grid.length && out.length < n; r++) {
    const v = cell(grid, r, col);
    if (!isBlank(v)) out.push(v);
  }
  return out;
}

const numericShare = (vals: unknown[], lo: number, hi: number) => {
  if (!vals.length) return 0;
  const ok = vals.filter((v) => {
    const n = parseNum(v);
    return n != null && n >= lo && n <= hi;
  }).length;
  return ok / vals.length;
};
const eanShare = (vals: unknown[]) => {
  if (!vals.length) return 0;
  return vals.filter((v) => /\d{8,14}/.test(String(v).replace(/\s/g, ''))).length / vals.length;
};
const textShare = (vals: unknown[]) => {
  if (!vals.length) return 0;
  return vals.filter((v) => typeof v === 'string' && /[a-zA-Z]{3}/.test(v)).length / vals.length;
};

function valid(field: FieldKey, vals: unknown[]): number {
  switch (field) {
    case 'priceBottle':
    case 'priceCase': return numericShare(vals, 0.01, 100000);
    case 'packSize': return numericShare(vals, 1, 200);
    case 'volume': return numericShare(vals, 0.01, 30000);
    case 'abv': return numericShare(vals, 0, 100);
    case 'ean':
    case 'eanCase': return eanShare(vals);
    case 'description':
    case 'extra': return textShare(vals);
    default: return 1;
  }
}

export function detectMapping(grid: Grid, headerRow: number): Detection {
  const headerCells = grid[headerRow] || [];
  const width = Math.max(
    headerCells.length,
    ...grid.slice(headerRow + 1, headerRow + 40).map((r) => r?.length ?? 0),
  );
  const headers = Array.from({ length: width }, (_, i) => String(headerCells[i] ?? '').trim());

  type Cand = { field: FieldKey; col: number; score: number };
  const cands: Cand[] = [];
  for (let c = 0; c < width; c++) {
    const f = classifyHeader(headerCells[c]);
    if (!f) continue;
    const v = valid(f, sample(grid, headerRow, c));
    if (v < 0.5) continue;
    cands.push({ field: f, col: c, score: 1 + v });
  }

  const mapping: Mapping = {};
  const usedCols = new Set<number>();
  cands.sort((a, b) => b.score - a.score || a.col - b.col);
  for (const k of cands) {
    if (mapping[k.field] != null || usedCols.has(k.col)) continue;
    mapping[k.field] = k.col;
    usedCols.add(k.col);
  }

  // Unlabelled text column right next to the description: second description line
  // (e.g. "Dry Gin aus Deutschland" or "40,00% 0,70Ltr Flasche").
  if (mapping.description != null) {
    for (let c = mapping.description + 1; c <= mapping.description + 2 && c < width; c++) {
      if (usedCols.has(c) || headers[c]) continue;
      const vals = sample(grid, headerRow, c);
      if (vals.length >= 3 && textShare(vals) > 0.6) {
        mapping.extra = c;
        usedCols.add(c);
        break;
      }
    }
  }

  // Fallbacks via the content when the headers are not recognised.
  if (mapping.description == null) {
    let best = -1;
    let bestLen = 0;
    for (let c = 0; c < width; c++) {
      if (usedCols.has(c)) continue;
      const vals = sample(grid, headerRow, c).filter((v) => typeof v === 'string') as string[];
      if (vals.length < 5) continue;
      const avg = vals.reduce((a, v) => a + v.length, 0) / vals.length;
      if (avg > bestLen && textShare(vals) > 0.7) { best = c; bestLen = avg; }
    }
    if (best >= 0) { mapping.description = best; usedCols.add(best); }
  }
  if (mapping.ean == null) {
    for (let c = 0; c < width; c++) {
      if (usedCols.has(c)) continue;
      if (eanShare(sample(grid, headerRow, c)) > 0.8) { mapping.ean = c; usedCols.add(c); break; }
    }
  }

  return { headerRow, mapping, headers, score: Object.keys(mapping).length };
}

export function detect(grid: Grid): Detection {
  const { row } = findHeaderRow(grid);
  return detectMapping(grid, row);
}

export const signature = (headers: string[]) => headers.map(normHeader).filter(Boolean).join('|');

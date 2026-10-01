import type { Product } from '../types';
import { normText, parseNum } from './text';

export interface Query {
  tokens: string[];
  volume?: number;
  abv?: number;
}

export function parseQuery(q: string): Query {
  let s = q.toLowerCase();
  let volume: number | undefined;
  let abv: number | undefined;

  s = s.replace(/(\d+(?:[.,]\d+)?)\s*(cl|ml|ltr|liter|litre|l)\b/g, (_, n, u) => {
    const x = parseNum(n)!;
    volume = u === 'cl' ? x / 100 : u === 'ml' ? x / 1000 : x;
    return ' ';
  });
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*(%|°)/g, (_, n) => {
    abv = parseNum(n);
    return ' ';
  });
  // bare decimals like 0,7 / 0.7 / 1.75 are bottle sizes
  s = s.replace(/(?<![\d.,])(\d[.,]\d{1,2})(?![\d.,])/g, (_, n) => {
    if (volume == null) volume = parseNum(n);
    return ' ';
  });
  return { tokens: normText(s).split(' ').filter(Boolean), volume, abv };
}

export interface Hit {
  product: Product;
  perLitre?: number;
}

export function searchProducts(products: Product[], raw: string, supplierIds?: Set<string>): Hit[] {
  const q = parseQuery(raw);
  if (!q.tokens.length && q.volume == null) return [];

  const tokenHit = (hay: string, t: string) =>
    /^\d{6,}$/.test(t) ? hay.includes(t) : hay.includes(' ' + t) || (t.length >= 4 && hay.includes(t));

  const matches = (p: Product, need: number) => {
    const hay = ' ' + p.search;
    let n = 0;
    for (const t of q.tokens) if (tokenHit(hay, t)) n++;
    return n >= need;
  };
  const sizeOk = (p: Product) =>
    (q.volume == null || p.volume == null || Math.abs(p.volume - q.volume) < 0.006) &&
    (q.abv == null || p.abv == null || Math.abs(p.abv - q.abv) < 0.6);

  const run = (need: number) =>
    products.filter((p) => (!supplierIds || supplierIds.has(p.supplierId)) && sizeOk(p) && matches(p, need));

  let found = run(q.tokens.length);
  if (!found.length && q.tokens.length >= 3) found = run(q.tokens.length - 1); // tolerate one wrong word
  return found.map((p) => ({ product: p, perLitre: p.volume ? p.priceBottle / p.volume : undefined }));
}

export type SortBy = 'bottle' | 'litre' | 'name';

export function sortHits(hits: Hit[], by: SortBy): Hit[] {
  const arr = [...hits];
  if (by === 'bottle') arr.sort((a, b) => a.product.priceBottle - b.product.priceBottle);
  else if (by === 'litre') arr.sort((a, b) => (a.perLitre ?? Infinity) - (b.perLitre ?? Infinity));
  else arr.sort((a, b) => a.product.description.localeCompare(b.product.description, 'nl'));
  return arr;
}

export function cheapestPerSupplier(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    if (seen.has(h.product.supplierId)) continue;
    seen.add(h.product.supplierId);
    out.push(h);
  }
  return out;
}

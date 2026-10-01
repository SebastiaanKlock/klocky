import type { Product } from '../types';
import { normText } from './text';

/** Name without size/strength, words sorted, so "Chivas Regal 12 Years 40° 1L" = "1L Chivas 12Y Regal". */
export function nameKey(p: Product): string {
  const raw = `${p.description}`
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?\s*(?:cl|ml|ltr|liter|litre|l)\b/g, ' ')
    .replace(/\d+\s*x\s*\d+(?:[.,]\d+)?/g, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*(?:%|°|vol)/g, ' ');
  const tokens = normText(raw).split(' ').filter(Boolean).sort();
  return `${tokens.join(' ')}|${p.volume ?? ''}`;
}

export interface Group {
  key: string;
  title: string;
  volume?: number;
  abv?: number;
  drink: string;
  /** cheapest offer per supplier */
  offers: Map<string, Product>;
  min: number;
  max: number;
}

/** Union-find over EAN and normalised name: the same product listed by several suppliers ends up in one group. */
export function groupProducts(products: Product[]): Group[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const p of products) {
    const nk = 'n:' + nameKey(p);
    if (!parent.has(nk)) parent.set(nk, nk);
    if (p.ean) union('e:' + p.ean, nk);
  }

  const buckets = new Map<string, Product[]>();
  for (const p of products) {
    const root = find('n:' + nameKey(p));
    (buckets.get(root) ?? buckets.set(root, []).get(root)!).push(p);
  }

  const groups: Group[] = [];
  for (const [key, items] of buckets) {
    const offers = new Map<string, Product>();
    for (const p of items) {
      const cur = offers.get(p.supplierId);
      if (!cur || p.priceBottle < cur.priceBottle) offers.set(p.supplierId, p);
    }
    const prices = [...offers.values()].map((p) => p.priceBottle);
    const first = items[0];
    groups.push({
      key,
      title: items.reduce((a, b) => (b.description.length > a.description.length ? b : a)).description,
      volume: first.volume,
      abv: items.find((p) => p.abv)?.abv,
      drink: first.drink,
      offers,
      min: Math.min(...prices),
      max: Math.max(...prices),
    });
  }
  return groups;
}

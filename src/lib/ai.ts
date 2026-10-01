import { supabase } from '../backend';
import type { FieldKey, Mapping, Product } from '../types';
import { FIELD_ORDER, type Grid } from './detect';

export const aiAvailable = !!supabase;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('AI werkt alleen met de gedeelde server (inloggen).');
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (error) {
    // FunctionsHttpError carries the response; try to show the server's own message
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message && !/JSON/.test(e.message)) throw e; }
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/* ---------- column recognition ---------- */

export async function aiDetectMapping(grid: Grid): Promise<{ headerRow: number; mapping: Mapping; note: string }> {
  const rows: [number, string[]][] = [];
  for (let r = 0; r < grid.length && rows.length < 45; r++) {
    const cells = (grid[r] ?? []).slice(0, 60).map((c) => (c == null ? '' : String(c).slice(0, 40)));
    if (cells.some((c) => c.trim() !== '')) rows.push([r, cells]);
  }
  // make sure the sample includes data rows even when there is a long preamble
  const res = await call<{ headerRow: number; mapping: Record<string, number>; note?: string }>({ action: 'mapping', rows });

  const width = Math.max(...grid.slice(0, 80).map((r) => r?.length ?? 0), 1);
  const mapping: Mapping = {};
  for (const f of FIELD_ORDER) {
    const v = res.mapping?.[f];
    if (Number.isInteger(v) && v >= 0 && v < width) mapping[f as FieldKey] = v;
  }
  const headerRow = Number.isInteger(res.headerRow) && res.headerRow >= 0 && res.headerRow < grid.length ? res.headerRow : 0;
  if (mapping.description == null) throw new Error('De AI kon de productnaam-kolom niet vinden.');
  return { headerRow, mapping, note: res.note ?? '' };
}

/* ---------- smart matching ---------- */

export interface AiMatch {
  same: Product[];
  maybe: { product: Product; reason: string }[];
  note: string;
}

export async function aiMatch(
  query: string,
  candidates: Product[],
  supplierName: (id: string) => string,
  reference?: Product,
): Promise<AiMatch> {
  const list = candidates.slice(0, 80);
  const res = await call<{ same?: number[]; maybe?: { i: number; reason?: string }[]; note?: string }>({
    action: 'match',
    query,
    reference: reference
      ? { description: reference.description, extra: reference.extra, volume: reference.volume, abv: reference.abv, ean: reference.ean }
      : undefined,
    candidates: list.map((p, i) => ({
      i, leverancier: supplierName(p.supplierId), omschrijving: p.description, extra: p.extra || undefined,
      inhoud_l: p.volume, alc: p.abv, ean: p.ean || undefined,
    })),
  });
  const pick = (i: number) => (Number.isInteger(i) ? list[i] : undefined);
  const same = (res.same ?? []).map(pick).filter((p): p is Product => !!p);
  const seen = new Set(same.map((p) => p.id));
  const maybe = (res.maybe ?? [])
    .map((m) => ({ product: pick(m.i), reason: m.reason ?? '' }))
    .filter((m): m is { product: Product; reason: string } => !!m.product && !seen.has(m.product.id));
  return { same, maybe, note: res.note ?? '' };
}

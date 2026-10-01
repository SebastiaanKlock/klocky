import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { detect } from '../src/lib/detect';
import { parseGrid } from '../src/lib/importer';
import { searchProducts } from '../src/lib/search';

const files = process.argv.slice(2);
const all: any[] = [];
files.forEach((f, i) => {
  const wb = XLSX.read(readFileSync(f), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const d = detect(grid);
  const res = parseGrid(grid, d.headerRow, d.mapping);
  console.log('\n=====', f, '\nheaderRow', d.headerRow, 'mapping', JSON.stringify(d.mapping));
  console.log('parsed', res.products.length, 'skipped', res.skipped);
  const st = (k: string) => res.products.filter((p: any) => p[k] != null && p[k] !== '').length;
  console.log('with vol', st('volume'), 'abv', st('abv'), 'ean', st('ean'), 'pack', st('packSize'), 'cat', st('category'));
  console.log(res.products.slice(0, 2).map((p) => ({ ...p, search: undefined })));
  res.products.forEach((p) => all.push({ ...p, supplierId: i }));
});
for (const q of ['gin sul', 'ballantines 0.7', 'chivas 12 1l', '5029977351026']) {
  const hits = searchProducts(all, q).sort((a, b) => a.product.priceBottle - b.product.priceBottle).slice(0, 5);
  console.log('\nQ', q, hits.length);
  hits.forEach((h) => console.log(' ', h.product.supplierId, h.product.description, h.product.volume, h.product.priceBottle));
}

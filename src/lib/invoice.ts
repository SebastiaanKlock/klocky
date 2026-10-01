import type { Invoice, InvoiceLine } from '../types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const lineNet = (l: InvoiceLine) =>
  round2(l.amount != null ? l.amount : l.qty * l.unitPrice * (1 - (l.discount ?? 0) / 100));

export interface Calc {
  subtotal: number;
  discount: number;
  shipping: number;
  groups: { rate: number; net: number; vat: number }[];
  net: number;
  vat: number;
  gross: number;
  manual: boolean;
  /** invoice without any btw */
  noVat: boolean;
}

/** Totals computed from the lines, or the figures typed in by hand when `inv.manual` is set. */
export function calcInvoice(inv: Invoice, defaultVat: number): Calc {
  const mode = inv.vatMode ?? (inv.vatShifted ? 'shifted' : 'standard');
  const shifted = mode !== 'standard';
  const noVat = mode === 'none';
  const subtotal = round2(inv.lines.reduce((a, l) => a + lineNet(l), 0));
  const discount = round2(Math.min(subtotal, subtotal * ((inv.discountPct ?? 0) / 100) + (inv.discountAmount ?? 0)));
  const factor = subtotal > 0 ? 1 - discount / subtotal : 1;

  const g = new Map<number, number>();
  for (const l of inv.lines) {
    const rate = shifted ? 0 : l.vat;
    g.set(rate, (g.get(rate) ?? 0) + lineNet(l) * factor);
  }
  const shipping = round2(inv.shipping ?? 0);
  if (shipping) {
    const rate = shifted ? 0 : defaultVat;
    g.set(rate, (g.get(rate) ?? 0) + shipping);
  }
  const groups = [...g].sort((a, b) => b[0] - a[0]).map(([rate, net]) => ({ rate, net: round2(net), vat: round2(net * rate / 100) }));
  const auto = {
    net: round2(groups.reduce((a, x) => a + x.net, 0)),
    vat: round2(groups.reduce((a, x) => a + x.vat, 0)),
  };
  if (inv.manual) {
    return { subtotal, discount, shipping, groups, net: inv.manual.net, vat: noVat ? 0 : inv.manual.vat, gross: noVat ? inv.manual.net : inv.manual.gross, manual: true, noVat };
  }
  return { subtotal, discount, shipping, groups, ...auto, gross: round2(auto.net + auto.vat), manual: false, noVat };
}

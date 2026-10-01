export type FieldKey =
  | 'sku' | 'description' | 'extra' | 'category' | 'volume' | 'abv' | 'packSize'
  | 'priceBottle' | 'priceCase' | 'unit' | 'ean' | 'eanCase' | 'currency';

export type Mapping = Partial<Record<FieldKey, number>>;

export interface Supplier {
  id?: string;
  name: string;
  currency: string;
  notes?: string;
  mapping?: Mapping;
  headerSignature?: string;
  headerRow?: number;
  lastImport?: { file: string; date: string; count: number };
}

export interface Product {
  id?: string;
  supplierId: string;
  sku: string;
  description: string;
  extra: string;
  category: string;
  volume?: number;
  abv?: number;
  packSize?: number;
  priceBottle: number;
  priceCase?: number;
  currency: string;
  ean: string;
  eanCase: string;
  manual?: boolean;
  /** derived on load: unified drink category */
  drink: string;
  search: string;
}

export interface Customer {
  id?: string;
  name: string;
  address: string;
  postalCity: string;
  country: string;
  vatNumber: string;
  email: string;
  phone: string;
  notes: string;
}

export interface InvoiceLine {
  description: string;
  sku: string;
  supplierName: string;
  qty: number;
  cost: number;
  unitPrice: number;
  vat: number;
  /** line discount in % */
  discount?: number;
  /** manual line total (excl. btw); overrides qty × price */
  amount?: number;
}

export interface Invoice {
  id?: string;
  number: string;
  date: string;
  dueDays: number;
  customerId?: string;
  status: 'concept' | 'verzonden' | 'betaald';
  lines: InvoiceLine[];
  notes: string;
  reference?: string;
  deliveryAddress?: string;
  discountPct?: number;
  discountAmount?: number;
  shipping?: number;
  /** btw verlegd (reverse charge) -- legacy flag, see vatMode */
  vatShifted?: boolean;
  /** standard = normal btw per line, shifted = 0% verlegd, none = invoice without any btw */
  vatMode?: 'standard' | 'shifted' | 'none';
  vatNote?: string;
  /** sender details for this invoice only (company name etc.); falls back to the settings */
  sender?: Partial<Pick<Settings, 'company' | 'address' | 'postalCity' | 'vatNumber' | 'kvk' | 'iban' | 'email' | 'phone'>>;
  /** totals typed in by hand instead of calculated */
  manual?: { net: number; vat: number; gross: number } | null;
}

export interface Settings {
  company: string;
  address: string;
  postalCity: string;
  vatNumber: string;
  kvk: string;
  iban: string;
  email: string;
  phone: string;
  defaultMargin: number;
  defaultVat: number;
  invoicePrefix: string;
}

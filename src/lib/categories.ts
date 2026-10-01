/** One drink taxonomy across all suppliers: their own labels ("MALT WHISKY", "WH SC PURE", "Tequila", ...) are mapped onto it. */
export const DRINK_CATEGORIES = [
  'Whisky', 'Gin & Jenever', 'Wodka', 'Rum', 'Tequila & Mezcal', 'Cognac & Brandy', 'Likeur',
  'Aperitief & Bitter', 'Port, Sherry & Vermouth', 'Champagne & Mousserend', 'Wijn', 'Bier',
  'Frisdrank & Mixers', 'Water', 'Overig',
] as const;
export type DrinkCategory = (typeof DRINK_CATEGORIES)[number];

const RULES: [DrinkCategory, RegExp][] = [
  ['Champagne & Mousserend', /champagne|prosecco|\bcava\b|\bsekt\b|spumante|cremant|mousseux|sparkling wine|schaumwein|franciacorta/],
  ['Whisky', /whisk|scotch|bourbon|\bwh\b|\bmalt\b|singlemalt|tennessee|\brye\b|blended/],
  ['Gin & Jenever', /\bgin\b|genever|jenever|sloe/],
  ['Wodka', /vodka|wodka/],
  ['Rum', /\brum\b|rhum|cachaca|\bron\b/],
  ['Tequila & Mezcal', /tequila|mezcal|sotol|pisco/],
  ['Cognac & Brandy', /cognac|brandy|armagnac|calvados|grappa|weinbrand|obstbrand|eau de vie|\bmarc\b|metaxa/],
  ['Port, Sherry & Vermouth', /\bport\b|porto|sherry|madeira|marsala|vermouth|vermut/],
  ['Aperitief & Bitter', /aperitif|aperitief|aperol|campari|bitter|amaro|pastis|ouzo|raki|absinth|anis\b|sambuca/],
  ['Likeur', /liqueur|likeur|likor|licor|liquore|cream|amaretto|baileys|jagermeister|krauter|schnaps|cr[eè]me de|triple sec|limoncello|advocaat|spirit drink|spirituose/],
  ['Wijn', /\bwine\b|\bwein\b|\bwijn\b|\bvin\b|vino|rouge|blanc|rose\b|chardonnay|merlot|cabernet|sauvignon|pinot|riesling/],
  ['Bier', /\bbeer\b|\bbier\b|lager|\bipa\b|\bale\b|stout|pils|radler|weizen|cider/],
  ['Water', /\bwater\b|mineral|spa\b|evian|perrier|sparkling water/],
  ['Frisdrank & Mixers', /tonic|soda|cola|limonade|lemonade|juice|\bsap\b|ginger|mixer|soft|energy|red bull|redbull|syrup|siroop|ice tea|iced tea|fruit/],
];

const clean = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`´]/g, '').replace(/[^a-z0-9% ]+/g, ' ');

/** Supplier's own category label first (most reliable), the product name as fallback. */
export function classifyDrink(category: string, description: string): DrinkCategory {
  const c = clean(category).trim();
  const generic = !c || /^(liquor|liquors|spirit|spirits|spirituosen|alcohol|alcoholic|drinks?|dranken|diverse|diversen|other|others|misc|miscellaneous|overig|various|sonstige)$/.test(c);
  if (!generic) for (const [name, re] of RULES) if (re.test(c)) return name;
  const d = clean(description);
  for (const [name, re] of RULES) if (re.test(d)) return name;
  if (/liquor|liqueur|likeur/.test(c)) return 'Likeur';
  return 'Overig';
}

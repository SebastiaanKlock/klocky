// Supabase Edge Function "ai": laat Claude kolommen van prijslijsten herkennen en producten matchen.
// Vereist het secret ANTHROPIC_API_KEY. "Verify JWT" blijft aan: alleen ingelogde gebruikers kunnen dit aanroepen.

const API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL_MAP = Deno.env.get('AI_MODEL_MAPPING') ?? 'claude-sonnet-5-5';
const MODEL_MATCH = Deno.env.get('AI_MODEL_MATCH') ?? 'claude-sonnet-5-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function claude(model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Anthropic fout ${res.status}`);
  return (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Geen geldig antwoord van de AI.');
  return JSON.parse(text.slice(start, end + 1));
}

const MAPPING_SYSTEM = `Je analyseert prijslijsten van groothandels in dranken (Excel-export, elke leverancier anders).
Je krijgt de eerste rijen van een werkblad als lijst van [rijnummer, [cellen per kolom]] (kolomindex begint bij 0).
Bepaal de koprij en welke kolom welk veld is. Velden:
- description: productnaam (verplicht)
- extra: tweede omschrijving zonder eigen kop naast de naam (bv. "40,00% 0,70Ltr Flasche"), optioneel
- sku: artikelnummer
- category: categorie/groep
- volume: inhoud per fles (liter/cl)
- abv: alcoholpercentage
- packSize: aantal flessen per doos
- priceBottle: prijs per fles (of per eenheid)
- priceCase: prijs per doos
- unit: eenheid-kolom (FLASCHE/LITER/...) als de prijs per liter kan zijn
- ean: EAN/barcode van de fles
- eanCase: EAN van de doos
- currency: valuta
Gebruik alleen kolommen die echt aanwezig zijn. Antwoord ALLEEN met JSON:
{"headerRow": <rijnummer van de koprij>, "mapping": {"description": <kolomindex>, ...}, "note": "<korte uitleg in het Nederlands>"}`;

const MATCH_SYSTEM = `Je helpt een drankgroothandel prijzen van leveranciers te vergelijken.
Je krijgt een zoekopdracht (of referentieproduct) en een lijst kandidaten uit verschillende prijslijsten, elk met index i.
Bepaal welke kandidaten EXACT hetzelfde product zijn als gevraagd: zelfde merk, variant/expressie, leeftijd (12 jaar, XO, ...), alcoholpercentage en flesinhoud.
Namen verschillen per leverancier (afkortingen, talen, "Years"/"Y"/"Jahre", volgorde, "+GB" = geschenkverpakking, hoofdletters, apostrofs). Dat telt niet als verschil.
Een andere inhoud of een duidelijk andere variant is NIET hetzelfde. Geschenkverpakking/tin ("+GB", "Giftbox") is wel hetzelfde product maar zet het in "maybe" met een korte reden.
Antwoord ALLEEN met JSON:
{"same": [<i>...], "maybe": [{"i": <i>, "reason": "<kort, Nederlands>"}], "note": "<optioneel, kort>"}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!API_KEY) return json({ error: 'ANTHROPIC_API_KEY is nog niet ingesteld in Supabase (Edge Functions → Secrets).' }, 500);

  try {
    const body = await req.json();

    if (body.action === 'mapping') {
      const rows = JSON.stringify(body.rows).slice(0, 60000);
      const out = await claude(MODEL_MAP, MAPPING_SYSTEM, rows, 1500);
      return json(extractJson(out));
    }

    if (body.action === 'match') {
      const payload = JSON.stringify({ zoekopdracht: body.query, referentie: body.reference ?? null, kandidaten: body.candidates }).slice(0, 80000);
      const out = await claude(MODEL_MATCH, MATCH_SYSTEM, payload, 2500);
      return json(extractJson(out));
    }

    return json({ error: 'Onbekende actie' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

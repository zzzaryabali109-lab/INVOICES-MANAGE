import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: 'No file data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `You are a Bill of Lading (BL) and Invoice document parser AND a logistics goods classifier. Extract all data from the document.

Look for weight keywords: "KGS", "KG", "WEIGHT", "GROSS WEIGHT", "G.Weight", "GROSS WT".
Look for bales/packages: "BALES", "PKGS", "No. & Kind of Pkgs".

Extract ALL of these fields:
- Shipper name and full address
- Consignee name and full address
- Notify Party name and full address
- Port of Loading (ONLY the loading port/location, e.g. "NEWARK, NJ")
- Port of Discharge / Destination
- Description of goods
- Number of bales/packages
- Container number(s)
- Container size (e.g. "1X 40' HC")
- BL number or Invoice number
- Vessel name (ONLY the vessel/ship name, e.g. "MAERSK DENVER", "CMA CGM CONGO")
- Voyage number (ONLY the voyage/reference code, e.g. "632E", "0INN0E1MA")
- HS Code
- Shipping Marks
- Date on the BL document

CRITICAL INSTRUCTION ON VESSEL, VOYAGE, AND PORT OF LOADING:
1. VESSEL ("vessel_name"):
   - The entire value appearing under or associated with the BL label "VESSEL AND VOYAGE NUMBER" (or "VESSEL / VOYAGE", "OCEAN VESSEL / VOYAGE") MUST be preserved as the vessel_name value (e.g. "MAERSK DENVER 632E", "CMA CGM CONGO / 0INN0E1MA", "MSC ILONA 241A").
   - DO NOT remove the voyage/reference portion (e.g. "632E").
   - DO NOT treat the voyage number as irrelevant or truncate Vessel to just the first words (e.g., do NOT truncate "MAERSK DENVER 632E" to "MAERSK DENVER").
   - DO NOT merge "NEWARK, NJ" or Port of Loading into Vessel.
   - If the BL shows "VESSEL AND VOYAGE NUMBER: MAERSK DENVER 632E", then vessel_name = "MAERSK DENVER 632E".
2. PORT OF LOADING ("port_of_loading"):
   - Contains ONLY the loading port/location (e.g. "NEWARK, NJ", "SAVANNAH, GA", "ROTTERDAM, NETHERLANDS").
   - Must remain completely separate from Vessel.
   - NEVER append Port of Loading to the Vessel field.
   - Preserve the complete Port of Loading exactly as shown, including city/state/country where present.
3. VOYAGE ("voyage"):
   - Contains the voyage/reference value (e.g. "632E", "0INN0E1MA", "0123-045W", "241A").
   - Note: vessel_name still preserves the complete text including the voyage reference ("MAERSK DENVER 632E").

CRITICAL RULES FOR ADJACENT OR SAME-LINE FIELDS:
- Example: If the BL contains "VESSEL AND VOYAGE NUMBER: MAERSK DENVER 632E" and "PORT OF LOADING: NEWARK, NJ", extract:
  vessel_name: "MAERSK DENVER 632E"
  port_of_loading: "NEWARK, NJ"
  voyage: "632E"
- Use layout-aware, field-aware document understanding. Identify the text belonging to each labeled field based on the actual BL layout.
- If Vessel, Voyage, and Port of Loading appear on the same line (e.g. "MAERSK DENVER 632E NEWARK, NJ"), extract:
  vessel_name: "MAERSK DENVER 632E"
  port_of_loading: "NEWARK, NJ"
  voyage: "632E"
- Use the BL's actual field labels, layout, and spatial relationships to determine which text belongs to which field.
- If Vessel, Voyage, and Port of Loading appear on the same line, intelligently split them according to the BL's field structure.
- Do not merge adjacent fields simply because they appear on the same line.
- If the value is multiline, merge only the lines belonging to that specific field.
- Validate the extracted values before outputting.

SEMANTIC GOODS CLASSIFICATION & ACCURATE BL EXTRACTION (CRITICAL):
Act as an experienced customs and logistics document parser.
CRITICAL INSTRUCTION ON GOODS DESCRIPTION & COMMODITY NOMENCLATURE:
1. "description": Extract the clean goods description accurately from the document.
- Strip boilerplate prefixes like "SAID TO CONTAIN", "STC", container counts (e.g. "1X40 HC"), or "SHIPPER'S LOAD, STOW & COUNT".
- BUT DO NOT ALTER OR CHANGE THE COMMODITY WORDING!
- If the BL says "USED CLOTHING", keep it EXACTLY as "USED CLOTHING". NEVER prepend "MIX" or "MIXED" unless the words "MIX" or "MIXED" are explicitly printed on the document!
- Only use "MIX USED CLOTHING" if the document actually contains "MIX" or "MIXED".
- Matching the exact BL description is mandatory for customs clearance and invoice accuracy.

2. PRODUCT CATEGORIES (product_groups):
Identify EVERY individual product category present in the goods description:
- If document has "USED CLOTHING" (without MIX) -> name: "USED CLOTHING", hs_code: "6309.1010"
- If document has "MIX USED CLOTHING" or "MIXED USED CLOTHING" -> name: "MIX USED CLOTHING", hs_code: "6309.1010"
- If document has footwear/shoes -> name: "USED SHOES", hs_code: "6309.1020"
- If document has worn articles/used textiles -> name: "OTHER WORN ARTICLES", hs_code: "6309.1090"

Combined descriptions examples:
- "USED CLOTHING" -> description: "USED CLOTHING", product_groups: [{ "name": "USED CLOTHING", "hs_code": "6309.1010" }]
- "MIX USED CLOTHING" -> description: "MIX USED CLOTHING", product_groups: [{ "name": "MIX USED CLOTHING", "hs_code": "6309.1010" }]
- "USED CLOTHING, SHOES & OTHER WORN ARTICLES" -> description: "USED CLOTHING, SHOES & OTHER WORN ARTICLES", product_groups: [{ "name": "USED CLOTHING", "hs_code": "6309.1010" }, { "name": "USED SHOES", "hs_code": "6309.1020" }, { "name": "OTHER WORN ARTICLES", "hs_code": "6309.1090" }]
- "USED CLOTHING / SHOES" -> product_groups: [{ "name": "USED CLOTHING", "hs_code": "6309.1010" }, { "name": "USED SHOES", "hs_code": "6309.1020" }]

ACCURATE DATA EXTRACTION:
- Extract KGS with 100% precision from gross weight / total weight markings.
- Extract all container numbers matching ISO standards (4 letters + 7 digits, e.g. TGHU1234567).
- Extract bales/packages accurately (count and type).
- Extract BL number, Vessel/Voyage, POL, POD, Shipper, Consignee, Notify Party.
- Never hallucinate or invent text that is not in the document.

Return ONLY a JSON object (no markdown, no code blocks) with this exact structure:
{
  "kgs": <number or null>,
  "shipper": "<string or null>",
  "shipper_address": "<full address string or null>",
  "consignee": "<string or null>",
  "consignee_address": "<full address string or null>",
  "notify_party": "<string or null>",
  "notify_party_address": "<full address string or null>",
  "port_of_loading": "<string or null>",
  "port_of_discharge": "<string or null>",
  "description": "<string or null>",
  "product_groups": [ { "name": "<canonical category name, uppercase>", "hs_code": "<string or null>", "confidence": <number 0-1> } ],
  "packages": "<string or null>",
  "bales": <number or null>,
  "container_numbers": ["<string>"],
  "container_size": "<string or null>",
  "bl_number": "<string or null>",
  "vessel_name": "<complete value under VESSEL AND VOYAGE NUMBER, e.g. 'MAERSK DENVER 632E' or null>",
  "voyage": "<voyage/reference code e.g. '632E' or null>",
  "port_of_loading": "<loading port/location ONLY, e.g. 'NEWARK, NJ' or null>",
  "hs_code": "<string or null>",
  "shipping_marks": "<string or null>",
  "bl_date": "<date string as found on document, e.g. '15-03-2025' or null>",
  "raw_weight_text": "<the exact text where weight was found>"
}

If KGS cannot be found, set kgs to null. For bales, extract the number only (e.g. from "32 BALES" extract 32).
product_groups MUST always contain at least one item derived from the goods description.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${fileBase64}`
            }
          },
          {
            type: 'text',
            text: 'Extract all details from this Bill of Lading / Invoice document.'
          }
        ]
      }
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      console.error('Failed to parse AI response:', content);
      parsed = { kgs: null, raw_weight_text: content };
    }

    // Preserve the complete value from "VESSEL AND VOYAGE NUMBER" and strictly isolate Port of Loading
    if (parsed && typeof parsed === 'object') {
      const rawVessel = typeof parsed.vessel_name === 'string' ? parsed.vessel_name : '';
      const rawPol = typeof parsed.port_of_loading === 'string' ? parsed.port_of_loading : '';
      const rawVoy = typeof parsed.voyage === 'string' ? parsed.voyage : '';

      const separated = splitVesselVoyagePol(rawVessel, rawPol);
      let finalVessel = separated.vessel || rawVessel || null;
      const finalVoyage = cleanVoyageValue(rawVoy || separated.voyage) || null;
      const finalPol = cleanPortOfLoading(rawPol || separated.port_of_loading) || null;

      // CRITICAL: Ensure Vessel preserves the complete text including the voyage number
      if (finalVoyage && finalVessel && !finalVessel.toUpperCase().includes(finalVoyage.toUpperCase())) {
        finalVessel = `${finalVessel} ${finalVoyage}`.trim();
      }

      parsed.vessel_name = finalVessel;
      parsed.voyage = finalVoyage;
      parsed.port_of_loading = finalPol;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in extract-bl-data:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function cleanVoyageValue(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^(?:VOYAGE(?:\s*(?:NO|NUMBER|#))?|VOY(?:\.|\b)(?:\s*(?:NO|NUMBER|#))?|V\.)\s*[:.-]?\s*/i, '')
    .replace(/^[\/\s:.-]+/, '')
    .replace(/[\/\s:.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPortOfLoading(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^(?:PORT\s+OF\s+LOADING|POL\b|LOADING\s+PORT)\s*[:.-]?\s*/i, '')
    .replace(/^[:.-]+\s*/, '')
    .replace(/[\/\s,.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitVesselVoyagePol(
  input?: string | null,
  existingPol?: string | null
): { vessel: string; voyage: string; port_of_loading: string } {
  if (!input) {
    return {
      vessel: '',
      voyage: '',
      port_of_loading: cleanPortOfLoading(existingPol),
    };
  }

  let raw = input.replace(/\r\n/g, '\n').trim();
  let vessel = '';
  let voyage = '';
  let pol = cleanPortOfLoading(existingPol);

  // Strip leading field labels
  raw = raw.replace(
    /^(?:(?:OCEAN|FEEDER|EXPORT)\s+)?VESSEL(?:\s+NAME)?(?:\s*(?:\/|\s*AND\s*|\s*&\s*)\s*(?:VOYAGE|VOY(?:\.|\b)|FLIGHT)?(?:\s*(?:NO|NUMBER|ID)\.?)?)?\s*[:.-]?\s*/i,
    ''
  );

  // 1. Explicit Port of Loading label
  const polLabelMatch = raw.match(/\b(?:PORT\s+OF\s+LOADING|POL\b|LOADING\s+PORT)\s*[:.-]\s*([\s\S]+)$/i);
  if (polLabelMatch) {
    if (!pol) pol = cleanPortOfLoading(polLabelMatch[1]);
    raw = raw.slice(0, polLabelMatch.index).trim();
  }

  // 2. Explicit Voyage label
  const voyLabelMatch = raw.match(
    /\b(?:VOYAGE(?:\s*(?:NO|NUMBER|#))?|VOY(?:\.|\b)(?:\s*(?:NO|NUMBER|#))?|V\.)\s*[:.-]?\s*([A-Za-z0-9._-]+)([\s\S]*)$/i
  );
  if (voyLabelMatch) {
    voyage = voyLabelMatch[1].trim();
    const remaining = voyLabelMatch[2].trim();
    const beforeVoy = raw.slice(0, voyLabelMatch.index).trim();
    if (!pol && remaining) {
      pol = cleanPortOfLoading(remaining.replace(/^[\/\s,.-]+/, ''));
    }
    vessel = beforeVoy ? `${beforeVoy} ${voyage}`.trim() : voyage;
    return buildCleanResult(vessel, voyage, pol);
  }

  // 3. Slash separated
  if (raw.includes('/')) {
    const slashParts = raw.split('/').map((p) => p.trim()).filter(Boolean);
    if (slashParts.length >= 2) {
      if (!pol && (slashParts.length >= 3 || /(?:,\s*[A-Z]{2}\b|PORT|POL)/i.test(slashParts[slashParts.length - 1]))) {
        pol = cleanPortOfLoading(slashParts[slashParts.length - 1]);
        slashParts.pop();
      }
      vessel = slashParts.join(' / ');
      const lastToken = slashParts[slashParts.length - 1];
      const voyMatch = lastToken.match(/^([A-Za-z0-9._-]+)$/);
      if (voyMatch) voyage = voyMatch[1];
      return buildCleanResult(vessel, voyage, pol);
    }
  }

  // 4. Multiline input
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    if (!pol && /(?:,\s*[A-Z]{2}\b|,\s*[A-Za-z]+|\bPORT\b)/i.test(lines[lines.length - 1])) {
      pol = cleanPortOfLoading(lines.pop()!);
    }
    if (lines.length >= 2 && (/^[0-9]+[A-Za-z0-9_-]*$/.test(lines[lines.length - 1]) || /^(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{2,10}$/.test(lines[lines.length - 1]))) {
      voyage = lines[lines.length - 1];
      vessel = lines.join(' ');
      return buildCleanResult(vessel, voyage, pol);
    } else {
      vessel = lines.join(' ');
      return buildCleanResult(vessel, voyage, pol);
    }
  }

  // 5. Strip known POL from raw
  if (pol) {
    const polUpper = pol.toUpperCase();
    const rawUpper = raw.toUpperCase();
    const polIdx = rawUpper.lastIndexOf(polUpper);
    if (polIdx > 0) {
      raw = raw.slice(0, polIdx).replace(/[\/\s,.-]+$/, '').trim();
    }
  }

  // 6. Location pattern at end (e.g. "NEWARK, NJ")
  const locMatch = raw.match(/,\s*[A-Za-z]{2,}(?:\s+[A-Za-z]+)*$/i);
  if (locMatch && !pol) {
    const commaPos = locMatch.index!;
    const beforeComma = raw.slice(0, commaPos).trim();
    const cityMatch = beforeComma.match(/(?:\s+|^)([A-Za-z.\s'-]+)$/);
    if (cityMatch) {
      const city = cityMatch[1].trim();
      const cityStart = beforeComma.lastIndexOf(city);
      pol = cleanPortOfLoading(raw.slice(cityStart));
      raw = raw.slice(0, cityStart).replace(/[\/\s,.-]+$/, '').trim();
    }
  }

  // 7. Voyage token detection (preserve full text in vessel)
  const voyagePattern = /\b([0-9]+[A-Za-z0-9_-]*[A-Za-z]+[0-9A-Za-z_-]*|[0-9]{3,7}(?:-[0-9A-Za-z]+)?|[A-Za-z]+[0-9]{2,}[A-Za-z0-9_-]*|[0-9]{1,4}[NSEW])\b/g;
  const matches: Array<{ token: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = voyagePattern.exec(raw)) !== null) {
    const tok = m[1].toUpperCase();
    if (!['40HC', '20GP', '40GP', '45HC', 'KGS', 'LBS'].includes(tok)) {
      matches.push({ token: m[1], index: m.index });
    }
  }

  if (matches.length > 0) {
    const voy = matches[0];
    voyage = voy.token;
    const after = raw.slice(voy.index + voy.token.length).trim();
    if (!pol && after) {
      pol = cleanPortOfLoading(after);
    }
    // CRITICAL: Vessel MUST preserve the entire value including voyage number
    vessel = raw.slice(0, voy.index + voy.token.length).trim();
    return buildCleanResult(vessel, voyage, pol);
  }

  vessel = raw;
  return buildCleanResult(vessel, voyage, pol);
}

function buildCleanResult(
  v: string,
  voy: string,
  pol: string
): { vessel: string; voyage: string; port_of_loading: string } {
  let cleanVessel = (v || '')
    .replace(/^(?:(?:OCEAN|FEEDER|EXPORT)\s+)?(?:VESSEL(?:\s+NAME)?|SHIP(?:\s+NAME)?)(?:\s*(?:\/|\s*AND\s*|\s*&\s*)\s*(?:VOYAGE|VOY(?:\.|\b)|FLIGHT)?(?:\s*(?:NO|NUMBER|ID)\.?)?)?\s*[:.-]?\s*/i, '')
    .replace(/^[:.-]+/, '')
    .replace(/[\/\s,.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanPol = cleanPortOfLoading(pol);

  if (cleanPol && cleanVessel.toLowerCase().includes(cleanPol.toLowerCase())) {
    cleanVessel = cleanVessel
      .replace(new RegExp(`(?:\\s*[/,-]?\\s*)?\\b${cleanPol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  const cleanVoy = cleanVoyageValue(voy);

  return { vessel: cleanVessel, voyage: cleanVoy, port_of_loading: cleanPol };
}

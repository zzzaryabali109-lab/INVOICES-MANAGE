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
- Port of Loading
- Port of Discharge / Destination
- Description of goods
- Number of bales/packages
- Container number(s)
- Container size (e.g. "1X 40' HC")
- BL number or Invoice number
- Vessel / Flight name
- HS Code
- Shipping Marks
- Date on the BL document

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
  "vessel_name": "<string or null>",
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

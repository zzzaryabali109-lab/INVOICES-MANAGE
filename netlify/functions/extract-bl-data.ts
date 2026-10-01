const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { rawPdfText } = body || {};
    const text = String(rawPdfText || '');

    // Container numbers
    const containerMatches = text.match(/\b([A-Z]{4}\s*\d{7})\b/g) || [];
    const containerSet = new Set<string>();
    for (const c of containerMatches) {
      const clean = c.replace(/\s+/g, '').toUpperCase();
      if (/^[A-Z]{4}\d{7}$/.test(clean)) {
        containerSet.add(clean);
      }
    }
    const container_numbers = Array.from(containerSet);

    // Gross Weight (KGS)
    let kgs: number | null = null;
    let raw_weight_text: string | null = null;
    const weightPatterns = [
      /(?:GROSS\s*(?:WEIGHT|WT|MASS)|G\.?W\.?|TOTAL\s*GROSS\s*WEIGHT)\s*[:.-]?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:KGS?|KILOS?|KG)?/i,
      /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:KGS?|KILOGRAMS?|KILOS?)\b/i,
      /(?:WEIGHT|WT)\s*[:.-]?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:KGS?|KG)?/i,
    ];
    for (const pattern of weightPatterns) {
      const m = text.match(pattern);
      if (m && m[1]) {
        const parsed = parseFloat(m[1].replace(/[\s,]/g, ''));
        if (!isNaN(parsed) && parsed > 50 && parsed < 100000) {
          kgs = parsed;
          raw_weight_text = m[0].trim();
          break;
        }
      }
    }

    // BL Number
    let bl_number: string | null = null;
    const blPatterns = [
      /(?:B\/?L\s*(?:NO\.?|NUMBER|#)?|BILL\s+OF\s+LADING\s*(?:NO\.?|NUMBER|#)?)\s*[:.-]?\s*([A-Z0-9\-_/]{6,30})/i,
      /\b(MEDU[A-Z0-9]{6,16}|MSCU[A-Z0-9]{6,16}|MAEU[A-Z0-9]{6,16}|HLCU[A-Z0-9]{6,16}|CMAU[A-Z0-9]{6,16}|ONEY[A-Z0-9]{6,16}|COSU[A-Z0-9]{6,16})\b/i,
    ];
    for (const pattern of blPatterns) {
      const m = text.match(pattern);
      if (m && m[1]) {
        bl_number = m[1].trim();
        break;
      }
    }

    const hasMix = /\bMIX(?:ED)?\s+USED\s+CLOTHING\b/i.test(text);
    const description = hasMix ? 'MIX USED CLOTHING' : 'USED CLOTHING';

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          kgs,
          raw_weight_text,
          container_numbers,
          container_size: container_numbers.length > 0 ? "1X 40' HC" : null,
          bl_number,
          description,
          product_groups: [{ name: description, hs_code: '6309.1010', confidence: 0.95 }],
          raw_text: text,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          kgs: null,
          container_numbers: [],
          container_size: "1X 40' HC",
          bl_number: null,
          description: 'USED CLOTHING',
          product_groups: [{ name: 'USED CLOTHING', hs_code: '6309.1010' }],
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

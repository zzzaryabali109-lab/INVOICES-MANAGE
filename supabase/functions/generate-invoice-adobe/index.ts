// Adobe Document Generation: merges BL data into a Word template -> PDF
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { unzipSync, strFromU8 } from 'npm:fflate@0.8.2';
import { INVOICE_TEMPLATE_BASE64 } from './template.ts';

/**
 * Pre-scan a DOCX template for every {{...}} placeholder.
 * Word often splits a placeholder across multiple runs, so XML tags are
 * stripped from the text parts before matching.
 */
function scanTemplatePlaceholders(docxBytes: Uint8Array): string[] {
  const found = new Set<string>();
  try {
    const files = unzipSync(docxBytes);
    for (const [name, bytes] of Object.entries(files)) {
      if (!/^word\/.*\.xml$/.test(name)) continue;
      const xml = strFromU8(bytes as Uint8Array);
      // keep only text, dropping run/formatting tags that break placeholders
      const text = xml.replace(/<[^>]+>/g, '');
      for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        const tag = m[1].trim();
        if (tag) found.add(tag);
      }
    }
  } catch (e) {
    console.error('Template pre-scan failed:', e);
  }
  return Array.from(found).sort();
}


const ADOBE_HOST = 'https://pdf-services-ue1.adobe.io';
const ADOBE_TOKEN_URL = 'https://pdf-services-ue1.adobe.io/token';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(s);
}

function withTagAliases(baseTags: Record<string, string>): Record<string, string> {
  const tags: Record<string, string> = { ...baseTags };

  const separators = ['_', ' ', '  ', '\u00A0'.replace('\\u00A0', '\u00A0'), `${'\u00A0'.replace('\\u00A0', '\u00A0')} `, ` ${'\u00A0'.replace('\\u00A0', '\u00A0')}`, ` ${'\u00A0'.replace('\\u00A0', '\u00A0')} `, '-'];

  for (const [key, value] of Object.entries(baseTags)) {
    tags[key] = value;

    if (!key.includes('_')) continue;

    const parts = key.split('_').filter(Boolean);
    if (parts.length < 2) continue;

    for (const separator of separators) {
      tags[parts.join(separator)] = value;
    }

    tags[key.replace(/_/g, '')] = value;
  }

  return tags;
}

async function getAdobeToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(ADOBE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`Adobe token failed [${r.status}]: ${await r.text()}`);
  const j = await r.json();
  return j.access_token as string;
}

async function uploadAsset(token: string, clientId: string, bytes: Uint8Array, mediaType: string): Promise<string> {
  // Step 1: get presigned URL + assetID
  const pre = await fetch(`${ADOBE_HOST}/assets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-API-Key': clientId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mediaType }),
  });
  if (!pre.ok) throw new Error(`Adobe presign failed [${pre.status}]: ${await pre.text()}`);
  const { uploadUri, assetID } = await pre.json();
  // Step 2: PUT bytes to presigned URL
  const up = await fetch(uploadUri, {
    method: 'PUT',
    headers: { 'Content-Type': mediaType },
    body: bytes,
  });
  if (!up.ok) throw new Error(`Adobe asset PUT failed [${up.status}]: ${await up.text()}`);
  return assetID as string;
}

async function pollJob(token: string, clientId: string, location: string, timeoutMs = 90_000): Promise<unknown> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(location, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-API-Key': clientId },
    });
    if (!r.ok) throw new Error(`Adobe poll failed [${r.status}]: ${await r.text()}`);
    const j = await r.json();
    const status = j.status;
    if (status === 'done') return j;
    if (status === 'failed') throw new Error(`Adobe job failed: ${JSON.stringify(j)}`);
  }
  throw new Error('Adobe job timed out');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ADOBE_CLIENT_ID = Deno.env.get('ADOBE_CLIENT_ID');
    const ADOBE_CLIENT_SECRET = Deno.env.get('ADOBE_CLIENT_SECRET');
    if (!ADOBE_CLIENT_ID || !ADOBE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'Adobe credentials not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const data = payload?.data ?? {};

    // Normalize tag values to strings
    const baseTags: Record<string, string> = {
      invoice_number: String(data.invoice_number ?? ''),
      date: String(data.date ?? ''),
      shipper: String(data.shipper ?? ''),
      shipper_address: String(data.shipper_address ?? ''),
      consignee: String(data.consignee ?? ''),
      consignee_address: String(data.consignee_address ?? ''),
      notify_party: String(data.notify_party ?? ''),
      notify_party_address: String(data.notify_party_address ?? ''),
      container_size: String(data.container_size ?? ''),
      container_numbers: String(data.container_numbers ?? ''),
      container_numbers_one: String(data.container_numbers_one ?? data.container_numbers ?? ''),
      vessel: String(data.vessel ?? ''),
      port_of_loading: String(data.port_of_loading ?? ''),
      port_of_discharge: String(data.port_of_discharge ?? ''),
      hs_code: String(data.hs_code ?? ''),
      goods_description: String(data.goods_description ?? ''),
      goods_description_1: String(data.goods_description_1 ?? ''),
      goods_description_2: String(data.goods_description_2 ?? ''),
      goods_description_3: String(data.goods_description_3 ?? ''),
      goods_description_4: String(data.goods_description_4 ?? ''),
      goods_description_5: String(data.goods_description_5 ?? ''),
      goods_description_6: String(data.goods_description_6 ?? ''),
      goods_description_7: String(data.goods_description_7 ?? ''),
      goods_description_8: String(data.goods_description_8 ?? ''),
      gross_weight: String(data.gross_weight ?? ''),
      unit_price: String(data.unit_price ?? ''),
      amount: String(data.amount ?? ''),
      shipping_marks: String(data.shipping_marks ?? ''),
      packages: String(data.packages ?? ''),
      company_name: String(data.company_name ?? ''),
      // Optional extras available from the BL (blank if not extracted)
      bl_number: String(data.bl_number ?? ''),
      seal_number: String(data.seal_number ?? ''),
      net_weight: String(data.net_weight ?? ''),
      voyage: String(data.voyage ?? ''),
      place_of_receipt: String(data.place_of_receipt ?? ''),
      final_destination: String(data.final_destination ?? ''),

    };
    const tags = withTagAliases(baseTags);

    const token = await getAdobeToken(ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET);

    // User-uploaded DOCX template (preferred), else fallback to built-in
    const userTemplateB64: string | undefined = payload?.templateBase64;
    const templateBytes = userTemplateB64 ? b64ToBytes(userTemplateB64) : b64ToBytes(INVOICE_TEMPLATE_BASE64);

    // Pre-scan: list every {{...}} placeholder and warn about unmapped ones
    const placeholders = scanTemplatePlaceholders(templateBytes);
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mappedKeys = new Set(Object.keys(tags).map(normalize));
    const missingPlaceholders = placeholders.filter((p) => !mappedKeys.has(normalize(p)));
    console.log(`Template placeholders (${placeholders.length}):`, placeholders.join(', '));
    if (missingPlaceholders.length) {
      console.warn(
        `Missing in mapped invoice data (${missingPlaceholders.length}):`,
        missingPlaceholders.join(', '),
      );
    }

    const templateAssetID = await uploadAsset(
      token,
      ADOBE_CLIENT_ID,
      templateBytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );


    // Submit Document Generation job
    const jobRes = await fetch(`${ADOBE_HOST}/operation/documentgeneration`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-API-Key': ADOBE_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetID: templateAssetID,
        outputFormat: 'pdf',
        jsonDataForMerge: tags,
      }),
    });
    if (jobRes.status !== 201) {
      throw new Error(`Adobe job create failed [${jobRes.status}]: ${await jobRes.text()}`);
    }
    const location = jobRes.headers.get('location');
    if (!location) throw new Error('Adobe job: no location header');

    const result = await pollJob(token, ADOBE_CLIENT_ID, location) as {
      asset?: { downloadUri?: string };
    };
    const downloadUri = result?.asset?.downloadUri;
    if (!downloadUri) throw new Error(`Adobe job done but no downloadUri: ${JSON.stringify(result)}`);

    const pdfRes = await fetch(downloadUri);
    if (!pdfRes.ok) throw new Error(`Adobe download failed [${pdfRes.status}]`);
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    const pdfBase64 = bytesToB64(pdfBytes);

    return new Response(JSON.stringify({ success: true, pdfBase64, placeholders, missingPlaceholders }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-invoice-adobe error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

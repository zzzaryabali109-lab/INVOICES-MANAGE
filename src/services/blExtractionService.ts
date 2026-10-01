import { supabase } from '@/integrations/supabase/client';
import { ExtractedBLResult, parseBlText } from '@/lib/pdfBlExtractor';

export async function extractBlDataWithFallback(params: {
  fileBase64?: string;
  mimeType?: string;
  rawPdfText?: string;
  localExtracted?: ExtractedBLResult | null;
  fileName?: string;
}): Promise<ExtractedBLResult> {
  const { fileBase64, mimeType, rawPdfText, localExtracted, fileName } = params;

  // 1. If local extraction already has solid data, prepare base
  let result: ExtractedBLResult = localExtracted || {
    kgs: null,
    raw_weight_text: null,
    packages: null,
    bales: null,
    container_numbers: [],
    container_size: "1X 40' HC",
    bl_number: null,
    vessel_name: null,
    voyage: null,
    port_of_loading: null,
    port_of_discharge: null,
    shipper: null,
    shipper_address: null,
    consignee: null,
    consignee_address: null,
    notify_party: null,
    notify_party_address: null,
    description: 'USED CLOTHING',
    hs_code: '6309.1010',
    shipping_marks: null,
    bl_date: null,
    product_groups: [{ name: 'USED CLOTHING', hs_code: '6309.1010', confidence: 0.95 }],
    raw_text: rawPdfText || '',
  };

  // Try server API route first (/api/extract-bl-data)
  if (fileBase64) {
    try {
      const response = await fetch('/api/extract-bl-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mimeType: mimeType || 'application/pdf',
          rawPdfText: rawPdfText || '',
          fileName: fileName || '',
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json && json.success && json.data) {
          result = mergeBlResults(result, json.data);
          return result;
        } else if (json && json.data && !json.error) {
          result = mergeBlResults(result, json.data);
          return result;
        }
      }
    } catch (backendErr) {
      console.warn('[BL Extraction] Backend API route warning, proceeding with fallback:', backendErr);
    }

    // 2. Parse raw text locally with robust engine
    if (rawPdfText && rawPdfText.trim().length > 0) {
      try {
        const textParsed = parseBlText(rawPdfText);
        result = mergeBlResults(result, textParsed);
        return result;
      } catch (parseErr) {
        console.warn('[BL Extraction] Local text parser warning:', parseErr);
      }
    }
  }

  // 3. Fallback: Parse raw text if not yet parsed
  if ((!result.container_numbers.length || !result.kgs) && rawPdfText && rawPdfText.trim().length > 0) {
    try {
      const textParsed = parseBlText(rawPdfText);
      result = mergeBlResults(result, textParsed);
    } catch (parseErr) {
      console.warn('[BL Extraction] Text parser warning:', parseErr);
    }
  }

  // Final sanity defaults: Ensure container numbers array exists and product groups has at least 1 item
  if (!Array.isArray(result.container_numbers)) {
    result.container_numbers = [];
  }
  if (!result.product_groups || result.product_groups.length === 0) {
    const desc = result.description || 'USED CLOTHING';
    result.product_groups = [{ name: desc.toUpperCase(), hs_code: result.hs_code || '6309.1010', confidence: 0.9 }];
  }

  return result;
}

function mergeBlResults(base: ExtractedBLResult, incoming: any): ExtractedBLResult {
  if (!incoming || typeof incoming !== 'object') return base;

  const mergedContainers = Array.from(
    new Set([
      ...(Array.isArray(incoming.container_numbers) ? incoming.container_numbers : []),
      ...(base.container_numbers || []),
    ])
  ).filter(Boolean);

  return {
    ...base,
    ...incoming,
    kgs: incoming.kgs != null && !isNaN(Number(incoming.kgs)) ? Number(incoming.kgs) : base.kgs,
    raw_weight_text: incoming.raw_weight_text || base.raw_weight_text,
    packages: incoming.packages || base.packages,
    bales: incoming.bales != null && !isNaN(Number(incoming.bales)) ? Number(incoming.bales) : base.bales,
    container_numbers: mergedContainers,
    container_size: incoming.container_size || base.container_size || "1X 40' HC",
    bl_number: incoming.bl_number || base.bl_number,
    vessel_name: incoming.vessel_name || base.vessel_name,
    voyage: incoming.voyage || base.voyage,
    port_of_loading: incoming.port_of_loading || base.port_of_loading,
    port_of_discharge: incoming.port_of_discharge || base.port_of_discharge,
    shipper: incoming.shipper || base.shipper,
    shipper_address: incoming.shipper_address || base.shipper_address,
    consignee: incoming.consignee || base.consignee,
    consignee_address: incoming.consignee_address || base.consignee_address,
    notify_party: incoming.notify_party || base.notify_party,
    notify_party_address: incoming.notify_party_address || base.notify_party_address,
    description: incoming.description || base.description || 'USED CLOTHING',
    hs_code: incoming.hs_code || base.hs_code || '6309.1010',
    shipping_marks: incoming.shipping_marks || base.shipping_marks,
    bl_date: incoming.bl_date || base.bl_date,
    product_groups: incoming.product_groups && incoming.product_groups.length > 0 ? incoming.product_groups : base.product_groups,
    raw_text: incoming.raw_text || base.raw_text,
  };
}

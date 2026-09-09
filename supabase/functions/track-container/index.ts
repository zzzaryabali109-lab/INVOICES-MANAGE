import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRAQO_DEFAULT_KEY = '55799d2f7c1b974351122243d097de5753752f77f5624ae080ecb45b2a95b101';

function inferSealine(containerNumber: string): string | null {
  const prefix = containerNumber.slice(0, 4).toUpperCase();
  const map: Record<string, string> = {
    MRSU: 'MAEU',
    MAEU: 'MAEU',
    MSKU: 'MAEU',
    TGHU: 'MAEU',
    PONU: 'MAEU',
    MSCU: 'MSCU',
    MEDU: 'MSCU',
    CMAU: 'CMAU',
    CGMU: 'CMAU',
    COSU: 'COSU',
    CBHU: 'COSU',
    CCLU: 'COSU',
    HLCU: 'HLCU',
    ONEU: 'ONEU',
    EISU: 'EMCU',
    EGHU: 'EMCU',
    ZIMU: 'ZIMU',
    YMLU: 'YMLU',
    HMMU: 'HMMU',
    PILU: 'PILU',
  };
  return map[prefix] || null;
}

function parseTraqoResponse(containerNumber: string, json: any) {
  const data = json?.data;
  if (!data) {
    return {
      containerNumber,
      shippingLine: '',
      currentLocation: '',
      vesselName: '',
      voyageNumber: '',
      eta: '',
      lastUpdate: '',
      status: 'Not Available',
      destinationPort: '',
      error: json?.message || 'No tracking data available',
    };
  }

  const events: any[] = Array.isArray(data.events_table) ? data.events_table : [];
  const actualEvents = events.filter((e: any) => e.is_actual === 1);
  const latestActual = actualEvents.length > 0 ? actualEvents[actualEvents.length - 1] : events[0];

  const vessels: any[] = Array.isArray(data.vessels_table) ? data.vessels_table : [];
  const currentVessel = vessels.find((v: any) => v.is_current === 1) || vessels[0];

  const voyage = latestActual?.voyage || events.slice().reverse().find((e: any) => e.voyage)?.voyage || '';

  let location = '';
  if (latestActual?.location) {
    location = `${latestActual.location}${latestActual.country ? ', ' + latestActual.country : ''}`;
  } else if (data.origin) {
    location = data.origin;
  }

  let status = 'In Transit';
  const rawStatus = String(data.status || '').toUpperCase();
  const desc = String(latestActual?.description || latestActual?.status_description || '').toLowerCase();

  if (desc.includes('discharged') || desc.includes('unloaded') || rawStatus === 'DISCHARGED') {
    status = 'Discharged';
  } else if (desc.includes('arrival at final') || rawStatus === 'ARRIVED') {
    status = 'Arrived';
  } else if (desc.includes('loaded') || desc.includes('loading') || rawStatus === 'LOADING') {
    status = 'Loading';
  } else if (desc.includes('delivered') || rawStatus === 'DELIVERED') {
    status = 'Delivered';
  } else if (desc.includes('pending') || desc.includes('booked') || rawStatus === 'PENDING') {
    status = 'Pending';
  } else if (rawStatus === 'IN_TRANSIT') {
    status = 'In Transit';
  }

  return {
    containerNumber: data.containers_table?.[0]?.container_number || containerNumber,
    shippingLine: data.sealine_name || data.sealine || 'Maersk',
    currentLocation: location,
    vesselName: currentVessel?.vessel || '',
    voyageNumber: voyage,
    eta: data.eta || '',
    lastUpdate: latestActual?.timestamp || data.last_updated_at || data.last_synced_at || '',
    status,
    destinationPort: data.destination || '',
    error: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawNumber = body?.containerNumber;

    if (!rawNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'Container number required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const containerNumber = String(rawNumber).trim().toUpperCase();
    const apiKey = Deno.env.get('TRAQO_API_KEY') || TRAQO_DEFAULT_KEY;
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    const userSealine = (body?.sealine || '').trim().toUpperCase();
    const sealine = userSealine || inferSealine(containerNumber);

    const fetchTraqo = async (withSealine: boolean) => {
      const query = withSealine && sealine ? `?sealine=${encodeURIComponent(sealine)}` : '';
      const url = `https://traqocontainer.com/api/v1/container/${encodeURIComponent(containerNumber)}${query}`;
      console.log(`Tracking container with Traqo: ${url}`);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });
      const json = await res.json().catch(() => null);
      return { res, json };
    };

    let { res, json } = await fetchTraqo(Boolean(sealine));

    if ((!res.ok || !json?.success) && sealine) {
      const fallback = await fetchTraqo(false);
      if (fallback.res.ok && fallback.json?.success) {
        res = fallback.res;
        json = fallback.json;
      }
    }

    if (!res.ok || !json?.success) {
      const errorMsg = json?.message || `Traqo API error (${res.status})`;
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          data: {
            containerNumber,
            shippingLine: sealine || '',
            currentLocation: '',
            vesselName: '',
            voyageNumber: '',
            eta: '',
            lastUpdate: '',
            status: 'Not Available',
            destinationPort: '',
            error: errorMsg,
          }
        }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trackingData = parseTraqoResponse(containerNumber, json);
    return new Response(
      JSON.stringify({ success: true, data: trackingData }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const sanitizedError = error instanceof Error ? error.message : 'Unknown error';
    console.error('Tracking error:', sanitizedError);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

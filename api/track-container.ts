const TIMETOCARGO_DEFAULT_KEY = '6F91A193-A839-43F7-B502-187AAC5834AB';
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

function parseTimeToCargoResponse(containerNumber: string, json: any) {
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
      error: json?.status_description || json?.message || 'No tracking data available',
    };
  }

  const locationsMap = new Map<number, string>();
  if (Array.isArray(data.locations)) {
    for (const loc of data.locations) {
      if (typeof loc?.id === 'number') {
        const parts = [loc.name, loc.country].filter(Boolean);
        locationsMap.set(loc.id, parts.join(', '));
      }
    }
  }

  const events: any[] = Array.isArray(data.container?.events) ? data.container.events : [];
  const latestEvent = events[0] || null;

  const vesselEvent = events.find((e: any) => e.vessel) || null;
  const vesselName = vesselEvent?.vessel || '';
  const voyageNumber = vesselEvent?.voyage || '';

  let currentLocation = '';
  if (latestEvent && typeof latestEvent.location === 'number') {
    currentLocation = locationsMap.get(latestEvent.location) || '';
  }

  let destinationPort = '';
  const podLocId = data.summary?.pod?.location ?? data.summary?.destination?.location;
  if (typeof podLocId === 'number') {
    destinationPort = locationsMap.get(podLocId) || '';
  }

  const rawEta = data.summary?.pod?.date || data.summary?.destination?.date || '';
  const eta = rawEta ? String(rawEta).split('T')[0] : '';

  const rawLastUpdate = latestEvent?.date || data.tracking_metadata?.updated_at || '';
  const lastUpdate = rawLastUpdate ? String(rawLastUpdate).replace('T', ' ').slice(0, 19) : '';

  const shippingLine =
    data.summary?.company?.name ||
    data.summary?.company?.full_name ||
    '';

  let status = 'In Transit';
  const rawStatus = String(data.shipment_status || '').toUpperCase();
  const latestStatus = String(latestEvent?.status || '').toLowerCase();

  if (
    rawStatus === 'DELIVERED' ||
    latestStatus.includes('delivered') ||
    latestStatus.includes('import to consignee') ||
    latestStatus.includes('empty received')
  ) {
    status = 'Arrived';
  } else if (rawStatus === 'DISCHARGED' || latestStatus.includes('discharged')) {
    status = 'Discharged';
  } else if (rawStatus === 'ARRIVED' || latestStatus.includes('arrival')) {
    status = 'Arrived';
  } else if (
    rawStatus === 'LOADING' ||
    rawStatus === 'LOADED' ||
    latestStatus.includes('loaded') ||
    latestStatus.includes('loading')
  ) {
    status = 'Loading';
  } else if (rawStatus === 'PENDING' || latestStatus.includes('pending') || latestStatus.includes('booked')) {
    status = 'Pending';
  } else if (rawStatus === 'IN_TRANSIT' || rawStatus === 'TRANSSHIPMENT') {
    status = 'In Transit';
  }

  return {
    containerNumber: data.container?.number || containerNumber,
    shippingLine,
    currentLocation,
    vesselName,
    voyageNumber,
    eta,
    lastUpdate,
    status,
    destinationPort,
    error: null,
  };
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
  const actualEvents = events.filter((e) => e.is_actual === 1);
  const latestActual = actualEvents.length > 0 ? actualEvents[actualEvents.length - 1] : events[0];

  const vessels: any[] = Array.isArray(data.vessels_table) ? data.vessels_table : [];
  const currentVessel = vessels.find((v) => v.is_current === 1) || vessels[0];

  const voyage = latestActual?.voyage || events.slice().reverse().find((e) => e.voyage)?.voyage || '';

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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const rawNumber = body?.containerNumber || req.query?.containerNumber;
    if (!rawNumber || typeof rawNumber !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Container number is required',
      });
    }

    const containerNumber = rawNumber.trim().toUpperCase();
    const userSealine = (body?.sealine || (req.query?.sealine as string) || '').trim().toUpperCase();
    const inferred = inferSealine(containerNumber);
    const sealine = userSealine || inferred;

    // 1. Primary: TimeToCargo API with key 6F91A193-A839-43F7-B502-187AAC5834AB
    try {
      const ttcApiKey = process.env.TIMETOCARGO_API_KEY || TIMETOCARGO_DEFAULT_KEY;
      const ttcCompany = sealine || 'AUTO';
      const ttcUrl = `https://tracking.timetocargo.com/v1/container?api_key=${encodeURIComponent(
        ttcApiKey
      )}&company=${encodeURIComponent(ttcCompany)}&container_number=${encodeURIComponent(containerNumber)}`;

      const ttcRes = await fetch(ttcUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const ttcJson = await ttcRes.json().catch(() => null);

      if (ttcRes.ok && ttcJson?.success && ttcJson?.data) {
        const parsedData = parseTimeToCargoResponse(containerNumber, ttcJson);
        return res.status(200).json({
          success: true,
          data: parsedData,
        });
      }

      if (ttcCompany !== 'AUTO') {
        const autoUrl = `https://tracking.timetocargo.com/v1/container?api_key=${encodeURIComponent(
          ttcApiKey
        )}&company=AUTO&container_number=${encodeURIComponent(containerNumber)}`;
        const autoRes = await fetch(autoUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const autoJson = await autoRes.json().catch(() => null);
        if (autoRes.ok && autoJson?.success && autoJson?.data) {
          const parsedData = parseTimeToCargoResponse(containerNumber, autoJson);
          return res.status(200).json({
            success: true,
            data: parsedData,
          });
        }
      }
    } catch {
      // Proceed to fallback
    }

    // 2. Secondary: Traqo API fallback
    const apiKey = process.env.TRAQO_API_KEY || TRAQO_DEFAULT_KEY;
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    const fetchFromTraqo = async (withSealine: boolean) => {
      const query = withSealine && sealine ? `?sealine=${encodeURIComponent(sealine)}` : '';
      const url = `https://traqocontainer.com/api/v1/container/${encodeURIComponent(containerNumber)}${query}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      const json = await response.json().catch(() => null);
      return { response, json };
    };

    let { response, json } = await fetchFromTraqo(Boolean(sealine));

    if ((!response.ok || !json?.success) && sealine) {
      const fallback = await fetchFromTraqo(false);
      if (fallback.response.ok && fallback.json?.success) {
        response = fallback.response;
        json = fallback.json;
      }
    }

    if (!response.ok || !json?.success) {
      const errorMsg = json?.message || 'Container not found or tracking data unavailable';
      return res.status(200).json({
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
        },
      });
    }

    const parsedData = parseTraqoResponse(containerNumber, json);
    return res.status(200).json({
      success: true,
      data: parsedData,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error while tracking container',
    });
  }
}

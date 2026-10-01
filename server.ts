import express, { Request, Response } from 'express';
import path from 'path';

// Prevent uncaught errors from crashing the Node process
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

const PORT = Number(process.env.PORT) || 3000;
const TIMETOCARGO_DEFAULT_KEY = '6F91A193-A839-43F7-B502-187AAC5834AB';
const TRAQO_DEFAULT_KEY = '55799d2f7c1b974351122243d097de5753752f77f5624ae080ecb45b2a95b101';

// Prefix-to-sealine inference helper
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

// Map Traqo API response to frontend ContainerData
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

  // Voyage
  const voyage = latestActual?.voyage || events.slice().reverse().find((e) => e.voyage)?.voyage || '';

  // Current location
  let location = '';
  if (latestActual?.location) {
    location = `${latestActual.location}${latestActual.country ? ', ' + latestActual.country : ''}`;
  } else if (data.origin) {
    location = data.origin;
  }

  // Determine status
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

// Map TimeToCargo API response to frontend ContainerData
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

  // Locations lookup map
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

  // Find latest event with vessel information
  const vesselEvent = events.find((e: any) => e.vessel) || null;
  const vesselName = vesselEvent?.vessel || '';
  const voyageNumber = vesselEvent?.voyage || '';

  // Determine current location
  let currentLocation = '';
  if (latestEvent && typeof latestEvent.location === 'number') {
    currentLocation = locationsMap.get(latestEvent.location) || '';
  }

  // Determine destination port
  let destinationPort = '';
  const podLocId = data.summary?.pod?.location ?? data.summary?.destination?.location;
  if (typeof podLocId === 'number') {
    destinationPort = locationsMap.get(podLocId) || '';
  }

  // Determine ETA
  const rawEta = data.summary?.pod?.date || data.summary?.destination?.date || '';
  const eta = rawEta ? String(rawEta).split('T')[0] : '';

  // Determine last update
  const rawLastUpdate = latestEvent?.date || data.tracking_metadata?.updated_at || '';
  const lastUpdate = rawLastUpdate ? String(rawLastUpdate).replace('T', ' ').slice(0, 19) : '';

  // Shipping line
  const shippingLine =
    data.summary?.company?.name ||
    data.summary?.company?.full_name ||
    '';

  // Determine status
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

async function startServer() {
  const app = express();

  // Global CORS headers
  app.use((_req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use(express.json());

  // Health check endpoints for deployment platforms (Render, Railway, Heroku, etc.)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'container-tracking-backend' });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'container-tracking-backend' });
  });

  // Container tracking handler supporting TimeToCargo & Traqo fallback
  const handleTrackContainer = async (req: Request, res: Response) => {
    try {
      const rawNumber = req.body?.containerNumber || req.query?.containerNumber;
      if (!rawNumber || typeof rawNumber !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Container number is required',
        });
      }

      const containerNumber = rawNumber.trim().toUpperCase();
      const ttcApiKey = process.env.TIMETOCARGO_API_KEY || TIMETOCARGO_DEFAULT_KEY;
      const userSealine = (req.body?.sealine || (req.query?.sealine as string) || '').trim().toUpperCase();
      const inferred = inferSealine(containerNumber);
      const sealine = userSealine || inferred;

      // 1. Primary: TimeToCargo API with key 6F91A193-A839-43F7-B502-187AAC5834AB
      try {
        const ttcCompany = sealine || 'AUTO';
        const ttcUrl = `https://tracking.timetocargo.com/v1/container?api_key=${encodeURIComponent(
          ttcApiKey
        )}&company=${encodeURIComponent(ttcCompany)}&container_number=${encodeURIComponent(containerNumber)}`;

        console.log(`[TimeToCargo API] Fetching: ${ttcUrl.replace(ttcApiKey, 'REDACTED')}`);

        const ttcRes = await fetch(ttcUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        const ttcJson = await ttcRes.json().catch(() => null);

        if (ttcRes.ok && ttcJson?.success && ttcJson?.data) {
          const parsedData = parseTimeToCargoResponse(containerNumber, ttcJson);
          console.log(`[TimeToCargo API] Successfully tracked ${containerNumber} (${parsedData.status})`);
          return res.status(200).json({
            success: true,
            data: parsedData,
          });
        }

        // If company was specific and failed, retry with company=AUTO
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
            console.log(`[TimeToCargo API AUTO] Successfully tracked ${containerNumber} (${parsedData.status})`);
            return res.status(200).json({
              success: true,
              data: parsedData,
            });
          }
        }
      } catch (ttcErr) {
        console.warn('[TimeToCargo API] Error, trying fallback:', ttcErr);
      }

      // 2. Secondary: Traqo API fallback
      const traqoApiKey = process.env.TRAQO_API_KEY || TRAQO_DEFAULT_KEY;
      const authHeader = traqoApiKey.startsWith('Bearer ') ? traqoApiKey : `Bearer ${traqoApiKey}`;

      const fetchFromTraqo = async (withSealine: boolean) => {
        const query = withSealine && sealine ? `?sealine=${encodeURIComponent(sealine)}` : '';
        const url = `https://traqocontainer.com/api/v1/container/${encodeURIComponent(containerNumber)}${query}`;
        console.log(`[Traqo API] Fetching: ${url}`);

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

      // First attempt (with sealine if available)
      let { response, json } = await fetchFromTraqo(Boolean(sealine));

      // If failed and sealine was provided, retry without sealine
      if ((!response.ok || !json?.success) && sealine) {
        console.log(`[Traqo API] Retrying without sealine parameter for ${containerNumber}...`);
        const fallback = await fetchFromTraqo(false);
        if (fallback.response.ok && fallback.json?.success) {
          response = fallback.response;
          json = fallback.json;
        }
      }

      if (!response.ok || !json?.success) {
        const errorMsg = json?.message || 'Container not found or tracking data unavailable';
        console.error(`[Tracking API] Error for ${containerNumber}:`, errorMsg);
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
      console.log(`[Traqo API] Successfully tracked ${containerNumber} (${parsedData.status})`);

      return res.status(200).json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('[Tracking API] Unexpected error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Internal server error while tracking container',
      });
    }
  };

  // Support both POST and GET for /api/track-container
  app.post('/api/track-container', handleTrackContainer);
  app.get('/api/track-container', handleTrackContainer);

  // BL extraction handler to guarantee edge function independence
  const handleExtractBlData = async (req: Request, res: Response) => {
    try {
      const { rawPdfText } = req.body || {};
      const text = String(rawPdfText || '');

      // Container numbers (ISO standard)
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

      // Goods description
      const hasMix = /\bMIX(?:ED)?\s+USED\s+CLOTHING\b/i.test(text);
      const description = hasMix ? 'MIX USED CLOTHING' : 'USED CLOTHING';

      return res.status(200).json({
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
      });
    } catch {
      return res.status(200).json({
        success: true,
        data: {
          kgs: null,
          container_numbers: [],
          container_size: "1X 40' HC",
          bl_number: null,
          description: 'USED CLOTHING',
          product_groups: [{ name: 'USED CLOTHING', hs_code: '6309.1010' }],
        },
      });
    }
  };

  app.post('/api/extract-bl-data', handleExtractBlData);
  app.get('/api/extract-bl-data', handleExtractBlData);

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn('[Server] Note: Vite dev middleware skipped, serving static files if available.');
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.use((_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'), (err) => {
          if (err && !res.headersSent) {
            res.status(200).send('API Server is running.');
          }
        });
      });
    }
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err && !res.headersSent) {
          res.status(200).send('API Server is running.');
        }
      });
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (http://0.0.0.0:${PORT})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[Server] ${signal} received, closing HTTP server...`);
    server.close(() => {
      console.log('[Server] HTTP server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();

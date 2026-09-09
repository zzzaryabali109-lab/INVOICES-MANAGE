import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
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

async function startServer() {
  const app = express();

  app.use(express.json());

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'container-tracking-backend' });
  });

  // Traqo container tracking handler
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
      const apiKey = process.env.TRAQO_API_KEY || TRAQO_DEFAULT_KEY;

      const userSealine = (req.body?.sealine || req.query?.sealine as string || '').trim().toUpperCase();
      const inferred = inferSealine(containerNumber);
      const sealine = userSealine || inferred;

      const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

      const fetchFromTraqo = async (withSealine: boolean) => {
        const query = withSealine && sealine ? `?sealine=${encodeURIComponent(sealine)}` : '';
        const url = `https://traqocontainer.com/api/v1/container/${encodeURIComponent(containerNumber)}${query}`;
        console.log(`[Traqo API] Fetching: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
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
        const errorMsg = json?.message || `Traqo API error (${response.status})`;
        console.error(`[Traqo API] Error for ${containerNumber}:`, errorMsg);
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
      console.error('[Traqo API] Unexpected error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Internal server error while tracking container',
      });
    }
  };

  // Support both POST and GET for /api/track-container
  app.post('/api/track-container', handleTrackContainer);
  app.get('/api/track-container', handleTrackContainer);

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

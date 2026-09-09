// Overlay text on user-uploaded PDF template at given coordinates.
// Preserves original stamp, lines, spacing 100%.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

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

// Normalized box: x,y,w,h all 0..1 (top-left origin like AI returns)
interface Box {
  x: number; y: number; w: number; h: number;
  align?: 'left' | 'center' | 'right';
  font_size?: number;
  max_lines?: number;
  bold?: boolean;
}

interface FieldLayout {
  key: string;
  value_box?: Box | null;
}

function wrapLines(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      const width = font.widthOfTextAtSize(trial, fontSize);
      if (width <= maxWidth || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
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

    const body = await req.json().catch(() => ({}));
    const templateB64: string | undefined = body?.templateBase64;
    const data: Record<string, string> = body?.data ?? {};
    const fields: FieldLayout[] = Array.isArray(body?.fields) ? body.fields : [];

    if (!templateB64) {
      return new Response(JSON.stringify({ error: 'templateBase64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pdfDoc = await PDFDocument.load(b64ToBytes(templateB64));
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.getPage(0);
    const { width: pw, height: ph } = page.getSize();

    for (const f of fields) {
      const box = f.value_box;
      const raw = data[f.key];
      if (!box || !raw) continue;

      const text = String(raw);
      const font = box.bold ? helvBold : helv;
      const fontSize = box.font_size ?? 9;
      const align = box.align ?? 'left';
      const maxLines = box.max_lines ?? 6;

      const xPt = box.x * pw;
      const wPt = box.w * pw;
      const hPt = box.h * ph;
      // pdf-lib uses bottom-left origin
      const topY = ph - box.y * ph;
      const padX = Math.min(Math.max(wPt * 0.04, 1), 3);
      const padY = Math.min(Math.max(hPt * 0.1, 1), 3);
      const contentW = Math.max(1, wPt - padX * 2);

      // Auto-shrink
      let fs = fontSize;
      let lines: string[] = [];
      const lh = () => fs * 1.15;
      for (; fs >= 5.5; fs -= 0.5) {
        const wrapped = wrapLines(text, font, fs, contentW);
        const capByH = Math.max(1, Math.floor((hPt - padY * 2) / lh()));
        const cap = Math.min(maxLines, capByH);
        if (wrapped.length <= cap || fs - 0.5 < 5.5) {
          lines = wrapped.slice(0, cap);
          break;
        }
      }

      let yCursor = topY - padY - fs;
      for (const line of lines) {
        const lineW = font.widthOfTextAtSize(line, fs);
        let drawX = xPt + padX;
        if (align === 'center') drawX = xPt + (wPt - lineW) / 2;
        else if (align === 'right') drawX = xPt + wPt - padX - lineW;
        page.drawText(line, { x: drawX, y: yCursor, size: fs, font, color: rgb(0, 0, 0) });
        yCursor -= lh();
      }
    }

    const out = await pdfDoc.save();
    const pdfBase64 = bytesToB64(out);

    return new Response(JSON.stringify({ success: true, pdfBase64 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-invoice-overlay error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

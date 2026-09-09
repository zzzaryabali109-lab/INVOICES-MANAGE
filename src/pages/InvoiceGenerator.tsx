import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  FileText, Upload, Calculator, Download, Loader2, CheckCircle2,
  AlertCircle, Scale, DollarSign, Hash, ArrowRight, ArrowLeft,
  Sparkles, Ship, FileUp, Eye, Package, RotateCcw, FileSpreadsheet, X,
  Truck, ShieldCheck, Wand2, Receipt, FileCheck2, Layers,
} from 'lucide-react';
import {
  classifyGoodsGroup,
  splitDescriptionFallback,
  composeGoodsDescription,
  type ComposedGoods,
} from '@/lib/goodsDescription';
import {
  extractRawTextFromPdf,
  parseBlText,
  sanitizeAndVerifyBlData,
} from '@/lib/pdfBlExtractor';
import { compressBlFile } from '@/lib/pdfCompressor';




interface ExcelRow {
  container: string;
  invoice: string;
  price: string;
}

const normalizeContainerKey = (s: string): string =>
  (s || '').toString().toUpperCase().replace(/[\s\-_.,:;#'"]/g, '');

// Extract the clean ISO container code (4 letters + 7 digits) from any string.
// Strips trailing size/type suffixes like /40HC, /20GP, -45HC, etc.
export const cleanContainerNumber = (raw: string): string => {
  if (!raw) return '';
  const compact = raw.toString().toUpperCase().replace(/[\s\-_./\\]/g, '');
  const m = compact.match(/([A-Z]{4}\d{7})/);
  return m ? m[1] : '';
};

export const cleanContainerList = (arr: any): string[] => {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const v of arr) {
    const c = cleanContainerNumber(String(v ?? ''));
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
};





interface BLData {
  kgs: number | null;
  shipper: string | null;
  shipper_address: string | null;
  consignee: string | null;
  consignee_address: string | null;
  notify_party: string | null;
  notify_party_address: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  description: string | null;
  packages: string | null;
  bales: number | null;
  container_numbers: string[];
  container_size: string | null;
  bl_number: string | null;
  vessel_name: string | null;
  hs_code: string | null;
  shipping_marks: string | null;
  bl_date: string | null;
  raw_weight_text: string | null;
}


interface TemplateBox {
  x: number;
  y: number;
  w: number;
  h: number;
  align?: 'left' | 'center' | 'right' | null;
  font_size?: number | null;
  max_lines?: number | null;
  bold?: boolean | null;
}

type PdfTextAlign = 'left' | 'center' | 'right';

type TemplateFieldKey =
  | 'invoice_number'
  | 'date'
  | 'shipper'
  | 'consignee'
  | 'notify_party'
  | 'container_info'
  | 'vessel'
  | 'hs_code'
  | 'port_of_loading'
  | 'port_of_discharge'
  | 'goods_description'
  | 'shipping_marks'
  | 'packages'
  | 'gross_weight'
  | 'unit_price'
  | 'amount'
  | 'reference'
  | 'company_name';

interface TemplateFieldLayout {
  key: TemplateFieldKey;
  label?: string | null;
  label_box?: TemplateBox | null;
  value_box?: TemplateBox | null;
}

interface TemplateStaticText {
  text: string;
  box: TemplateBox;
}

interface TemplateImageRegion {
  key: 'logo' | 'stamp';
  box: TemplateBox;
}

interface TemplateLayout {
  title?: string | null;
  has_shipper_section?: boolean;
  has_consignee_section?: boolean;
  has_notify_party?: boolean;
  has_container_info?: boolean;
  has_vessel_section?: boolean;
  has_port_section?: boolean;
  has_hs_code?: boolean;
  has_goods_description?: boolean;
  has_shipping_marks?: boolean;
  has_weight_pricing?: boolean;
  has_bales_packages?: boolean;
  has_stamp_area?: boolean;
  company_name_position?: 'bottom' | 'top' | null;
  layout_style?: 'two-column' | 'single-column' | null;
  sections_order?: string[] | null;
  show_lines?: boolean;
  use_exact_positions?: boolean;
  fields?: TemplateFieldLayout[] | null;
  static_texts?: TemplateStaticText[] | null;
  image_regions?: TemplateImageRegion[] | null;
}

GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_TEMPLATE_PIXELS = { width: 1240, height: 1754 };
const DEFAULT_PAGE_FORMAT: [number, number] = [210, 297];
const PDF_FONT_FAMILY = 'helvetica';
const TEMPLATE_FIELD_KEYS: TemplateFieldKey[] = [
  'invoice_number',
  'date',
  'shipper',
  'consignee',
  'notify_party',
  'container_info',
  'vessel',
  'hs_code',
  'port_of_loading',
  'port_of_discharge',
  'goods_description',
  'shipping_marks',
  'packages',
  'gross_weight',
  'unit_price',
  'amount',
  'reference',
  'company_name',
];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const createNormalizedBox = (
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  options: Partial<Omit<TemplateBox, 'x' | 'y' | 'w' | 'h'>> = {},
): TemplateBox => ({
  x: Number((xMm / DEFAULT_PAGE_FORMAT[0]).toFixed(4)),
  y: Number((yMm / DEFAULT_PAGE_FORMAT[1]).toFixed(4)),
  w: Number((wMm / DEFAULT_PAGE_FORMAT[0]).toFixed(4)),
  h: Number((hMm / DEFAULT_PAGE_FORMAT[1]).toFixed(4)),
  ...options,
});

const normalizeTemplateBox = (box: TemplateBox | null | undefined): TemplateBox | null => {
  if (!box || ![box.x, box.y, box.w, box.h].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }

  const x = clamp(box.x, 0, 0.98);
  const y = clamp(box.y, 0, 0.98);

  return {
    x,
    y,
    w: clamp(box.w, 0.02, 1 - x),
    h: clamp(box.h, 0.02, 1 - y),
    align: box.align === 'center' || box.align === 'right' ? box.align : 'left',
    font_size: typeof box.font_size === 'number' && Number.isFinite(box.font_size) ? box.font_size : undefined,
    max_lines: typeof box.max_lines === 'number' && Number.isFinite(box.max_lines) ? Math.max(1, Math.round(box.max_lines)) : undefined,
    bold: typeof box.bold === 'boolean' ? box.bold : undefined,
  };
};

const DEFAULT_TEMPLATE_LAYOUT: TemplateLayout = {
  title: 'INVOICE/PACKING',
  has_shipper_section: true,
  has_consignee_section: true,
  has_notify_party: true,
  has_container_info: true,
  has_vessel_section: true,
  has_port_section: true,
  has_hs_code: true,
  has_goods_description: true,
  has_shipping_marks: true,
  has_weight_pricing: true,
  has_bales_packages: true,
  has_stamp_area: true,
  company_name_position: 'bottom',
  layout_style: 'two-column',
  sections_order: [
    'shipper',
    'notify_party',
    'consignee',
    'container',
    'vessel',
    'ports',
    'goods',
    'weight',
    'reference',
    'company',
  ],
  show_lines: false,
  use_exact_positions: true,
  static_texts: [
    { text: 'INVOICE/PACKING', box: createNormalizedBox(50, 8, 110, 10, { align: 'center', font_size: 16, max_lines: 1, bold: true }) },
    { text: 'Invoice No.', box: createNormalizedBox(119, 22, 25, 5, { font_size: 8, bold: true }) },
    { text: 'Date', box: createNormalizedBox(168, 22, 15, 5, { font_size: 8, bold: true }) },
  ],
  fields: [
    { key: 'invoice_number', label: '', value_box: createNormalizedBox(144, 22, 22, 5, { font_size: 9, max_lines: 1 }) },
    { key: 'date', label: '', value_box: createNormalizedBox(183, 22, 22, 5, { font_size: 9, max_lines: 1 }) },
    { key: 'shipper', label: '1.Shipper', label_box: createNormalizedBox(10, 28, 95, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(10, 35, 95, 28, { font_size: 8.5, max_lines: 6 }) },
    { key: 'notify_party', label: 'NOTIFY PARTY', label_box: createNormalizedBox(119, 36, 80, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(119, 43, 80, 24, { font_size: 8.5, max_lines: 5 }) },
    { key: 'consignee', label: '2.Consignee', label_box: createNormalizedBox(10, 92, 95, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(10, 99, 95, 24, { font_size: 8.5, max_lines: 5 }) },
    { key: 'container_info', label: 'CONTAINER NO:', label_box: createNormalizedBox(119, 113, 80, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(119, 92, 80, 18, { font_size: 9, max_lines: 3 }) },
    { key: 'vessel', label: 'VESSEL / FLIGHT', label_box: createNormalizedBox(10, 140, 95, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(10, 148, 95, 10, { font_size: 9, max_lines: 2 }) },
    { key: 'port_of_discharge', label: '', value_box: createNormalizedBox(10, 162, 95, 10, { font_size: 9, max_lines: 2 }) },
    { key: 'hs_code', label: 'HS CODE:', label_box: createNormalizedBox(119, 150, 25, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(146, 150, 52, 6, { font_size: 9, max_lines: 1 }) },
    { key: 'goods_description', label: 'Goods Description', label_box: createNormalizedBox(119, 160, 80, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(119, 168, 80, 10, { font_size: 8.5, max_lines: 3 }) },
    { key: 'port_of_loading', label: 'Port of Loading', label_box: createNormalizedBox(10, 178, 95, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(10, 186, 95, 10, { font_size: 9, max_lines: 2 }) },
    { key: 'gross_weight', label: 'G.Weight', label_box: createNormalizedBox(119, 184, 30, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(150, 184, 48, 6, { font_size: 9.5, max_lines: 1, align: 'right' }) },
    { key: 'unit_price', label: 'Unit Price', label_box: createNormalizedBox(119, 193, 30, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(150, 193, 48, 6, { font_size: 9.5, max_lines: 1, align: 'right' }) },
    { key: 'amount', label: 'Amount', label_box: createNormalizedBox(119, 202, 30, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(150, 202, 48, 7, { font_size: 11, max_lines: 1, align: 'right', bold: true }) },
    { key: 'shipping_marks', label: 'SHIPPING MARKS', label_box: createNormalizedBox(10, 215, 95, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(15, 223, 90, 10, { font_size: 8.5, max_lines: 2 }) },
    { key: 'packages', label: 'No.& Kind of Pkgs', label_box: createNormalizedBox(25, 243, 75, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(25, 251, 75, 8, { font_size: 10, max_lines: 1, bold: true, align: 'center' }) },
    { key: 'reference', label: 'REFERENCE', label_box: createNormalizedBox(10, 262, 95, 5, { font_size: 8, bold: true }), value_box: createNormalizedBox(10, 270, 95, 18, { font_size: 8.5, max_lines: 4 }) },
    { key: 'company_name', value_box: createNormalizedBox(119, 267, 80, 8, { font_size: 10, max_lines: 1, align: 'center', bold: true }) },
  ],
  image_regions: [],
};

const mergeTemplateFields = (
  fallbackFields: TemplateFieldLayout[],
  incomingFields: TemplateFieldLayout[] | null | undefined,
): TemplateFieldLayout[] => {
  const merged = new Map<TemplateFieldKey, TemplateFieldLayout>();

  fallbackFields.forEach((field) => {
    merged.set(field.key, {
      ...field,
      label_box: normalizeTemplateBox(field.label_box),
      value_box: normalizeTemplateBox(field.value_box),
    });
  });

  (incomingFields ?? []).forEach((field) => {
    if (!field || !TEMPLATE_FIELD_KEYS.includes(field.key)) return;

    const base = merged.get(field.key) ?? { key: field.key };

    merged.set(field.key, {
      ...base,
      ...field,
      label: field.label ?? base.label,
      label_box: normalizeTemplateBox(field.label_box) ?? base.label_box ?? null,
      value_box: normalizeTemplateBox(field.value_box) ?? base.value_box ?? null,
    });
  });

  return Array.from(merged.values());
};

const mergeStaticTexts = (incoming: TemplateStaticText[] | null | undefined): TemplateStaticText[] => {
  const normalized = (incoming ?? [])
    .map((item) => {
      const box = normalizeTemplateBox(item?.box);
      if (!box || !item?.text?.trim()) return null;
      return { text: item.text.trim(), box };
    })
    .filter((item): item is TemplateStaticText => Boolean(item));

  return normalized.length ? normalized : (DEFAULT_TEMPLATE_LAYOUT.static_texts ?? []);
};

const mergeImageRegions = (incoming: TemplateImageRegion[] | null | undefined): TemplateImageRegion[] => (
  (incoming ?? [])
    .map((region) => {
      const box = normalizeTemplateBox(region?.box);
      if (!box || (region?.key !== 'logo' && region?.key !== 'stamp')) return null;
      return { key: region.key, box };
    })
    .filter((item): item is TemplateImageRegion => Boolean(item))
);

export const resolveTemplateLayout = (layout: TemplateLayout | null | undefined): TemplateLayout => ({
  ...DEFAULT_TEMPLATE_LAYOUT,
  ...layout,
  show_lines: false,
  use_exact_positions: true,
  static_texts: mergeStaticTexts(layout?.static_texts),
  fields: mergeTemplateFields(DEFAULT_TEMPLATE_LAYOUT.fields ?? [], layout?.fields),
  image_regions: mergeImageRegions(layout?.image_regions),
});

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const readFileAsBase64 = async (file: File) => {
  const dataUrl = await readFileAsDataUrl(file);
  return dataUrl.split(',')[1];
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const renderTemplateFileToCanvas = async (file: File, scale = 2) => {
  if (file.type === 'application/pdf') {
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context not available');
      }

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      return canvas;
    } finally {
      pdf.destroy();
    }
  }

  const src = await readFileAsDataUrl(file);
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || DEFAULT_TEMPLATE_PIXELS.width;
  canvas.height = image.naturalHeight || DEFAULT_TEMPLATE_PIXELS.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context not available');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const extractRegionFromCanvas = (sourceCanvas: HTMLCanvasElement, box: TemplateBox | null | undefined) => {
  const region = normalizeTemplateBox(box);
  if (!region) return null;

  const sourceX = Math.round(region.x * sourceCanvas.width);
  const sourceY = Math.round(region.y * sourceCanvas.height);
  const sourceWidth = Math.min(Math.round(region.w * sourceCanvas.width), sourceCanvas.width - sourceX);
  const sourceHeight = Math.min(Math.round(region.h * sourceCanvas.height), sourceCanvas.height - sourceY);

  if (sourceWidth <= 2 || sourceHeight <= 2) return null;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sourceWidth;
  cropCanvas.height = sourceHeight;

  const cropContext = cropCanvas.getContext('2d');
  if (!cropContext) return null;

  cropContext.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );

  return cropCanvas.toDataURL('image/png');
};

const getTemplatePageMetrics = async (file: File | null) => {
  if (!file) return null;

  if (file.type === 'application/pdf') {
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    pdf.destroy();

    return {
      width: viewport.width,
      height: viewport.height,
    };
  }

  const src = await readFileAsDataUrl(file);
  const image = await loadImage(src);

  return {
    width: image.naturalWidth || DEFAULT_TEMPLATE_PIXELS.width,
    height: image.naturalHeight || DEFAULT_TEMPLATE_PIXELS.height,
  };
};

const getPdfPageFormat = (width: number, height: number): [number, number] => {
  if (!width || !height) return DEFAULT_PAGE_FORMAT;

  if (width > height) {
    const landscapeHeight = DEFAULT_PAGE_FORMAT[0];
    return [Number(((width / height) * landscapeHeight).toFixed(2)), landscapeHeight];
  }

  return [DEFAULT_PAGE_FORMAT[0], Number(((height / width) * DEFAULT_PAGE_FORMAT[0]).toFixed(2))];
};

const normalizePdfText = (value: string | number | null | undefined) => String(value ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n');

const wrapPdfText = (doc: jsPDF, text: string, width: number) => {
  if (!text) return [] as string[];

  return text
    .split('\n')
    .flatMap((line) => {
      const wrapped = doc.splitTextToSize(line, width);
      return Array.isArray(wrapped) ? wrapped : [wrapped];
    })
    .filter(Boolean);
};

const truncatePdfLine = (doc: jsPDF, text: string, maxWidth: number) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (doc.getTextWidth(trimmed) <= maxWidth) return trimmed;

  let candidate = trimmed;
  while (candidate.length > 1 && doc.getTextWidth(`${candidate}…`) > maxWidth) {
    candidate = candidate.slice(0, -1).trimEnd();
  }

  return candidate ? `${candidate}…` : '…';
};

const clampPdfLines = (doc: jsPDF, lines: string[], maxLines: number, maxWidth: number) => {
  if (lines.length <= maxLines) return lines;
  if (maxLines <= 0) return [] as string[];

  const trimmed = lines.slice(0, maxLines);
  trimmed[maxLines - 1] = truncatePdfLine(doc, trimmed[maxLines - 1] || '', maxWidth);
  return trimmed;
};

const drawTextBlock = (
  doc: jsPDF,
  {
    text,
    x,
    y,
    width,
    fontSize,
    lineHeight,
    align = 'left',
    bold = false,
    maxLines,
  }: {
    text: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    lineHeight: number;
    align?: PdfTextAlign;
    bold?: boolean;
    maxLines?: number;
  },
) => {
  // CRITICAL: Set font BEFORE wrapping so splitTextToSize uses correct metrics
  doc.setFont(PDF_FONT_FAMILY, bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);

  const lines = wrapPdfText(doc, normalizePdfText(text), width);
  const renderedLines = typeof maxLines === 'number' ? lines.slice(0, maxLines) : lines;

  renderedLines.forEach((line, index) => {
    const lineX = align === 'left' ? x : align === 'center' ? x + width / 2 : x + width;
    doc.text(line, lineX, y + index * lineHeight, { align });
  });
};

export interface PersistedInvoiceTemplate {
  blob: Blob;
  layout: TemplateLayout | null;
  name: string;
  type: string;
}

export const INVOICE_TEMPLATE_DB_NAME = 'shipahead-invoice-generator';
export const INVOICE_TEMPLATE_STORE = 'invoice-template-store';

const openInvoiceTemplateDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(INVOICE_TEMPLATE_DB_NAME, 1);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(INVOICE_TEMPLATE_STORE)) {
      db.createObjectStore(INVOICE_TEMPLATE_STORE);
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Failed to open template storage'));
});

export const loadPersistedInvoiceTemplate = async (storageKey: string): Promise<PersistedInvoiceTemplate | null> => {
  const db = await openInvoiceTemplateDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(INVOICE_TEMPLATE_STORE, 'readonly');
    const request = transaction.objectStore(INVOICE_TEMPLATE_STORE).get(storageKey);

    request.onsuccess = () => resolve((request.result as PersistedInvoiceTemplate | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load saved template'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to load saved template'));
  });
};

export const savePersistedInvoiceTemplate = async (storageKey: string, template: PersistedInvoiceTemplate) => {
  const db = await openInvoiceTemplateDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(INVOICE_TEMPLATE_STORE, 'readwrite');
    transaction.objectStore(INVOICE_TEMPLATE_STORE).put(template, storageKey);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save template'));
  });
};

export const removePersistedInvoiceTemplate = async (storageKey: string) => {
  const db = await openInvoiceTemplateDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(INVOICE_TEMPLATE_STORE, 'readwrite');
    transaction.objectStore(INVOICE_TEMPLATE_STORE).delete(storageKey);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to remove template'));
  });
};

const normalizeAmountInput = (value: string) => value.replace(/,/g, '').trim();

export const normalizeDecimalForMath = (value: string) => {
  const normalized = normalizeAmountInput(value);
  if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) return null;

  const [integerRaw = '0', decimalRaw = ''] = normalized.split('.');
  const integerPart = integerRaw.replace(/^0+(?=\d)/, '') || '0';
  const decimalPart = decimalRaw.replace(/0+$/, '');

  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
};

const parseDecimalParts = (value: string) => {
  const normalized = normalizeDecimalForMath(value);
  if (!normalized) return null;

  const [integerPart = '0', decimalPart = ''] = normalized.split('.');
  return {
    normalized,
    scale: decimalPart.length,
    value: BigInt(`${integerPart}${decimalPart}` || '0'),
  };
};

const compareDecimalStrings = (left: string, right: string) => {
  const leftParts = parseDecimalParts(left);
  const rightParts = parseDecimalParts(right);
  if (!leftParts || !rightParts) return 0;

  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftValue = leftParts.value * (10n ** BigInt(scale - leftParts.scale));
  const rightValue = rightParts.value * (10n ** BigInt(scale - rightParts.scale));

  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? 1 : -1;
};

const divideDecimalStrings = (numerator: string, denominator: string, precision = 6) => {
  const numeratorParts = parseDecimalParts(numerator);
  const denominatorParts = parseDecimalParts(denominator);
  if (!numeratorParts || !denominatorParts || denominatorParts.value === 0n) return null;

  const precisionFactor = 10n ** BigInt(precision);
  const scaledNumerator = numeratorParts.value * precisionFactor * (10n ** BigInt(denominatorParts.scale));
  const scaledDenominator = denominatorParts.value * (10n ** BigInt(numeratorParts.scale));
  const quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  const roundedQuotient = remainder * 2n >= scaledDenominator ? quotient + 1n : quotient;

  const integerPart = roundedQuotient / precisionFactor;
  const decimalPart = (roundedQuotient % precisionFactor).toString().padStart(precision, '0').replace(/0+$/, '');

  return decimalPart ? `${integerPart.toString()}.${decimalPart}` : integerPart.toString();
};

export const multiplyDecimalStrings = (a: string, b: string, maxDecimals = 3) => {
  const aParts = parseDecimalParts(a);
  const bParts = parseDecimalParts(b);
  if (!aParts || !bParts) return null;
  const product = aParts.value * bParts.value;
  const totalScale = aParts.scale + bParts.scale;
  const str = product.toString().padStart(totalScale + 1, '0');
  const intPart = totalScale ? str.slice(0, -totalScale) : str;
  let decPart = totalScale ? str.slice(-totalScale) : '';
  if (decPart.length > maxDecimals) {
    decPart = decPart.slice(0, maxDecimals);
  }
  return decPart ? `${intPart}.${decPart}` : intPart;
};


export const formatCalculatedDecimal = (normalized: string, minimumFractionDigits = 2) => {
  const [integerPart = '0', decimalPart = ''] = normalized.split('.');
  const trimmedDecimal = decimalPart.replace(/0+$/, '');
  const finalDecimal = trimmedDecimal.length
    ? trimmedDecimal.length < minimumFractionDigits
      ? trimmedDecimal.padEnd(minimumFractionDigits, '0')
      : trimmedDecimal
    : minimumFractionDigits
      ? ''.padEnd(minimumFractionDigits, '0')
      : '';

  return finalDecimal ? `${integerPart}.${finalDecimal}` : integerPart;
};

export const parseExactAmountInput = (value: string) => {
  const normalized = normalizeAmountInput(value);
  if (!normalized || !/^(?:\d+|\d*\.\d+)$/.test(normalized)) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;

  return { amount, normalized, normalizedForMath: normalizeDecimalForMath(normalized) ?? normalized };
};

export const formatExactAmount = (normalized: string) => {
  const [integerPart = '0', decimalPart] = normalized.split('.');
  const sanitizedInteger = (integerPart || '0').replace(/^0+(?=\d)/, '') || '0';
  const groupedInteger = sanitizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return decimalPart !== undefined ? `${groupedInteger}.${decimalPart}` : groupedInteger;
};

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

export function normalizeDateString(input: string | null | undefined): string {
  if (!input) return '';
  const s = String(input).trim();
  if (!s) return '';
  // Match dd<sep>mm-or-monthname<sep>yy(yy)
  const m = s.match(/^(\d{1,2})[/\\-\\s.]+([A-Za-z]+|\d{1,2})[/\\-\\s.]+(\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    let mm = m[2];
    if (/^[A-Za-z]+$/.test(mm)) {
      const key = mm.toLowerCase().slice(0, mm.toLowerCase().startsWith('sept') ? 4 : 3);
      mm = MONTH_MAP[key] || MONTH_MAP[mm.toLowerCase().slice(0, 3)] || '01';
    } else {
      mm = mm.padStart(2, '0');
    }
    let yy = m[3];
    if (yy.length === 2) yy = `20${yy}`;
    else if (yy.length !== 4) yy = `20${yy.padStart(2, '0')}`;
    return `${dd}/${mm}/${yy}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear());
    return `${dd}/${mm}/${yy}`;
  }
  return s;
}

export function todayDDMMYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function InvoiceGenerator() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const blInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const [blFile, setBlFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [companyPrice, setCompanyPrice] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [balesCount, setBalesCount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => todayDDMMYY());
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [blData, setBlData] = useState<BLData | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templateLayout, setTemplateLayout] = useState<TemplateLayout | null>(null);
  const [extractingTemplate, setExtractingTemplate] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [matchedRow, setMatchedRow] = useState<ExcelRow | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const templateStorageKey = user?.id ? `invoice-template:${user.id}` : null;
  const excelStorageKey = user?.id ? `invoice-excel:${user.id}` : null;

  // Restore persisted Excel rows on mount so Single BL and Multi-BL share the same Excel.
  useEffect(() => {
    if (!excelStorageKey) return;
    try {
      const raw = window.localStorage.getItem(excelStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { rows: ExcelRow[]; fileName: string | null };
      if (Array.isArray(parsed?.rows) && parsed.rows.length > 0) {
        setExcelRows(parsed.rows);
        setExcelFileName(parsed.fileName ?? null);
      }
    } catch (e) {
      console.error('Failed to restore saved excel:', e);
    }
  }, [excelStorageKey]);

  useEffect(() => {
    if (!templateStorageKey) return;

    let cancelled = false;

    const restoreTemplate = async () => {
      try {
        const savedTemplate = await loadPersistedInvoiceTemplate(templateStorageKey);
        if (!savedTemplate || cancelled) return;

        const restoredFile = new File([savedTemplate.blob], savedTemplate.name, {
          type: savedTemplate.type,
          lastModified: Date.now(),
        });

        setTemplateFile(restoredFile);
        setTemplateLayout(savedTemplate.layout ?? null);
      } catch (error) {
        console.error('Failed to restore saved invoice template:', error);
      }
    };

    void restoreTemplate();

    return () => {
      cancelled = true;
    };
  }, [templateStorageKey]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  // Auto-open Excel upload picker when arriving with ?upload=excel
  useEffect(() => {
    if (authLoading || !user) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('upload') === 'excel') {
      const t = window.setTimeout(() => excelInputRef.current?.click(), 350);
      // Strip the param so refresh doesn't reopen the picker
      const url = new URL(window.location.href);
      url.searchParams.delete('upload');
      window.history.replaceState({}, '', url.toString());
      return () => window.clearTimeout(t);
    }
  }, [authLoading, user]);

  if (authLoading || !user) return <div className="min-h-screen bg-background" />;

  const handleBLUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!valid.includes(file.type)) {
      toast.error('Please upload a PDF or Image file');
      return;
    }
    setBlFile(file);
    setBlData(null);
  };




const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setTemplateFile(file);

  const name = file.name.toLowerCase();
  const isDocx = name.endsWith('.docx') || name.endsWith('.doc') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isDocx) {
    // DOCX -> Adobe handles merge tags inside the document. Skip AI layout extraction.
    setTemplateLayout(null);
    if (templateStorageKey) {
      try {
        await savePersistedInvoiceTemplate(templateStorageKey, {
          blob: file,
          layout: null,
          name: file.name,
          type: file.type,
        });
      } catch (storageError) {
        console.error('Failed to persist invoice template:', storageError);
      }
    }
    toast.success('Word template ready. Adobe API merge tags ({{invoice_number}} etc.) ka use karega — spacing & stamp 100% same.');
    return;
  }

  setExtractingTemplate(true);
  let extractedLayout: TemplateLayout | null = null;
  try {
    const base64 = await readFileAsBase64(file);

    const { data, error } = await supabase.functions.invoke('extract-template-layout', {
      body: { fileBase64: base64, mimeType: file.type },
    });

    if (error) throw error;

    extractedLayout = data;
    setTemplateLayout(data);
    toast.success('PDF template mapped. Original PDF ke upar text overlay hoga — stamp & spacing 100% same.');
  } catch (err: any) {
    console.error('Template extraction error:', err);
    setTemplateLayout(null);
    toast.warning(err.message || 'Template AI mapping fail hua. Fallback line-free layout use hoga.');
  } finally {
    if (templateStorageKey) {
      try {
        await savePersistedInvoiceTemplate(templateStorageKey, {
          blob: file,
          layout: extractedLayout,
          name: file.name,
          type: file.type,
        });
      } catch (storageError) {
        console.error('Failed to persist invoice template:', storageError);
      }
    }
    setExtractingTemplate(false);
  }
};


  const extractBLData = async () => {
    if (!blFile) return;
    setExtracting(true);
    try {
      let rawPdfText = '';
      let localExtracted: any = null;
      const isPdf = blFile.type === 'application/pdf' || blFile.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        try {
          rawPdfText = await extractRawTextFromPdf(blFile);
          if (rawPdfText && rawPdfText.trim().length > 0) {
            localExtracted = parseBlText(rawPdfText);
          }
        } catch (pdfErr) {
          console.warn('PDF direct text read warning:', pdfErr);
        }
      }

      let data: any = null;
      try {
        const base64 = await readFileAsBase64(blFile);
        const { data: aiData, error } = await supabase.functions.invoke('extract-bl-data', {
          body: { fileBase64: base64, mimeType: blFile.type },
        });
        if (error) throw error;
        data = aiData;
      } catch (aiErr: any) {
        console.warn('AI edge function warning:', aiErr?.message);
        if (localExtracted && (localExtracted.kgs || localExtracted.container_numbers.length > 0)) {
          data = localExtracted;
          toast.info('Extracted BL details with local analysis engine.');
        } else {
          throw aiErr;
        }
      }

      // Merge and cross-verify with document ground truth
      if (localExtracted && data) {
        data = {
          ...localExtracted,
          ...data,
          kgs: data.kgs ?? localExtracted.kgs,
          raw_weight_text: data.raw_weight_text || localExtracted.raw_weight_text,
          bales: data.bales ?? localExtracted.bales,
          packages: data.packages || localExtracted.packages,
          container_numbers: Array.from(
            new Set([
              ...(Array.isArray(data.container_numbers) ? data.container_numbers : []),
              ...(localExtracted.container_numbers || []),
            ]),
          ),
          bl_number: data.bl_number || localExtracted.bl_number,
          vessel_name: data.vessel_name || localExtracted.vessel_name,
          port_of_loading: data.port_of_loading || localExtracted.port_of_loading,
          port_of_discharge: data.port_of_discharge || localExtracted.port_of_discharge,
          shipper: data.shipper || localExtracted.shipper,
          consignee: data.consignee || localExtracted.consignee,
          notify_party: data.notify_party || localExtracted.notify_party,
        };
        data = sanitizeAndVerifyBlData(data, rawPdfText);
      } else if (rawPdfText && data) {
        data = sanitizeAndVerifyBlData(data, rawPdfText);
      }

      // Merge notify party name + address into a single field (avoid duplicate address)
      const notifyName = (data?.notify_party || '').trim();
      const notifyAddr = (data?.notify_party_address || '').trim();
      const notifyAlreadyHasAddr = notifyAddr && notifyName.toLowerCase().includes(notifyAddr.toLowerCase());
      const mergedNotify = notifyAlreadyHasAddr || !notifyAddr
        ? notifyName
        : [notifyName, notifyAddr].filter(Boolean).join('\n');

      // Clean goods description: strip "SAID TO CONTAIN ..." prefixes
      let cleanedDescription = (data?.description || '').trim();
      if (cleanedDescription) {
        cleanedDescription = cleanedDescription
          .replace(/^SAID\s+TO\s+CONTAIN[^A-Za-z]*\d*\s*X?\s*\d*[A-Z0-9]*\s*(?:\d*\s*BALES?)?\s*[:-]?\s*/i, '')
          .replace(/^(?:STC|CONTAINING|SHIPPER'S\s+LOAD\s*[,/&]?\s*STOW\s*[,/&]?\s*COUNT|FCL\s*[/]?\s*FCL|PARTICULARS\s+FURNISHED\s+BY\s+SHIPPER)\s*[:-]?\s*/i, '')
          .trim();
      }

      // Check whether the original BL actually mentions MIX or MIXED
      const docHasMix = /\bMIX(?:ED)?\b/i.test(rawPdfText || cleanedDescription);
      if (!docHasMix && /\bMIX(?:ED)?\s+USED\s+CLOTHING\b/i.test(cleanedDescription)) {
        cleanedDescription = cleanedDescription.replace(/\bMIX(?:ED)?\s+USED\s+CLOTHING\b/gi, 'USED CLOTHING');
      }

      // Semantic goods description: split combined descriptions into product groups
      // and rebuild an invoice-ready block with HS codes + calculated weights.
      const rawGroups: Array<{ name: string; hs_code?: string | null }> =
        Array.isArray((data as any)?.product_groups) && (data as any).product_groups.length
          ? (data as any).product_groups
          : splitDescriptionFallback(cleanedDescription).map((n) => ({ name: n }));

      const aiGroups = rawGroups.map((g) => ({
        ...g,
        name: !docHasMix && /\bMIX(?:ED)?\s+USED\s+CLOTHING\b/i.test(g.name) ? 'USED CLOTHING' : g.name,
      }));

      const composed = composeGoodsDescription(
        aiGroups,
        data?.kgs ?? null,
        cleanedDescription,
        (data as any)?.raw_weight_text,
      );
      const finalDescription = composed.lines.length > 0 && composed.text ? composed.text : cleanedDescription;
      const finalHsCode = composed.lines.length > 0 ? (data?.hs_code || '') : (data?.hs_code || composed.primaryHs || '');

      const normalizedData = {
        ...data,
        container_numbers: cleanContainerList(data?.container_numbers),
        notify_party: mergedNotify,
        notify_party_address: '',
        description: finalDescription,
        hs_code: finalHsCode,
        goods_lines: composed.lines,
      };

      if (data.kgs) {
        setBlData(normalizedData);
        if (data.bales) setBalesCount(String(data.bales));
        if (data.bl_number) setInvoiceNumber(data.bl_number);
        if (data.bl_date) setInvoiceDate(normalizeDateString(data.bl_date));
        setStep(2);
        toast.success(`KGS extracted: ${data.kgs} kg`);
        tryAutoFillFromExcel(normalizedData.container_numbers || []);
      } else {
        setBlData(normalizedData);
        toast.error('Could not extract weight (KGS) from the BL. Please check the file.');
        tryAutoFillFromExcel(normalizedData.container_numbers || []);
      }
    } catch (err: any) {
      console.error('BL extraction error:', err);
      toast.error('Failed to extract BL data: ' + (err.message || 'Unknown error'));
    } finally {
      setExtracting(false);
    }
  };

  const calculateValues = () => {
    if (!blData?.kgs || !companyPrice) return null;
    const parsedAmount = parseExactAmountInput(companyPrice);
    if (!parsedAmount) return null;
    const normalizedWeight = normalizeDecimalForMath(String(blData.kgs));
    if (!normalizedWeight) return null;

    // Unit Price = Company Total Price ÷ Weight, TRUNCATED to exactly 2 decimals
    const companyPriceNum = Number(parsedAmount.normalizedForMath);
    const weightNum = Number(normalizedWeight);
    if (!isFinite(companyPriceNum) || !isFinite(weightNum) || weightNum === 0) return null;
    const rawUnitPrice = companyPriceNum / weightNum;
    const truncatedUnitPrice = Math.floor(rawUnitPrice * 100) / 100;
    const unitPriceNum = truncatedUnitPrice < 0.42 ? 0.42 : truncatedUnitPrice;
    const unitPriceTextExact = unitPriceNum.toFixed(2); // always 2 decimals after truncation: 0.40, 0.53, 1.00

    // Total = displayed unit price × weight, truncated to 3 decimals with no post-rounding
    const computedTotalRaw = multiplyDecimalStrings(unitPriceTextExact, normalizedWeight, 3) ?? parsedAmount.normalized;
    const computedTotalText = formatCalculatedDecimal(computedTotalRaw, 3);

    return {
      unitPrice: unitPriceNum,
      unitPriceText: unitPriceTextExact,
      totalPriceDisplay: formatExactAmount(computedTotalText),
      totalPriceText: computedTotalText,
      kgs: blData.kgs,
    };
  };



const generateInvoicePDF = async (calc: {
  unitPrice: number;
  unitPriceText: string;
  totalPriceDisplay: string;
  totalPriceText: string;
  kgs: number;
}) => {
  const invNum = invoiceNumber || `INV-${Date.now()}`;
  const bales = balesCount || blData?.bales || '';
  const date = invoiceDate;
  const containerNums = blData?.container_numbers?.join(', ') || '';
  const containerSize = blData?.container_size || '';
  const templateMetrics = await getTemplatePageMetrics(templateFile);
  const pageFormat = templateMetrics
    ? getPdfPageFormat(templateMetrics.width, templateMetrics.height)
    : DEFAULT_PAGE_FORMAT;
  const doc = new jsPDF({
    orientation: pageFormat[0] > pageFormat[1] ? 'landscape' : 'portrait',
    unit: 'mm',
    format: pageFormat,
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const fontScale = Math.min(pageWidth / DEFAULT_PAGE_FORMAT[0], pageHeight / DEFAULT_PAGE_FORMAT[1]);
  const resolvedLayout = resolveTemplateLayout(templateLayout);
  const fieldMap = new Map<TemplateFieldKey, TemplateFieldLayout>(
    (resolvedLayout.fields ?? []).map((field) => [field.key, field] as const),
  );
  const imageRegionMap = new Map<'logo' | 'stamp', TemplateBox>(
    (resolvedLayout.image_regions ?? []).map((region) => [region.key, region.box] as const),
  );
  const templateCanvas = templateFile ? await renderTemplateFileToCanvas(templateFile, 2) : null;
  const shipperBlock = [blData?.shipper, blData?.shipper_address].filter(Boolean).join('\n');
  const consigneeBlock = [blData?.consignee, blData?.consignee_address].filter(Boolean).join('\n');
  const notifyBlock = blData?.notify_party || [blData?.consignee, blData?.consignee_address].filter(Boolean).join('\n');
  const referenceBlock = [
    blData?.bl_number ? `BL NO: ${blData.bl_number}` : '',
    containerNums ? `CONTAINER: ${containerNums}` : '',
    blData?.shipping_marks ? `MARKS: ${blData.shipping_marks}` : '',
  ].filter(Boolean).join('\n');

  doc.setTextColor(0);

  const drawBoxContent = (
    box: TemplateBox | null | undefined,
    textValue: string,
    fallbackFontSize: number,
    options: { align?: PdfTextAlign; bold?: boolean; maxLines?: number } = {},
  ) => {
    const normalizedText = normalizePdfText(textValue);
    const normalizedBox = normalizeTemplateBox(box);
    if (!normalizedText || !normalizedBox) return;

    const boxWidthMm = normalizedBox.w * pageWidth;
    const boxHeightMm = normalizedBox.h * pageHeight;
    const paddingX = Math.min(Math.max(boxWidthMm * 0.025, 0.7), 1.8);
    const paddingY = Math.min(Math.max(boxHeightMm * 0.08, 0.45), 1.4);
    const contentWidthMm = Math.max(1, boxWidthMm - paddingX * 2);
    const contentHeightMm = Math.max(1, boxHeightMm - paddingY * 2);
    const align = options.align ?? normalizedBox.align ?? 'left';
    const bold = options.bold ?? normalizedBox.bold ?? false;
    const requestedFontSize = Math.max(6, (normalizedBox.font_size ?? fallbackFontSize) * fontScale);
    const hardCapLines = normalizedBox.max_lines ?? options.maxLines;

    // Auto-shrink: use inner padding + ellipsis fallback so text never bleeds into adjacent cells.
    const MIN_FONT = 5.5;
    let chosenFontSize = requestedFontSize;
    let chosenLineHeight = chosenFontSize * 0.38 + 0.55;
    let chosenLines: string[] = [];

    for (let fs = requestedFontSize; fs >= MIN_FONT; fs -= 0.5) {
      doc.setFont(PDF_FONT_FAMILY, bold ? 'bold' : 'normal');
      doc.setFontSize(fs);
      const lh = fs * 0.38 + 0.55;
      const fitLinesByHeight = Math.max(1, Math.floor(contentHeightMm / lh));
      const lineCap = Math.min(
        typeof hardCapLines === 'number' ? hardCapLines : Infinity,
        fitLinesByHeight,
      );
      const wrapped = wrapPdfText(doc, normalizedText, contentWidthMm);
      if (wrapped.length <= lineCap || fs - 0.5 < MIN_FONT) {
        chosenFontSize = fs;
        chosenLineHeight = lh;
        chosenLines = clampPdfLines(doc, wrapped, lineCap, contentWidthMm);
        break;
      }
    }

    const usedHeight = chosenLines.length * chosenLineHeight;
    const topPad = Math.max(0, (contentHeightMm - usedHeight) / 2);
    const startX = normalizedBox.x * pageWidth + paddingX;
    const startY = normalizedBox.y * pageHeight + paddingY;
    const baselineY = startY + topPad + chosenFontSize * 0.32 + 0.35;

    doc.setFont(PDF_FONT_FAMILY, bold ? 'bold' : 'normal');
    doc.setFontSize(chosenFontSize);
    chosenLines.forEach((line, index) => {
      const lineX =
        align === 'left'
          ? startX
          : align === 'center'
            ? startX + contentWidthMm / 2
            : startX + contentWidthMm;
      doc.text(line, lineX, baselineY + index * chosenLineHeight, { align });
    });
  };

  const addTemplateRegion = (key: 'logo' | 'stamp') => {
    if (!templateCanvas) return;

    const box = imageRegionMap.get(key);
    if (!box) return;

    const dataUrl = extractRegionFromCanvas(templateCanvas, box);
    if (!dataUrl) return;

    doc.addImage(
      dataUrl,
      'PNG',
      box.x * pageWidth,
      box.y * pageHeight,
      box.w * pageWidth,
      box.h * pageHeight,
    );
  };

  const drawField = (
    key: TemplateFieldKey,
    value: string,
    fallbackLabel: string,
    fallbackFontSize: number,
    options: { valueBold?: boolean; labelBold?: boolean; valueAlign?: PdfTextAlign; maxLines?: number } = {},
  ) => {
    const field = fieldMap.get(key);
    if (!field) return;

    const labelText = normalizePdfText(field.label || fallbackLabel);
    if (field.label_box && labelText) {
      drawBoxContent(field.label_box, labelText, 8, { bold: options.labelBold ?? true, maxLines: 2 });
    }

    if (field.value_box && value) {
      drawBoxContent(field.value_box, value, fallbackFontSize, {
        bold: options.valueBold ?? false,
        align: options.valueAlign,
        maxLines: options.maxLines,
      });
    }
  };

  addTemplateRegion('logo');
  addTemplateRegion('stamp');

  (resolvedLayout.static_texts ?? []).forEach((item) => {
    drawBoxContent(item.box, item.text, item.box.font_size ?? 9, {
      bold: item.box.bold ?? false,
      align: item.box.align ?? 'left',
      maxLines: item.box.max_lines ?? 3,
    });
  });

  const titleAlreadyRendered = (resolvedLayout.static_texts ?? []).some((item) => (
    item.text.trim().toLowerCase() === normalizePdfText(resolvedLayout.title || '').toLowerCase()
  ));

  if (!titleAlreadyRendered && resolvedLayout.title) {
    drawBoxContent(
      createNormalizedBox(45, 10, 120, 12, { align: 'center', font_size: 16, max_lines: 2, bold: true }),
      resolvedLayout.title,
      16,
      { align: 'center', bold: true, maxLines: 2 },
    );
  }

  drawField('invoice_number', invNum, 'Invoice No.', 9);
  drawField('date', date, 'Date', 9);
  drawField('shipper', shipperBlock, 'SHIPPER', 8.5, { maxLines: 7 });
  drawField('notify_party', notifyBlock, 'NOTIFY PARTY', 8.5, { maxLines: 7 });
  drawField('consignee', consigneeBlock, 'CONSIGNEE', 8.5, { maxLines: 7 });
  drawField('container_info', [containerSize, containerNums].filter(Boolean).join('\n'), 'CONTAINER / SIZE', 9, { maxLines: 5 });
  drawField('vessel', blData?.vessel_name || '', 'VESSEL / FLIGHT', 9, { maxLines: 2 });
  drawField('hs_code', blData?.hs_code || '', 'HS CODE', 9, { maxLines: 2 });
  drawField('port_of_loading', blData?.port_of_loading || '', 'PORT OF LOADING', 9, { maxLines: 3 });
  drawField('port_of_discharge', blData?.port_of_discharge || '', 'PORT OF DISCHARGE / DESTINATION', 9, { maxLines: 3 });
  drawField('goods_description', blData?.description || '', 'GOODS DESCRIPTION', 8.5, {
    maxLines: resolvedLayout.has_shipping_marks === false ? 8 : 5,
  });

  if (resolvedLayout.has_shipping_marks !== false || blData?.shipping_marks) {
    drawField('shipping_marks', blData?.shipping_marks || '', 'SHIPPING MARKS', 8.5, { maxLines: 3 });
  }

  drawField(
    'packages',
    bales ? `${bales} BALES` : blData?.packages || '',
    resolvedLayout.has_bales_packages === false ? 'PACKAGES' : 'NO. & KIND OF PKGS',
    10,
    { valueBold: true, valueAlign: 'center', maxLines: 2 },
  );
  drawField(
    'gross_weight',
    `${calc.kgs.toFixed(4)} KGS`,
    resolvedLayout.has_weight_pricing === false ? 'WEIGHT' : 'G.WEIGHT',
    9.5,
    { valueAlign: 'right' },
  );
  drawField('unit_price', `${calc.unitPriceText} US$ PER KG`, 'UNIT PRICE', 9.5, { valueAlign: 'right' });
  drawField('amount', `${calc.totalPriceDisplay} US$`, 'AMOUNT', 11, { valueBold: true, valueAlign: 'right' });
  drawField('reference', referenceBlock, 'REFERENCE', 8.5, { maxLines: 5 });
  drawField('company_name', blData?.shipper || 'COMPANY NAME', '', 10, { valueBold: true, valueAlign: 'center', maxLines: 1 });

  return doc;
};

  const getContainerForFilename = (): string => {
    const container = blData?.container_numbers?.[0]?.trim();
    if (container) {
      return container.replace(/[\\/:*?"<>|\r\n\t]/g, '');
    }
    const bl = blData?.bl_number?.trim();
    if (bl) {
      return bl.replace(/[\\/:*?"<>|\r\n\t]/g, '');
    }
    return new Date().toISOString().split('T')[0].replace(/-/g, '');
  };

  const downloadOriginalBlFile = async () => {
    if (!blFile) return;
    const container = getContainerForFilename();
    const ext = blFile.name.includes('.') ? blFile.name.split('.').pop() : 'pdf';
    const filename = `BL ${container}.${ext}`;

    let fileToDownload: Blob = blFile;
    if (blFile.size >= 1024 * 1024) {
      try {
        fileToDownload = await compressBlFile(blFile);
      } catch (e) {
        console.warn('BL compression error:', e);
      }
    }

    const url = URL.createObjectURL(fileToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateInvoice = async () => {
    const calc = calculateValues();
    if (!calc) {
      toast.error('Please fill all required fields');
      return;
    }
    setGenerating(true);
    try {
      const invNum = invoiceNumber || `INV-${Date.now()}`;
      const containerNums = blData?.container_numbers?.join(', ') || '';
      const firstContainer = blData?.container_numbers?.[0] || '';
      const containerSize = blData?.container_size || '';
      const bales = balesCount || blData?.bales || '';

      // Adobe Document Generation merge tags
      const adobeData = {
        invoice_number: invNum,
        date: invoiceDate,
        shipper: blData?.shipper || '',
        shipper_address: blData?.shipper_address || '',
        consignee: blData?.consignee || '',
        consignee_address: blData?.consignee_address || '',
        notify_party: blData?.notify_party || blData?.consignee || '',
        notify_party_address: blData?.notify_party_address || blData?.consignee_address || '',
        container_size: containerSize,
        container_numbers: containerNums,
        container_numbers_one: firstContainer,
        vessel: blData?.vessel_name || '',
        port_of_loading: blData?.port_of_loading || '',
        port_of_discharge: blData?.port_of_discharge || '',
        hs_code: blData?.hs_code || '',
        goods_description: blData?.description || '',
        // One tag per detected product category (unlimited categories: 1..8)
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            `goods_description_${i + 1}`,
            (blData as any)?.goods_lines?.[i]?.text || '',
          ]),
        ),
        gross_weight: `${calc.kgs}KGS`,
        unit_price: `${calc.unitPriceText}US$ Per KG`,
        amount: `${calc.totalPriceText}$`,
        shipping_marks: blData?.shipping_marks || 'NIL',
        packages: bales ? `${bales} BALES` : (blData?.packages || ''),
        company_name: blData?.shipper || '',
      };

      // Determine route: user PDF template -> overlay; user DOCX -> Adobe with their template; else built-in Adobe
      const tplName = (templateFile?.name || '').toLowerCase();
      const isUserPdf = templateFile && (templateFile.type === 'application/pdf' || tplName.endsWith('.pdf'));
      const isUserDocx = templateFile && (
        tplName.endsWith('.docx') || tplName.endsWith('.doc') ||
        templateFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      let pdfBase64: string | undefined;

      if (isUserPdf) {
        // Overlay text on user's PDF (stamp + lines + spacing preserved)
        // Combine name + address into single block for layout fields that hold both
        const overlayData = {
          ...adobeData,
          shipper: [blData?.shipper, blData?.shipper_address].filter(Boolean).join('\n'),
          consignee: [blData?.consignee, blData?.consignee_address].filter(Boolean).join('\n'),
          notify_party: [
            blData?.notify_party || blData?.consignee,
            blData?.notify_party_address || blData?.consignee_address,
          ].filter(Boolean).join('\n'),
        };
        const templateBase64 = await readFileAsBase64(templateFile!);
        const resolved = resolveTemplateLayout(templateLayout);
        const { data, error } = await supabase.functions.invoke('generate-invoice-overlay', {
          body: { templateBase64, data: overlayData, fields: resolved.fields ?? [] },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'PDF overlay failed');
        pdfBase64 = data.pdfBase64;
      } else {
        // Adobe Document Generation (DOCX template — user's or built-in)
        const templateBase64 = isUserDocx ? await readFileAsBase64(templateFile!) : undefined;
        const { data, error } = await supabase.functions.invoke('generate-invoice-adobe', {
          body: { data: adobeData, templateBase64 },
        });
        if (error) throw error;
        if (!data?.success || !data?.pdfBase64) throw new Error(data?.error || 'Adobe generation failed');
        if (Array.isArray(data.missingPlaceholders) && data.missingPlaceholders.length > 0) {
          console.warn('Unmapped template placeholders:', data.missingPlaceholders);
          toast.warning(
            `${data.missingPlaceholders.length} template placeholder(s) not mapped: ${data.missingPlaceholders.slice(0, 8).join(', ')}`,
          );
        }
        pdfBase64 = data.pdfBase64;
      }

      const bin = atob(pdfBase64!);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const container = getContainerForFilename();
      a.download = `Invoice ${container}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Download original BL file (compressed if >= 1MB)
      await downloadOriginalBlFile();

      // Auto-create NOC tracking record(s) for each container in the BL
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        const containers = blData?.container_numbers?.filter(Boolean) || [];
        if (uid && containers.length > 0) {
          const rows = containers.map((c) => ({
            user_id: uid,
            container_number: c,
            bl_number: blData?.bl_number || null,
            invoice_number: invNum,
            status: 'Pending Approval',
          }));
          const { error: nocErr } = await supabase.from('noc_records').insert(rows);
          if (nocErr) console.error('NOC auto-create failed:', nocErr);
        }
      } catch (nocErr) {
        console.error('NOC auto-create error:', nocErr);
      }

      setStep(3);
      toast.success('Invoice generated via Adobe!');
    } catch (err: any) {
      console.error('Invoice generation error:', err);
      toast.error(`Failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  };

  const removeSavedTemplate = async () => {
    try {
      if (templateStorageKey) {
        await removePersistedInvoiceTemplate(templateStorageKey);
      }
      setTemplateFile(null);
      setTemplateLayout(null);
      if (templateInputRef.current) templateInputRef.current.value = '';
      toast.success('Saved template removed.');
    } catch (error) {
      console.error('Failed to remove saved template:', error);
      toast.error('Template remove nahi hua. Dobara try karein.');
    }
  };

  const resetAll = () => {
    setBlFile(null);
    setCompanyPrice('');
    setInvoiceNumber('');
    setBalesCount('');
    setBlData(null);
    setStep(1);
    setInvoiceDate(todayDDMMYY());
    setMatchedRow(null);
  };

  const tryAutoFillFromExcel = (containerNumbers: string[]) => {
    if (!excelRows.length || !containerNumbers || containerNumbers.length === 0) return;
    const keys = containerNumbers.map((c) => cleanContainerNumber(c) || normalizeContainerKey(c)).filter(Boolean);
    const found = excelRows.find((row) => {
      const k = cleanContainerNumber(row.container) || normalizeContainerKey(row.container);
      return keys.includes(k);
    });
    if (found) {
      setMatchedRow(found);
      if (found.invoice) setInvoiceNumber(found.invoice);
      if (found.price) setCompanyPrice(found.price);
      toast.success(`Matched container ${found.container} from Excel.`);
    } else {
      setMatchedRow(null);
      toast.error('No matching container found in Excel.');
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls');
    if (!isCsv && !isXlsx) {
      toast.error('Please upload .xlsx, .xls or .csv file.');
      return;
    }
    setExcelLoading(true);
    try {
      let rows: string[][] = [];
      if (isCsv) {
        const text = await file.text();
        rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((line) => {
          const out: string[] = [];
          let cur = '';
          let inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
            cur += ch;
          }
          out.push(cur);
          return out.map((c) => c.trim());
        });
      } else {
        const ExcelJS = await import('exceljs');
        const buf = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const ws = wb.worksheets[0];
        if (ws) {
          ws.eachRow((row) => {
            const arr: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              const v = cell.value;
              if (v === null || v === undefined) { arr.push(''); return; }
              if (typeof v === 'object' && v !== null) {
                if ('text' in v && typeof (v as any).text === 'string') { arr.push((v as any).text); return; }
                if ('richText' in v && Array.isArray((v as any).richText)) {
                  arr.push(((v as any).richText as { text: string }[]).map((r) => r.text).join(''));
                  return;
                }
                if ('result' in v) { arr.push(String((v as any).result ?? '')); return; }
              }
              arr.push(String(v));
            });
            rows.push(arr.map((c) => (c ?? '').toString().trim()));
          });
        }
      }
      if (rows.length === 0) {
        toast.error('Excel file is empty.');
        return;
      }

      // Detect header row
      const header = rows[0].map((h) => h.toLowerCase());
      const findCol = (keywords: string[]) =>
        header.findIndex((h) => keywords.some((k) => h.includes(k)));
      let containerCol = findCol(['container']);
      let invoiceCol = findCol(['invoice']);
      let priceCol = findCol(['company price', 'total amount', 'total price', 'amount', 'price']);
      let dataStart = 1;
      if (containerCol === -1 && invoiceCol === -1 && priceCol === -1) {
        // No header — assume first 3 columns
        containerCol = 0; invoiceCol = 1; priceCol = 2;
        dataStart = 0;
      }
      const parsed: ExcelRow[] = [];
      for (let i = dataStart; i < rows.length; i++) {
        const r = rows[i];
        const container = containerCol >= 0 ? (r[containerCol] || '') : '';
        const invoice = invoiceCol >= 0 ? (r[invoiceCol] || '') : '';
        const price = priceCol >= 0 ? (r[priceCol] || '') : '';
        if (!container && !invoice && !price) continue;
        parsed.push({ container, invoice, price });
      }
      if (parsed.length === 0) {
        toast.error('No data rows found in Excel.');
        return;
      }
      setExcelRows(parsed);
      setExcelFileName(file.name);
      try {
        if (excelStorageKey) {
          window.localStorage.setItem(excelStorageKey, JSON.stringify({ rows: parsed, fileName: file.name }));
        }
      } catch (e) {
        console.error('Failed to persist excel:', e);
      }
      toast.success('Excel data loaded successfully.');

      // If BL already extracted, try matching now
      if (blData?.container_numbers?.length) {
        const keys = blData.container_numbers.map((c) => cleanContainerNumber(c) || normalizeContainerKey(c)).filter(Boolean);
        const found = parsed.find((row) => keys.includes(cleanContainerNumber(row.container) || normalizeContainerKey(row.container)));
        if (found) {
          setMatchedRow(found);
          if (found.invoice) setInvoiceNumber(found.invoice);
          if (found.price) setCompanyPrice(found.price);
        }
      }
    } catch (err: any) {
      console.error('Excel upload error:', err);
      toast.error('Failed to read Excel: ' + (err?.message || 'Unknown error'));
    } finally {
      setExcelLoading(false);
    }
  };

  const clearExcel = () => {
    setExcelRows([]);
    setExcelFileName(null);
    setMatchedRow(null);
    try {
      if (excelStorageKey) window.localStorage.removeItem(excelStorageKey);
    } catch (e) {
      console.error('Failed to clear persisted excel:', e);
    }
  };


  const calc = calculateValues();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <Header />
      <main className="container mx-auto px-3 sm:px-6 py-4 sm:py-8 max-w-7xl pb-28 lg:pb-12">
        {/* Top bar: back + steps */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/invoice-home')}
              className="rounded-full bg-white/80 backdrop-blur border-slate-200 shadow-sm hover:bg-white gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
            <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              All systems operational
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {[
              { num: 1, label: 'Upload BL' },
              { num: 2, label: 'Enter Details' },
              { num: 3, label: 'Invoice Ready' },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: step >= s.num ? 1 : 0.92 }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm transition-colors ${
                    step >= s.num
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-400'
                  }`}
                >
                  {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                </motion.div>
                <span className={`text-sm font-medium ${step >= s.num ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                {i < 2 && <ArrowRight className="w-4 h-4 text-slate-300 mx-1 hidden sm:inline" />}
              </div>
            ))}
          </div>
        </div>

        {/* Page Title + State preserved */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 sm:mb-8"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
              <Truck className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Single BL Invoice</h1>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" /> AI Powered
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Upload a single Bill of Lading file and generate invoice instantly using AI.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">State preserved across refresh</p>
              <p className="text-xs text-slate-500">Your files and selections are safe</p>
            </div>
          </div>
        </motion.div>

        {/* Multi-BL quick-link banner (preserves existing route) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/multi-bl-invoice')}
          className="mb-6 cursor-pointer rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 hover:from-indigo-500/15 hover:via-purple-500/15 hover:to-pink-500/15 px-4 py-3 flex items-center gap-3 group transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Need to process multiple BLs?</p>
            <p className="text-xs text-slate-500">Open Multi-BL Invoice — up to 10 files at once with the same workflow.</p>
          </div>
          <ArrowRight className="w-4 h-4 text-indigo-600 group-hover:translate-x-1 transition-transform" />
        </motion.div>

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* LEFT COLUMN */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5 min-w-0"
          >
            {/* Excel Auto-Fill */}
            <Card className="rounded-2xl border border-emerald-100 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-gradient-to-r from-emerald-50 to-transparent p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center shadow-sm">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base sm:text-lg text-emerald-700">Excel Auto-Fill (Optional)</CardTitle>
                    <CardDescription className="text-xs">
                      Upload Excel/CSV with Container, Invoice Number, Company Price — rows auto-fill after extraction.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
                <div
                  onClick={() => !excelLoading && excelInputRef.current?.click()}
                  className="border-2 border-dashed border-emerald-200 rounded-xl p-5 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
                >
                  {excelLoading ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-600">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">Reading Excel...</span>
                    </div>
                  ) : excelFileName ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-medium text-slate-900 truncate">{excelFileName}</p>
                          <p className="text-xs text-slate-500">{excelRows.length} rows loaded</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); clearExcel(); }}
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 mx-auto mb-2 flex items-center justify-center">
                        <Upload className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="font-medium text-slate-900">Click to upload Excel/CSV</p>
                      <p className="text-xs text-slate-500 mt-1">.xlsx, .xls, .csv</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Upload Bill of Lading */}
            <Card className="rounded-2xl border border-indigo-100 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-gradient-to-r from-indigo-50 via-purple-50/50 to-transparent p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-sm">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base sm:text-lg text-indigo-700">1. Upload Bill of Lading</CardTitle>
                    <CardDescription className="text-xs">Upload PDF or image file of your BL document</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <input ref={blInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleBLUpload} className="hidden" />
                <div
                  onClick={() => blInputRef.current?.click()}
                  className="shadow-neu-inset bg-card/60 rounded-2xl p-7 text-center cursor-pointer border border-border/40 hover:bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-card shadow-neu mx-auto mb-3 flex items-center justify-center border border-white/80 dark:border-white/10">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground">Click to upload BL file</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, JPG, JPEG, PNG</p>
                </div>

                {blFile && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 rounded-2xl border border-white/80 dark:border-white/10 bg-card shadow-neu-sm p-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-card shadow-neu-inset-sm flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{blFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(blFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  </motion.div>
                )}

                <Button
                  onClick={extractBLData}
                  disabled={!blFile || extracting}
                  className="w-full gap-2 h-11 shadow-neu-primary text-white"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Extracting data with AI...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Extract BL Data
                    </>
                  )}
                </Button>

                {/* Extracted Data */}
                <AnimatePresence>
                  {blData && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`rounded-2xl p-4 border border-white/80 dark:border-white/10 shadow-neu-sm bg-card`}>
                        <div className="flex items-center gap-2 mb-3">
                          {blData.kgs ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-rose-600" />
                          )}
                          <span className="font-semibold text-foreground">
                            {blData.kgs ? 'Data Extracted Successfully' : 'Weight not detected'}
                          </span>
                        </div>
                        {blData.kgs && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">Weight:</span>
                              <span className="font-medium text-slate-900">{blData.kgs} KGS</span>
                              {blData.bales != null && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                  {blData.bales} Bales
                                </span>
                              )}
                            </div>
                            {blData.consignee && (
                              <div><span className="text-slate-500">Consignee:</span> <span className="text-slate-900">{blData.consignee}</span></div>
                            )}
                            {blData.shipper && (
                              <div><span className="text-slate-500">Shipper:</span> <span className="text-slate-900">{blData.shipper}</span></div>
                            )}
                            {blData.port_of_discharge && (
                              <div><span className="text-slate-500">Discharge:</span> <span className="text-slate-900">{blData.port_of_discharge}</span></div>
                            )}
                            {blData.port_of_loading && (
                              <div><span className="text-slate-500">Loading:</span> <span className="text-slate-900">{blData.port_of_loading}</span></div>
                            )}
                            {blData.vessel_name && (
                              <div><span className="text-slate-500">Vessel:</span> <span className="text-slate-900">{blData.vessel_name}</span></div>
                            )}
                            {blData.bl_number && (
                              <div><span className="text-slate-500">BL #:</span> <span className="text-slate-900">{blData.bl_number}</span></div>
                            )}
                            {blData.notify_party && (
                              <div><span className="text-slate-500">Notify:</span> <span className="text-slate-900 truncate">{blData.notify_party}</span></div>
                            )}
                            {blData.container_numbers?.length > 0 && (
                              <div className="sm:col-span-2"><span className="text-slate-500">Container:</span> <span className="text-slate-900">{blData.container_numbers.join(', ')}</span></div>
                            )}
                            {blData.description && (
                              <div className="sm:col-span-2"><span className="text-slate-500">Goods:</span> <span className="text-slate-900">{blData.description}</span></div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* AI Powered note */}
                <div className="rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">AI-Powered Extraction</p>
                    <p className="text-xs text-slate-500">Our AI extracts key fields from your BL automatically.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* RIGHT COLUMN */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-5 min-w-0"
          >
            <Card className="rounded-2xl border border-amber-100 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base sm:text-lg text-amber-700">2. Invoice Details</CardTitle>
                    <CardDescription className="text-xs">Review and edit invoice information</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      Company Total Price ($)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={companyPrice}
                        onChange={(e) => setCompanyPrice(e.target.value)}
                        className="h-10 pl-7 rounded-lg border-slate-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Hash className="w-3.5 h-3.5 text-indigo-600" />
                      Invoice Number
                    </Label>
                    <Input
                      placeholder="INV-0000-0001"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="h-10 rounded-lg border-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Package className="w-3.5 h-3.5 text-purple-600" />
                      Bales
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={balesCount}
                      onChange={(e) => setBalesCount(e.target.value)}
                      className="h-10 rounded-lg border-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      Invoice Date
                    </Label>
                    <Input
                      placeholder="DD/MM/YYYY"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="h-10 rounded-lg border-slate-200"
                    />
                  </div>
                </div>

                {/* Editable BL Fields */}
                {blData && (
                  <details className="group rounded-xl border border-slate-200 bg-slate-50/60 open:bg-white">
                    <summary className="cursor-pointer list-none p-4 flex items-center gap-2 select-none">
                      <Wand2 className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-sm font-semibold text-slate-900 flex-1">Edit Invoice Fields</h4>
                      <ArrowRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Shipper</Label>
                          <Input value={blData.shipper ?? ''} onChange={(e) => setBlData({ ...blData, shipper: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Shipper Address</Label>
                          <Input value={blData.shipper_address ?? ''} onChange={(e) => setBlData({ ...blData, shipper_address: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Consignee</Label>
                          <Input value={blData.consignee ?? ''} onChange={(e) => setBlData({ ...blData, consignee: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Consignee Address</Label>
                          <Input value={blData.consignee_address ?? ''} onChange={(e) => setBlData({ ...blData, consignee_address: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-slate-600">Notify Party (Name & Address)</Label>
                          <Input value={blData.notify_party ?? ''} onChange={(e) => setBlData({ ...blData, notify_party: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Port of Loading</Label>
                          <Input value={blData.port_of_loading ?? ''} onChange={(e) => setBlData({ ...blData, port_of_loading: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Port of Discharge</Label>
                          <Input value={blData.port_of_discharge ?? ''} onChange={(e) => setBlData({ ...blData, port_of_discharge: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Vessel / Flight</Label>
                          <Input value={blData.vessel_name ?? ''} onChange={(e) => setBlData({ ...blData, vessel_name: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">HS Code</Label>
                          <Input value={blData.hs_code ?? ''} onChange={(e) => setBlData({ ...blData, hs_code: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">BL Number</Label>
                          <Input value={blData.bl_number ?? ''} onChange={(e) => setBlData({ ...blData, bl_number: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-slate-600">Container Numbers (comma separated)</Label>
                          <Input value={blData.container_numbers?.join(', ') ?? ''} onChange={(e) => setBlData({ ...blData, container_numbers: cleanContainerList(e.target.value.split(',')) })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-slate-600">Goods Description</Label>
                          <Input value={blData.description ?? ''} onChange={(e) => setBlData({ ...blData, description: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-slate-600">Shipping Marks</Label>
                          <Input value={blData.shipping_marks ?? ''} onChange={(e) => setBlData({ ...blData, shipping_marks: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Weight (KGS)</Label>
                          <Input
                            type="number"
                            value={blData.kgs ?? ''}
                            onChange={(e) => setBlData({ ...blData, kgs: e.target.value ? parseFloat(e.target.value) : null })}
                            className="h-9 rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Packages Text</Label>
                          <Input value={blData.packages ?? ''} onChange={(e) => setBlData({ ...blData, packages: e.target.value })} className="h-9 rounded-lg" />
                        </div>
                      </div>
                    </div>
                  </details>
                )}

                {/* Invoice Template upload */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs text-slate-600">
                    <FileUp className="w-3.5 h-3.5 text-indigo-600" />
                    Original Invoice Template (AI Exact Match)
                  </Label>
                  <input ref={templateInputRef} type="file" accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp" onChange={handleTemplateUpload} className="hidden" />
                  <div
                    onClick={() => !templateFile && templateInputRef.current?.click()}
                    className="border-2 border-dashed border-indigo-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-all"
                  >
                    {extractingTemplate ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        <span className="text-sm text-slate-500">Analyzing template layout...</span>
                      </div>
                    ) : templateFile ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-rose-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{templateFile.name}</p>
                            <p className="text-xs text-slate-500">{(templateFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={(e) => { e.stopPropagation(); void removeSavedTemplate(); }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="w-6 h-6 text-indigo-400 mx-auto mb-1" />
                        <p className="text-sm text-slate-500">Upload PDF or Word template — PDF gets overlay, DOCX uses Adobe merge tags</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Workflow chips */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 sm:mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3"
        >
          {[
            { label: 'BL Upload', icon: Upload, color: 'from-indigo-500 to-purple-500', done: !!blFile },
            { label: 'AI Extraction', icon: Sparkles, color: 'from-purple-500 to-pink-500', done: !!blData },
            { label: 'Excel Match', icon: FileSpreadsheet, color: 'from-emerald-500 to-teal-500', done: !!matchedRow },
            { label: 'Calculations', icon: Calculator, color: 'from-amber-500 to-orange-500', done: !!calc },
            { label: 'Template Mapping', icon: Layers, color: 'from-sky-500 to-indigo-500', done: !!templateFile },
            { label: 'PDF Generation', icon: FileCheck2, color: 'from-rose-500 to-pink-500', done: step === 3 },
            { label: 'NOC Tracking', icon: ShieldCheck, color: 'from-emerald-500 to-green-500', done: step === 3 },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-100 bg-white p-3 flex flex-col items-center gap-2 shadow-sm">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} text-white flex items-center justify-center shadow-sm`}>
                <c.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-slate-700 text-center">{c.label}</span>
              {c.done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-slate-200" />
              )}
            </div>
          ))}
        </motion.div>

        {/* Bottom 3 cards: Matched / Calculations / NOC */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
          {/* Matched Data */}
          <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base text-slate-900">3. Matched Data (Excel)</CardTitle>
                {matchedRow && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Auto Matched
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-2.5">
              {[
                { label: 'Invoice Number', value: matchedRow?.invoice || invoiceNumber || '—', color: 'text-emerald-600', dot: 'bg-emerald-500' },
                { label: 'Company Price', value: matchedRow?.price ? `$ ${matchedRow.price}` : (companyPrice ? `$ ${companyPrice}` : '—'), color: 'text-emerald-600', dot: 'bg-emerald-500' },
                { label: 'Unit Price', value: calc ? `$ ${calc.unitPriceText}` : '—', color: 'text-emerald-600', dot: 'bg-emerald-500' },
                { label: 'Currency', value: 'USD', color: 'text-amber-600', dot: 'bg-amber-500' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                    <span className="text-sm text-slate-600">{r.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{r.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Calculations */}
          <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base text-slate-900">4. Calculations</CardTitle>
                {calc && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Auto Calculated
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-slate-600">Weight (KGS)</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{calc ? calc.kgs : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-sm text-slate-600">Unit Price</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{calc ? `$ ${calc.unitPriceText}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-sm text-slate-600">Amount</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{calc ? `$ ${calc.totalPriceDisplay}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 px-3 py-3">
                <span className="text-sm font-semibold text-amber-700">Total Amount (USD)</span>
                <span className="text-base font-bold text-amber-700">{calc ? `$ ${calc.totalPriceDisplay}` : '—'}</span>
              </div>
            </CardContent>
          </Card>

          {/* NOC Tracker */}
          <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base text-slate-900">5. NOC Tracker</CardTitle>
              <CardDescription className="text-xs">Track NOC status for this invoice</CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 px-3 py-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">
                  {step === 3 ? 'NOC Ready to Track' : 'Pending Generation'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">NOC Number</span>
                <span className="font-medium text-slate-900">{invoiceNumber || '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Invoice Date</span>
                <span className="font-medium text-slate-900">{invoiceDate || '—'}</span>
              </div>
              <Button
                variant="outline"
                className="w-full mt-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2"
                onClick={() => navigate('/noc-tracker')}
              >
                <Eye className="w-4 h-4" />
                View NOC Details
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Generate + Download row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          <Card className="rounded-2xl border-0 shadow-md overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white relative">
            <div className="absolute -right-6 -bottom-6 opacity-20">
              <FileText className="w-40 h-40" />
            </div>
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" />
                <h3 className="font-bold text-lg">6. Generate Invoice</h3>
              </div>
              <p className="text-sm text-white/80 mb-4">Generate PDF invoice using template</p>
              <Button
                onClick={generateInvoice}
                disabled={!calc || generating}
                className="bg-white text-indigo-700 hover:bg-white/90 gap-2 font-semibold shadow-md hidden lg:inline-flex"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Generate PDF Invoice
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white relative">
            <div className="absolute -right-6 -bottom-6 opacity-10">
              <Download className="w-40 h-40 text-indigo-500" />
            </div>
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-2 mb-1">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-lg text-slate-900">7. Download Invoice</h3>
              </div>
              <p className="text-sm text-slate-500 mb-4">Download generated invoice</p>
              <Button
                onClick={generateInvoice}
                disabled={!calc || generating}
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2 font-semibold hidden lg:inline-flex"
                size="lg"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Success */}
        <AnimatePresence>
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/60 shadow-sm">
                <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Invoice Generated Successfully!</p>
                      <p className="text-sm text-slate-500">Your invoice PDF has been downloaded.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetAll} className="gap-2">
                      <RotateCcw className="w-4 h-4" /> Generate Another
                    </Button>
                    <Button onClick={generateInvoice} className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                      <Download className="w-4 h-4" /> Download Again
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer security note */}
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex items-center gap-2 text-xs text-indigo-700">
          <ShieldCheck className="w-4 h-4" />
          All data is securely saved and will remain available across refresh.
        </div>

        {/* Mobile sticky action bar */}
        {step >= 2 && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <Button
              onClick={generateInvoice}
              disabled={!calc || generating}
              className="w-full gap-2 h-12 text-sm font-semibold shadow-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : step === 3 ? (
                <>
                  <Download className="w-4 h-4" />
                  Download Invoice Again
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate & Download Invoice
                </>
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}


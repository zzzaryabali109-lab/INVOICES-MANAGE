import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Upload, Loader2, CheckCircle2, Download, AlertCircle, UploadCloud,
  FileText, Brain, Link2, Calculator, FileCheck2, Share2, Copy,
  Play, Trash2, BarChart3, Eye, Clock, XCircle, FileIcon, ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SuccessCelebrationModal } from '@/components/SuccessCelebrationModal';
import {
  cleanContainerNumber,
  cleanContainerList,
  resolveTemplateLayout,
  parseExactAmountInput,
  normalizeDecimalForMath,
  multiplyDecimalStrings,
  formatCalculatedDecimal,
  normalizeDateString,
  todayDDMMYY,
} from '@/pages/InvoiceGenerator';
import { splitDescriptionFallback, composeGoodsDescription } from '@/lib/goodsDescription';
import {
  extractRawTextFromPdf,
  parseBlText,
  sanitizeAndVerifyBlData,
} from '@/lib/pdfBlExtractor';
import { compressBlPdf, compressBlFile } from '@/lib/pdfCompressor';

const MAX_BULK_FILES = 20;
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

interface ExcelRow {
  container: string;
  invoice: string;
  price: string;
}

interface BulkBlUploadProps {
  excelRows: ExcelRow[];
  templateFile: File | null;
  templateLayout: any | null;
}

type BulkStatus = 'pending' | 'processing' | 'matched' | 'no_match' | 'failed' | 'done';

interface BulkBlItem {
  id: string;
  file: File;
  status: BulkStatus;
  liveStep?: string;
  message?: string;
  containerNumber?: string;
  blNumber?: string;
  invoiceNumber?: string;
  companyPrice?: string;
  weight?: number;
  blData?: any;
  pdfBase64?: string;
  compressedBlBlob?: Blob;
  progress?: number;
  uploadedAt?: number;
  extractedAt?: number;
  generatedAt?: number;
  nocAt?: number;
  processingDurationMs?: number;
}

// Global In-Memory Caches for maximum parallel processing speed
const aiExtractionCache = new Map<string, any>();
const localTextCache = new Map<string, { rawPdfText: string; localExtracted: any }>();
const compressedBlCache = new Map<string, Blob>();

const getFileSignature = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const normalizeKey = (s: string) =>
  (s || '').toString().toUpperCase().replace(/[\s\-_.,:;#'"]/g, '');

const readBase64 = (file: File | Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

function getTargetIdentifier(item: BulkBlItem): string {
  // Container/BL numbers must remain exactly as extracted
  // Do NOT add unnecessary underscores (_) or other separator symbols
  const container = (item.containerNumber || '').trim().replace(/[\\/:*?"<>|\r\n\t]/g, '');
  if (container) return container;
  const bl = (item.blNumber || '').trim().replace(/[\\/:*?"<>|\r\n\t]/g, '');
  if (bl) return bl;
  const baseName = item.file.name.replace(/\.[^/.]+$/, '').trim().replace(/[\\/:*?"<>|\r\n\t]/g, '');
  return baseName || 'UNKNOWN';
}

function getInvoiceFilename(item: BulkBlItem): string {
  const id = getTargetIdentifier(item);
  return `Invoice ${id}.pdf`;
}

function getBlFilename(item: BulkBlItem): string {
  const id = getTargetIdentifier(item);
  const ext = item.file.name.includes('.') ? item.file.name.split('.').pop() : 'pdf';
  return `BL ${id}.${ext}`;
}

// Gentle harmonic chime played once upon concurrent tasks completion
function playCelebrationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.36);
    });
  } catch {
    // Audio autoplay restrictions ignored safely
  }
}

// Single-BL normalization performed in InvoiceGenerator.extractBLData
function normalizeExtractedBlData(raw: any, rawPdfText?: string) {
  const notifyName = (raw?.notify_party || '').trim();
  const notifyAddr = (raw?.notify_party_address || '').trim();
  const notifyAlreadyHasAddr = notifyAddr && notifyName.toLowerCase().includes(notifyAddr.toLowerCase());
  const mergedNotify = notifyAlreadyHasAddr || !notifyAddr
    ? notifyName
    : [notifyName, notifyAddr].filter(Boolean).join('\n');

  let cleanedDescription = (raw?.description || '').trim();
  if (cleanedDescription) {
    cleanedDescription = cleanedDescription
      .replace(/^SAID\s+TO\s+CONTAIN[^A-Za-z]*\d*\s*X?\s*\d*[A-Z0-9]*\s*(?:\d*\s*BALES?)?\s*[:-]?\s*/i, '')
      .replace(/^(?:STC|CONTAINING|SHIPPER'S\s+LOAD\s*[,/&]?\s*STOW\s*[,/&]?\s*COUNT|FCL\s*[/]?\s*FCL|PARTICULARS\s+FURNISHED\s+BY\s+SHIPPER)\s*[:-]?\s*/i, '')
      .trim();
  }

  // Check whether the original BL actually mentions MIX or MIXED
  const docHasMix = /\bMIX(?:ED)?\b/i.test((rawPdfText || '') + ' ' + cleanedDescription);
  if (!docHasMix && /\bMIX(?:ED)?\s+USED\s+CLOTHING\b/i.test(cleanedDescription)) {
    cleanedDescription = cleanedDescription.replace(/\bMIX(?:ED)?\s+USED\s+CLOTHING\b/gi, 'USED CLOTHING');
  }

  const rawGroups: Array<{ name: string; hs_code?: string | null }> =
    Array.isArray(raw?.product_groups) && raw.product_groups.length
      ? raw.product_groups
      : splitDescriptionFallback(cleanedDescription).map((n) => ({ name: n }));

  const aiGroups = rawGroups.map((g) => ({
    ...g,
    name: !docHasMix && /\bMIX(?:ED)?\s+USED\s+CLOTHING\b/i.test(g.name) ? 'USED CLOTHING' : g.name,
  }));

  const composed = composeGoodsDescription(
    aiGroups,
    raw?.kgs ?? null,
    cleanedDescription,
    raw?.raw_weight_text,
  );
  const finalDescription = composed.lines.length > 0 && composed.text ? composed.text : cleanedDescription;
  const finalHsCode = composed.lines.length > 0 ? (raw?.hs_code || '') : (raw?.hs_code || composed.primaryHs || '');

  return {
    ...raw,
    container_numbers: cleanContainerList(raw?.container_numbers),
    notify_party: mergedNotify,
    notify_party_address: '',
    description: finalDescription,
    hs_code: finalHsCode,
    goods_lines: composed.lines,
  };
}

// Single-BL calculateValues() exact replication (truncation + 0.42 floor + 3dp total)
function singleBlCalculate(blData: any, companyPriceStr: string) {
  if (!blData?.kgs || !companyPriceStr) return null;
  const parsedAmount = parseExactAmountInput(companyPriceStr);
  if (!parsedAmount) return null;
  const normalizedWeight = normalizeDecimalForMath(String(blData.kgs));
  if (!normalizedWeight) return null;

  const companyPriceNum = Number(parsedAmount.normalizedForMath);
  const weightNum = Number(normalizedWeight);
  if (!isFinite(companyPriceNum) || !isFinite(weightNum) || weightNum === 0) return null;

  const rawUnitPrice = companyPriceNum / weightNum;
  const truncatedUnitPrice = Math.floor(rawUnitPrice * 100) / 100;
  const unitPriceNum = truncatedUnitPrice < 0.42 ? 0.42 : truncatedUnitPrice;
  const unitPriceText = unitPriceNum.toFixed(2);

  const computedTotalRaw =
    multiplyDecimalStrings(unitPriceText, normalizedWeight, 3) ?? parsedAmount.normalized;
  const totalPriceText = formatCalculatedDecimal(computedTotalRaw, 3);

  return {
    unitPrice: unitPriceNum,
    unitPriceText,
    totalPriceText,
    kgs: blData.kgs as number,
  };
}

export function BulkBlUpload({ excelRows, templateFile, templateLayout }: BulkBlUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BulkBlItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [totalProcessingTime, setTotalProcessingTime] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState('');
  const [viewItem, setViewItem] = useState<BulkBlItem | null>(null);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);

  const activeProcessingIds = useRef(new Set<string>());
  const hasCelebratedRef = useRef(false);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (files.length === 0) return;
    if (files.length > MAX_BULK_FILES) {
      toast.error(`Maximum ${MAX_BULK_FILES} BL files at one time.`);
      return;
    }
    const invalid = files.find((f) => !ACCEPTED_TYPES.includes(f.type));
    if (invalid) {
      toast.error('Only PDF, JPG, JPEG, PNG allowed.');
      return;
    }
    setItems((prev) => {
      const merged = [
        ...prev,
        ...files.map((f, i) => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          file: f,
          status: 'pending' as BulkStatus,
          liveStep: 'Pending',
          progress: 0,
          uploadedAt: Date.now(),
        })),
      ];
      if (merged.length > MAX_BULK_FILES) {
        toast.error(`Maximum ${MAX_BULK_FILES} files total.`);
        return merged.slice(0, MAX_BULK_FILES);
      }
      return merged;
    });
  };

  const removeItem = (id: string) => {
    activeProcessingIds.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const clearAll = () => {
    activeProcessingIds.current.clear();
    setItems([]);
    setTotalProcessingTime(null);
  };

  const updateItem = (id: string, patch: Partial<BulkBlItem>) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  // Independent background processor for a single BL
  const processBL = async (item: BulkBlItem): Promise<BulkBlItem> => {
    const itemStartTime = performance.now();
    try {
      const fileSig = getFileSignature(item.file);
      const isPdf = item.file.type === 'application/pdf' || item.file.name.toLowerCase().endsWith('.pdf');

      // LIVE STEP 1: Reading BL
      updateItem(item.id, {
        status: 'processing',
        liveStep: 'Reading BL',
        message: 'Reading BL…',
        progress: 15,
        uploadedAt: Date.now(),
      });

      let rawPdfText = '';
      let localExtracted: any = null;

      if (localTextCache.has(fileSig)) {
        const cached = localTextCache.get(fileSig)!;
        rawPdfText = cached.rawPdfText;
        localExtracted = cached.localExtracted;
      } else if (isPdf) {
        try {
          rawPdfText = await extractRawTextFromPdf(item.file);
          if (rawPdfText && rawPdfText.trim().length > 0) {
            localExtracted = parseBlText(rawPdfText);
          }
          localTextCache.set(fileSig, { rawPdfText, localExtracted });
        } catch (pdfErr) {
          console.warn('Bulk PDF text extraction warning:', pdfErr);
        }
      }

      // LIVE STEP 2: AI Extracting
      updateItem(item.id, {
        liveStep: 'AI Extracting',
        message: 'AI Extracting…',
        progress: 35,
      });

      let rawData: any = null;
      if (aiExtractionCache.has(fileSig)) {
        rawData = aiExtractionCache.get(fileSig);
      } else {
        try {
          const base64 = await readBase64(item.file);
          const { data, error } = await supabase.functions.invoke('extract-bl-data', {
            body: { fileBase64: base64, mimeType: item.file.type },
          });
          if (error) throw error;
          rawData = data;
          aiExtractionCache.set(fileSig, data);
        } catch (invokeErr: any) {
          if (localExtracted && (localExtracted.kgs || localExtracted.container_numbers.length > 0)) {
            rawData = localExtracted;
            aiExtractionCache.set(fileSig, localExtracted);
          } else {
            throw invokeErr;
          }
        }
      }

      // Merge and verify against document ground truth
      if (localExtracted && rawData) {
        rawData = {
          ...localExtracted,
          ...rawData,
          kgs: rawData.kgs ?? localExtracted.kgs,
          bales: rawData.bales ?? localExtracted.bales,
          container_numbers: Array.from(
            new Set([
              ...(Array.isArray(rawData.container_numbers) ? rawData.container_numbers : []),
              ...(localExtracted.container_numbers || []),
            ]),
          ),
          bl_number: rawData.bl_number || localExtracted.bl_number,
          vessel_name: rawData.vessel_name || localExtracted.vessel_name,
        };
        rawData = sanitizeAndVerifyBlData(rawData, rawPdfText);
      } else if (rawPdfText && rawData) {
        rawData = sanitizeAndVerifyBlData(rawData, rawPdfText);
      }

      const blData = normalizeExtractedBlData(rawData, rawPdfText);
      const containers: string[] = blData.container_numbers || [];
      const containerNumber = containers[0] || '';
      const blNumber = (blData?.bl_number || '').trim();
      const weight = Number(blData?.kgs);

      // LIVE STEP 3: Matching Excel
      updateItem(item.id, {
        liveStep: 'Matching Excel',
        message: 'Matching Excel…',
        progress: 50,
        containerNumber,
        blNumber,
        weight: isFinite(weight) ? weight : undefined,
        extractedAt: Date.now(),
      });

      const keys = containers
        .map((c) => cleanContainerNumber(c) || normalizeKey(c))
        .filter(Boolean);
      const matched = excelRows.find((row) => {
        const k = cleanContainerNumber(row.container) || normalizeKey(row.container);
        return keys.includes(k);
      });

      if (!matched) {
        const failed: BulkBlItem = {
          ...item,
          status: 'no_match',
          liveStep: 'No Excel match',
          message: 'No Excel match',
          containerNumber,
          blNumber,
          blData,
          weight: isFinite(weight) ? weight : undefined,
          progress: 100,
        };
        updateItem(item.id, failed);
        return failed;
      }

      // LIVE STEP 4: Calculating
      updateItem(item.id, {
        liveStep: 'Calculating',
        message: 'Calculating…',
        containerNumber,
        blNumber,
        invoiceNumber: matched.invoice,
        companyPrice: matched.price,
        progress: 65,
      });

      const calc = singleBlCalculate(blData, matched.price);
      if (!calc) {
        const failed: BulkBlItem = {
          ...item,
          status: 'failed',
          liveStep: 'Missing weight/price',
          message: 'Missing weight/price',
          containerNumber,
          blNumber,
          invoiceNumber: matched.invoice,
          companyPrice: matched.price,
          blData,
          progress: 100,
        };
        updateItem(item.id, failed);
        return failed;
      }

      const invNum = matched.invoice || blNumber || `INV-${Date.now()}`;
      const invoiceDate = blData?.bl_date ? normalizeDateString(blData.bl_date) : todayDDMMYY();
      const containerNums = containers.join(', ');
      const firstContainer = containerNumber;
      const containerSize = blData?.container_size || '';
      const bales = blData?.bales || '';

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

      // LIVE STEP 5: Generating Invoice
      updateItem(item.id, {
        liveStep: 'Generating Invoice',
        message: 'Generating Invoice…',
        containerNumber,
        blNumber,
        invoiceNumber: invNum,
        companyPrice: matched.price,
        weight,
        progress: 80,
      });

      const tplName = (templateFile?.name || '').toLowerCase();
      const isUserPdf =
        templateFile && (templateFile.type === 'application/pdf' || tplName.endsWith('.pdf'));
      const isUserDocx =
        templateFile &&
        (tplName.endsWith('.docx') ||
          tplName.endsWith('.doc') ||
          templateFile.type ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      let pdfBase64: string | undefined;
      if (isUserPdf) {
        const overlayData = {
          ...adobeData,
          shipper: [blData?.shipper, blData?.shipper_address].filter(Boolean).join('\n'),
          consignee: [blData?.consignee, blData?.consignee_address].filter(Boolean).join('\n'),
          notify_party: [
            blData?.notify_party || blData?.consignee,
            blData?.notify_party_address || blData?.consignee_address,
          ]
            .filter(Boolean)
            .join('\n'),
        };
        const templateBase64 = await readBase64(templateFile!);
        const resolved = resolveTemplateLayout(templateLayout);
        const { data: res, error: err } = await supabase.functions.invoke('generate-invoice-overlay', {
          body: { templateBase64, data: overlayData, fields: resolved.fields ?? [] },
        });
        if (err) throw err;
        if (!res?.success) throw new Error(res?.error || 'PDF overlay failed');
        pdfBase64 = res.pdfBase64;
      } else {
        const templateBase64 = isUserDocx ? await readBase64(templateFile!) : undefined;
        const { data: res, error: err } = await supabase.functions.invoke('generate-invoice-adobe', {
          body: { data: adobeData, templateBase64 },
        });
        if (err) throw err;
        if (!res?.success || !res?.pdfBase64) throw new Error(res?.error || 'Adobe generation failed');
        pdfBase64 = res.pdfBase64;
      }

      // LIVE STEP 6: Converting PDF & Preparing NOC
      updateItem(item.id, {
        liveStep: 'Converting PDF',
        message: 'Converting PDF…',
        progress: 92,
        generatedAt: Date.now(),
      });

      // Background compression of original BL if >= 1MB
      let compressedBlBlob: Blob | undefined;
      if (item.file.size >= 1024 * 1024) {
        if (compressedBlCache.has(fileSig)) {
          compressedBlBlob = compressedBlCache.get(fileSig);
        } else {
          try {
            compressedBlBlob = await compressBlFile(item.file);
            compressedBlCache.set(fileSig, compressedBlBlob);
          } catch (compErr) {
            console.warn('Background BL compression warning:', compErr);
          }
        }
      }

      // Auto-create NOC records in background
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid && containers.length > 0) {
          const rows = containers.map((c) => ({
            user_id: uid,
            container_number: c,
            bl_number: blData?.bl_number || null,
            invoice_number: invNum,
            status: 'Pending Approval',
          }));
          await supabase.from('noc_records').insert(rows);
        }
      } catch (e) {
        console.error('NOC bulk insert failed:', e);
      }

      // LIVE STEP 7: Completed
      const done: BulkBlItem = {
        ...item,
        status: 'done',
        liveStep: 'Completed',
        message: 'Completed',
        containerNumber,
        blNumber,
        invoiceNumber: invNum,
        companyPrice: matched.price,
        weight,
        blData,
        pdfBase64,
        compressedBlBlob,
        progress: 100,
        nocAt: Date.now(),
        processingDurationMs: performance.now() - itemStartTime,
      };
      updateItem(item.id, done);
      return done;
    } catch (err: any) {
      console.error('Bulk BL processing failed:', err);
      const failed: BulkBlItem = {
        ...item,
        status: 'failed',
        liveStep: 'Failed',
        message: err?.message || 'Failed',
        progress: 100,
        processingDurationMs: performance.now() - itemStartTime,
      };
      updateItem(item.id, failed);
      return failed;
    }
  };

  // TRUE PARALLEL PROCESSING: All BLs start simultaneously and run independently
  const processAll = async () => {
    if (items.length === 0) return;
    if (excelRows.length === 0) {
      toast.error('Please upload the Excel file first (Excel Auto-Fill section).');
      return;
    }

    setProcessing(true);
    setTotalProcessingTime(null);
    const startTime = performance.now();

    try {
      const pendingItems = items.filter((it) => it.status !== 'done' || !it.pdfBase64);
      const itemsToRun = pendingItems.length > 0 ? pendingItems : items;

      // Start all BLs concurrently
      await Promise.allSettled(
        itemsToRun.map((item) => {
          if (activeProcessingIds.current.has(item.id)) return Promise.resolve(item);
          activeProcessingIds.current.add(item.id);
          return processBL(item).finally(() => {
            activeProcessingIds.current.delete(item.id);
          });
        }),
      );

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      setTotalProcessingTime(`${elapsed}s`);
      toast.success(`Processed ${itemsToRun.length} BLs concurrently in ${elapsed}s.`);
    } finally {
      setProcessing(false);
    }
  };

  // Helpers for individual and sequential downloads
  const base64ToBlob = (base64: string): Blob => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'application/pdf' });
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 12_000);
  };

  const downloadOneInvoice = (item: BulkBlItem) => {
    if (!item.pdfBase64) return;
    const filename = getInvoiceFilename(item);
    triggerDownload(base64ToBlob(item.pdfBase64), filename);
  };

  const downloadOneBl = async (item: BulkBlItem) => {
    const filename = getBlFilename(item);
    let blob: Blob = item.compressedBlBlob || item.file;
    if (!item.compressedBlBlob && item.file.size >= 1024 * 1024) {
      blob = await compressBlFile(item.file);
    }
    triggerDownload(blob, filename);
  };

  // Download All: Downloads every invoice and matching BL in sequence automatically (NO ZIP)
  const downloadAllInvoicesAndBLs = async () => {
    const completedItems = items.filter((i) => i.pdfBase64);
    if (completedItems.length === 0) {
      toast.error('No generated invoices available to download.');
      return;
    }

    setDownloadingAll(true);
    try {
      const totalPairs = completedItems.length;
      const totalFiles = totalPairs * 2;
      let count = 0;

      for (let i = 0; i < completedItems.length; i++) {
        const it = completedItems[i];
        const invoiceName = getInvoiceFilename(it);
        const blName = getBlFilename(it);

        // 1. Download Invoice
        count++;
        setDownloadProgressText(`Downloading ${count} of ${totalFiles}: ${invoiceName}`);
        triggerDownload(base64ToBlob(it.pdfBase64!), invoiceName);

        // Interval to allow browser download thread to catch up smoothly
        await new Promise((resolve) => setTimeout(resolve, 250));

        // 2. Download Original BL (auto-compressed if >= 1MB)
        count++;
        setDownloadProgressText(`Downloading ${count} of ${totalFiles}: ${blName}`);
        let blBlob: Blob = it.compressedBlBlob || it.file;
        if (!it.compressedBlBlob && it.file.size >= 1024 * 1024) {
          blBlob = await compressBlFile(it.file);
        }
        triggerDownload(blBlob, blName);

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      toast.success(`Successfully downloaded all ${completedItems.length} invoices and BLs.`);
    } catch (err: any) {
      console.error('Download All failed:', err);
      toast.error(err?.message || 'Download failed.');
    } finally {
      setDownloadingAll(false);
      setDownloadProgressText('');
    }
  };

  const statusBadge = (s: BulkStatus, liveStep?: string) => {
    if (s === 'processing') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-card shadow-neu-xs border border-primary/30 text-primary">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          {liveStep || 'Processing'}
        </span>
      );
    }
    if (s === 'done') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-card shadow-neu-xs border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          Completed
        </span>
      );
    }
    if (s === 'no_match') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-card shadow-neu-xs border border-rose-500/30 text-rose-600 dark:text-rose-400">
          <XCircle className="w-3.5 h-3.5 text-rose-500" />
          No Match
        </span>
      );
    }
    if (s === 'failed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-card shadow-neu-xs border border-rose-500/30 text-rose-600 dark:text-rose-400">
          <XCircle className="w-3.5 h-3.5 text-rose-500" />
          Failed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-card shadow-neu-xs border border-amber-500/30 text-amber-600 dark:text-amber-400">
        <Clock className="w-3.5 h-3.5 text-amber-500" />
        Pending
      </span>
    );
  };

  const features = [
    { icon: Brain, label: 'AI Extraction', sub: 'Instant parallel extraction', color: 'bg-sky-100 text-sky-600' },
    { icon: Link2, label: 'Accurate Matching', sub: 'Excel auto matching', color: 'bg-emerald-100 text-emerald-600' },
    { icon: Calculator, label: 'Auto Calculations', sub: 'Weights, prices & amounts', color: 'bg-amber-100 text-amber-600' },
    { icon: FileCheck2, label: 'Invoice Generation', sub: 'PDF template mapping', color: 'bg-violet-100 text-violet-600' },
  ];

  const progressFor = (item: BulkBlItem) => {
    if (typeof item.progress === 'number') return item.progress;
    if (item.status === 'done' || item.status === 'matched') return 100;
    if (item.status === 'failed' || item.status === 'no_match') return 100;
    if (item.status === 'processing') return 50;
    return 0;
  };

  const progressColor = (s: BulkStatus) => {
    if (s === 'done' || s === 'matched') return 'bg-emerald-500';
    if (s === 'processing') return 'bg-gradient-to-r from-indigo-500 to-violet-500';
    if (s === 'failed' || s === 'no_match') return 'bg-red-400';
    return 'bg-slate-200';
  };

  const generatedCount = items.filter((i) => Boolean(i.pdfBase64)).length;
  const totalBls = items.length;

  // Trigger condition: all concurrent tasks reach 'Completed' ('done') state
  const allConcurrentTasksCompleted =
    items.length > 0 &&
    !processing &&
    items.every((i) => i.status === 'done');

  // Also accommodate mixed completions when all finished and at least one invoice was generated
  const allTasksFinished =
    items.length > 0 &&
    !processing &&
    items.every((i) => i.status === 'done' || i.status === 'failed' || i.status === 'no_match');

  const isAllCompleted = (allConcurrentTasksCompleted || allTasksFinished) && generatedCount > 0;

  // Calculate total processing time (either recorded batch time or concurrent longest-task duration)
  const calculatedTimeDisplay = useMemo(() => {
    if (totalProcessingTime) return totalProcessingTime;
    const durations = items
      .map((it) => it.processingDurationMs)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    if (durations.length > 0) {
      const maxMs = Math.max(...durations);
      const sec = (maxMs / 1000).toFixed(1);
      return `${sec}s`;
    }
    return null;
  }, [totalProcessingTime, items]);

  // Trigger celebration popup modal & audio chime when all tasks reach completed
  useEffect(() => {
    if (isAllCompleted) {
      if (!hasCelebratedRef.current) {
        hasCelebratedRef.current = true;
        playCelebrationChime();
        setShowCelebrationModal(true);
      }
    } else if (processing) {
      hasCelebratedRef.current = false;
    }
  }, [isAllCompleted, processing]);

  const summary = useMemo(() => ({
    total: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    processing: items.filter((i) => i.status === 'processing').length,
    completed: items.filter((i) => i.status === 'done' || i.status === 'matched').length,
    failed: items.filter((i) => i.status === 'failed' || i.status === 'no_match').length,
  }), [items]);

  const viewFile = (item: BulkBlItem) => {
    const blob = item.pdfBase64 ? base64ToBlob(item.pdfBase64) : item.file;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const hasItems = items.length > 0;

  return (
    <div className="rounded-3xl bg-card border border-white/80 dark:border-white/10 shadow-neu overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 sm:px-7 py-4 sm:py-5 border-b border-border/50 bg-card">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-card shadow-neu border border-white/80 dark:border-white/10 text-primary flex items-center justify-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-neu-primary text-white">
              <Layers3Icon />
            </div>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">Multi-BL Processing</h3>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">True parallel processing for up to {MAX_BULK_FILES} BL files</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card shadow-neu-xs border border-white/80 dark:border-white/10 text-xs sm:text-sm font-semibold text-primary">
          <FileText className="w-3.5 h-3.5" />
          {items.length} / {MAX_BULK_FILES}
        </div>
      </div>

      <div className="p-5 sm:p-7 space-y-6">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          onChange={handlePick}
          className="hidden"
        />

        {/* Upload dropzone */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => !processing && inputRef.current?.click()}
          className="relative shadow-neu-inset bg-card/60 border border-border/40 rounded-3xl px-6 py-8 sm:py-10 text-center cursor-pointer hover:bg-card/80 transition-all"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-card border border-white/80 dark:border-white/10 flex items-center justify-center shadow-neu"
          >
            <UploadCloud className="w-7 h-7 text-primary" />
          </motion.div>
          <p className="text-base sm:text-lg font-bold text-foreground">Upload up to {MAX_BULK_FILES} BL files</p>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">PDF, JPG, JPEG, PNG • Parallel execution</p>
          <Button
            type="button"
            disabled={processing}
            className="mt-5 gap-2 px-6 py-2.5 h-auto shadow-neu-primary text-white"
          >
            <Upload className="w-4 h-4" />
            {hasItems ? 'Upload More' : 'Choose Files'}
          </Button>
          {hasItems && (
            <p className="mt-4 text-xs sm:text-sm text-muted-foreground font-medium">
              <span className="font-bold text-primary">{items.length}</span> of{' '}
              <span className="font-bold text-foreground">{MAX_BULK_FILES}</span> files uploaded
            </p>
          )}
        </motion.div>

        {/* Summary cards */}
        <AnimatePresence>
          {hasItems && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
            >
              <SummaryCard icon={FileText} label="Total Files" value={`${summary.total} / ${MAX_BULK_FILES}`} sub="Uploaded" tone="indigo" />
              <SummaryCard icon={Clock} label="Pending" value={summary.pending + summary.processing} sub="Processing" tone="amber" />
              <SummaryCard icon={CheckCircle2} label="Completed" value={summary.completed} sub="Completed" tone="emerald" />
              <SummaryCard icon={XCircle} label="Failed" value={summary.failed} sub="Failed" tone="red" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        {hasItems && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={clearAll}
                disabled={processing}
                className="h-12 rounded-2xl bg-card border border-white/80 dark:border-white/10 text-rose-600 dark:text-rose-400 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm hover:bg-card hover:text-rose-700 dark:hover:text-rose-300 gap-2 font-semibold transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </Button>
              <Button
                variant="outline"
                onClick={() => toast.message(`${summary.completed} completed · ${summary.failed} failed · ${summary.pending + summary.processing} pending`)}
                disabled={items.length === 0}
                className="h-12 rounded-2xl bg-card border border-white/80 dark:border-white/10 text-primary shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm hover:bg-card hover:text-primary gap-2 font-semibold transition-all cursor-pointer"
              >
                <BarChart3 className="w-4 h-4" />
                View Report
              </Button>
            </div>
            <Button
              onClick={processAll}
              disabled={processing}
              className="w-full h-14 rounded-2xl gap-2 text-base font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-neu-primary hover:shadow-neu-hover active:shadow-neu-inset transition-all cursor-pointer"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing All Simultaneously…
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Process All Files in Parallel
                </>
              )}
            </Button>
          </motion.div>
        )}

        {/* Feature chips (only when empty) */}
        {!hasItems && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {features.map((f) => (
              <motion.div
                key={f.label}
                whileHover={{ y: -2 }}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-neu-inset-sm border border-border/40 ${f.color}`}>
                  <f.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{f.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* File list with live status */}
        {hasItems && (
          <div className="rounded-3xl border border-white/80 dark:border-white/10 bg-card shadow-neu overflow-hidden">
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-[60px_1fr_180px_1fr_140px] gap-4 px-6 py-3.5 bg-card/70 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>#</span>
              <span>File Name</span>
              <span>Live Status</span>
              <span>Progress</span>
              <span className="text-right">Action</span>
            </div>

            <AnimatePresence initial={false}>
              {items.map((it, idx) => {
                const pct = progressFor(it);
                const canDownload = !!it.pdfBase64;
                return (
                  <motion.div
                    key={it.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className={`border-b last:border-b-0 border-border/30 ${
                      it.status === 'processing' ? 'bg-primary/5' : 'hover:bg-muted/30'
                    } transition-colors`}
                  >
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-[60px_1fr_180px_1fr_140px] gap-4 items-center px-6 py-4">
                      <div className="w-8 h-8 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 text-primary flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 text-rose-500 flex items-center justify-center shrink-0">
                          <FileIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          {it.invoiceNumber && (
                            <p className="text-xs font-semibold text-primary truncate">{it.invoiceNumber}</p>
                          )}
                          <p className="text-sm font-semibold text-foreground truncate" title={it.file.name}>
                            {it.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatBytes(it.file.size)}</p>
                        </div>
                      </div>
                      <div>{statusBadge(it.status, it.liveStep)}</div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2.5 rounded-full bg-card shadow-neu-inset-sm border border-border/30 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.4 }}
                            className={`h-full rounded-full ${progressColor(it.status)}`}
                          />
                        </div>
                        <span className="text-xs font-mono font-semibold text-muted-foreground w-10 text-right">{pct}%</span>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setViewItem(it)}
                          className="w-9 h-9 rounded-xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-primary flex items-center justify-center transition-all cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => canDownload && downloadOneInvoice(it)}
                          disabled={!canDownload}
                          className={`w-9 h-9 rounded-xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm flex items-center justify-center transition-all ${
                            canDownload
                              ? 'text-emerald-600 dark:text-emerald-400 cursor-pointer'
                              : 'text-muted-foreground/40 opacity-40 cursor-not-allowed'
                          }`}
                          title="Download Invoice"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="md:hidden p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {idx + 1}
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 text-rose-500 flex items-center justify-center shrink-0">
                          <FileIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          {it.invoiceNumber && (
                            <p className="text-xs font-semibold text-primary">{it.invoiceNumber}</p>
                          )}
                          <p className="text-sm font-semibold text-foreground truncate">{it.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(it.file.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {statusBadge(it.status, it.liveStep)}
                        <span className="text-xs font-mono font-semibold text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-card shadow-neu-inset-sm border border-border/30 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4 }}
                          className={`h-full rounded-full ${progressColor(it.status)}`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewItem(it)}
                          className="flex-1 h-10 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-primary flex items-center justify-center gap-2 text-sm font-medium transition-all cursor-pointer"
                        >
                          <Eye className="w-4 h-4" /> View
                        </button>
                        <button
                          onClick={() => canDownload && downloadOneInvoice(it)}
                          disabled={!canDownload}
                          className={`flex-1 h-10 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                            canDownload
                              ? 'text-emerald-600 dark:text-emerald-400 cursor-pointer'
                              : 'text-muted-foreground/40 opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <Download className="w-4 h-4" /> Download
                        </button>
                      </div>
                      {it.message && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {it.status === 'failed' || it.status === 'no_match' ? (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                          ) : null}
                          {it.message}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Bottom Action: Single prominent download button matching app theme */}
        {generatedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-2"
          >
            <Button
              onClick={downloadAllInvoicesAndBLs}
              disabled={downloadingAll || generatedCount === 0}
              className="w-full h-14 rounded-2xl gap-3 text-base sm:text-lg font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-neu-primary hover:shadow-neu-hover active:shadow-neu-inset transition-all cursor-pointer"
            >
              {downloadingAll ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{downloadProgressText || 'Downloading Files…'}</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Download All ({generatedCount * 2} Files)</span>
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>

      {/* Full-Featured Success Celebration Popup Modal with DotLottie Animation */}
      <SuccessCelebrationModal
        open={showCelebrationModal}
        onOpenChange={setShowCelebrationModal}
        totalTimeDisplay={calculatedTimeDisplay || '0.0s'}
        totalBls={totalBls}
        totalInvoices={generatedCount}
        downloadingAll={downloadingAll}
        downloadProgressText={downloadProgressText}
        onDownloadAll={downloadAllInvoicesAndBLs}
      />

      {/* File Details Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(o) => !o && setViewItem(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
          {viewItem && (
            <FileDetailsPanel
              item={viewItem}
              onClose={() => setViewItem(null)}
              onDownloadInvoice={() => downloadOneInvoice(viewItem)}
              onDownloadBl={() => downloadOneBl(viewItem)}
              onView={() => viewFile(viewItem)}
              onShare={async () => {
                try {
                  if (viewItem.pdfBase64 && (navigator as any).share) {
                    const blob = base64ToBlob(viewItem.pdfBase64);
                    const filename = getInvoiceFilename(viewItem);
                    const file = new File([blob], filename, { type: 'application/pdf' });
                    await (navigator as any).share({ files: [file], title: viewItem.invoiceNumber || 'Invoice' });
                  } else if (viewItem.invoiceNumber) {
                    await navigator.clipboard.writeText(viewItem.invoiceNumber);
                    toast.success('Invoice number copied');
                  }
                } catch { /* ignored */ }
              }}
              onDelete={() => { removeItem(viewItem.id); setViewItem(null); toast.success('File removed'); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileDetailsPanel({
  item, onClose, onDownloadInvoice, onDownloadBl, onView, onShare, onDelete,
}: {
  item: BulkBlItem;
  onClose: () => void;
  onDownloadInvoice: () => void;
  onDownloadBl: () => void;
  onView: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const fmt = (t?: number) =>
    t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Pending';
  const progress = typeof item.progress === 'number' ? item.progress : 0;
  const isDone = item.status === 'done';
  const isFailed = item.status === 'failed' || item.status === 'no_match';
  const steps = [
    { label: 'Reading BL', done: !!item.uploadedAt, t: item.uploadedAt },
    { label: 'AI Extracting', done: !!item.uploadedAt && item.status !== 'pending', t: item.uploadedAt },
    { label: 'Matching Excel', done: !!item.extractedAt, t: item.extractedAt },
    { label: 'Calculating', done: !!item.extractedAt, t: item.extractedAt },
    { label: 'Generating Invoice', done: !!item.generatedAt, t: item.generatedAt },
    { label: 'Converting PDF', done: !!item.nocAt, t: item.nocAt },
    { label: 'Completed', done: isDone, t: item.nocAt },
  ];

  return (
    <div className="max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm flex items-center justify-center transition-all cursor-pointer">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <p className="text-sm font-semibold text-foreground">File Details</p>
        <div className="w-9" />
      </div>

      {/* Hero */}
      <div className="px-5 py-6 bg-card text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-card border border-white/80 dark:border-white/10 shadow-neu text-primary flex items-center justify-center relative">
          <FileText className="w-9 h-9" />
          {isDone && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </div>
        {item.invoiceNumber && (
          <span className="inline-block mt-4 px-3 py-1 rounded-full bg-card shadow-neu-xs border border-primary/30 text-primary text-xs font-semibold">
            {item.invoiceNumber}
          </span>
        )}
        <h3 className="mt-2 text-lg font-bold text-foreground break-all">{item.file.name}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {item.blNumber || '—'} • {item.containerNumber || '—'}
        </p>
        <p className="text-xs text-muted-foreground/80 mt-1">
          {formatBytes(item.file.size)} • Uploaded {fmt(item.uploadedAt)}
        </p>
      </div>

      {/* Progress */}
      <div className="px-5 pb-4">
        <div className="rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-primary">Processing Progress</p>
            <p className="text-sm font-bold text-primary">{progress}%</p>
          </div>
          <div className="h-2.5 rounded-full bg-card shadow-neu-inset-sm border border-border/30 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
              className={`h-full rounded-full ${isFailed ? 'bg-rose-500' : 'bg-primary'}`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" />
            {item.message || 'Waiting…'}
          </p>
        </div>
      </div>

      {/* Invoice Info */}
      {(item.invoiceNumber || item.companyPrice || item.containerNumber || item.blNumber) && (
        <div className="px-5 pb-4">
          <div className="rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm p-4 space-y-3">
            <p className="text-sm font-bold text-foreground">Invoice Information</p>
            {[
              ['Invoice #', item.invoiceNumber],
              ['Company Price', item.companyPrice ? `$${item.companyPrice}` : null],
              ['Container', item.containerNumber],
              ['BL #', item.blNumber],
            ].filter(([, v]) => !!v).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{k}</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">{v}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(String(v)); toast.success('Copied'); }}
                    className="p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="px-5 pb-4">
        <div className="rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm p-4">
          <p className="text-sm font-bold text-foreground mb-3">Live Status Timeline</p>
          <div className="space-y-3">
            {steps.map((s) => (
              <div key={s.label} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center shrink-0 ${
                  s.done ? 'text-emerald-500' : 'text-muted-foreground/60'
                }`}>
                  {s.done ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${s.done ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</p>
                  <p className="text-xs text-muted-foreground/80">{s.done ? fmt(s.t) : 'Pending'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-5 pb-6">
        <p className="text-sm font-bold text-foreground mb-3">Quick Actions</p>
        <div className="space-y-2.5">
          <button onClick={onView} className="w-full h-11 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-primary flex items-center gap-3 px-4 text-sm font-semibold transition-all cursor-pointer">
            <Eye className="w-4 h-4" /> View Extracted Data
          </button>
          <button onClick={onDownloadInvoice} disabled={!item.pdfBase64} className="w-full h-11 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-emerald-600 dark:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3 px-4 text-sm font-semibold transition-all cursor-pointer">
            <Download className="w-4 h-4" /> Download Invoice (PDF)
          </button>
          <button onClick={onDownloadBl} className="w-full h-11 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-teal-600 dark:text-teal-400 flex items-center gap-3 px-4 text-sm font-semibold transition-all cursor-pointer">
            <Download className="w-4 h-4" /> Download Original BL
          </button>
          <button onClick={onShare} className="w-full h-11 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-primary flex items-center gap-3 px-4 text-sm font-semibold transition-all cursor-pointer">
            <Share2 className="w-4 h-4" /> Share Invoice
          </button>
          <button onClick={onDelete} className="w-full h-11 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu-sm hover:shadow-neu active:shadow-neu-inset-sm text-rose-600 dark:text-rose-400 flex items-center gap-3 px-4 text-sm font-semibold transition-all cursor-pointer">
            <Trash2 className="w-4 h-4" /> Delete File
          </button>
        </div>
      </div>
    </div>
  );
}

function Layers3Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </svg>
  );
}

function SummaryCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: any; label: string; value: number | string; sub: string;
  tone: 'indigo' | 'amber' | 'emerald' | 'red';
}) {
  const tones: Record<string, string> = {
    indigo: 'text-primary',
    amber: 'text-amber-500',
    emerald: 'text-emerald-500',
    red: 'text-rose-500',
  };
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="rounded-2xl bg-card border border-white/80 dark:border-white/10 p-4 sm:p-5 shadow-neu transition-all hover:shadow-neu-lg"
    >
      <div className="w-10 h-10 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center mb-3">
        <Icon className={`w-5 h-5 ${tones[tone]}`} />
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground font-semibold">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1 leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground/80 mt-1">{sub}</p>
    </motion.div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

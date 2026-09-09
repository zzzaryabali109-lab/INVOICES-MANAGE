import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2, Loader2, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileProcessed: (containerNumbers: string[]) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileProcessed, isProcessing }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_ROWS = 5000;
  const MAX_CONTAINERS = 2000;

  const getCellStringValue = (cellValue: unknown): string | null => {
    if (cellValue === null || cellValue === undefined) return null;
    if (typeof cellValue === 'string') return cellValue;
    if (typeof cellValue === 'number') return String(cellValue);
    if (typeof cellValue === 'object' && cellValue !== null) {
      if ('richText' in cellValue && Array.isArray((cellValue as { richText: unknown[] }).richText)) {
        const richText = (cellValue as { richText: { text: string }[] }).richText;
        return richText.map(rt => rt.text).join('');
      }
      if ('text' in cellValue && typeof (cellValue as { text: unknown }).text === 'string') {
        return (cellValue as { text: string }).text;
      }
      if ('result' in cellValue) {
        const result = (cellValue as { result: unknown }).result;
        if (typeof result === 'string') return result;
        if (typeof result === 'number') return String(result);
      }
      try {
        const str = String(cellValue);
        if (str !== '[object Object]') return str;
      } catch { /* ignore */ }
    }
    return null;
  };

  const cleanContainerNumber = (value: string): string | null => {
    const cleaned = value.trim().toUpperCase().replace(/[\s\-_.,:;#'"]/g, '').replace(/^(CONT|CONTAINER|CNT|CTR|NO|NUM|#|:)+/i, '');
    if (/^[A-Z]{4}\d{7}$/.test(cleaned)) return cleaned;
    if (/^[A-Z]{3,4}\d{6,7}$/.test(cleaned)) return cleaned;
    const match = cleaned.match(/([A-Z]{3,4}\d{6,7})/);
    if (match) return match[1];
    return null;
  };

  const isContainerColumnHeader = (value: string): boolean => {
    const normalized = value.toLowerCase().trim();
    const containerColumnNames = [
      'container', 'container no', 'container number', 'container_number',
      'container#', 'containerno', 'containernumber', 'cont', 'cont no',
      'cont number', 'cnt', 'cnt no', 'ctr', 'ctr no', 'container id',
      'containerid', 'box', 'box no', 'box number', 'unit', 'unit no',
      'unit number', 'equipment', 'equipment no', 'equipment number'
    ];
    return containerColumnNames.some(name => normalized === name || normalized.includes(name));
  };

  const processExcelFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
      return;
    }
    setIsReading(true);
    setError(null);
    
    try {
      const ExcelJS = await import('exceljs');
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      
      const containerNumbers: string[] = [];
      let totalRowsProcessed = 0;
      
      for (const worksheet of workbook.worksheets) {
        if (!worksheet || totalRowsProcessed >= MAX_ROWS) break;
        
        let containerColumnIndex: number | null = null;
        let headerRowIndex = 0;
        
        for (let rowNum = 1; rowNum <= Math.min(5, worksheet.rowCount); rowNum++) {
          const row = worksheet.getRow(rowNum);
          row.eachCell((cell, colNumber) => {
            if (containerColumnIndex !== null) return;
            const cellValue = getCellStringValue(cell.value);
            if (cellValue && isContainerColumnHeader(cellValue)) {
              containerColumnIndex = colNumber;
              headerRowIndex = rowNum;
            }
          });
          if (containerColumnIndex !== null) break;
        }
        
        if (containerColumnIndex !== null) {
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= headerRowIndex) return;
            if (totalRowsProcessed >= MAX_ROWS || containerNumbers.length >= MAX_CONTAINERS) return;
            totalRowsProcessed++;
            const cell = row.getCell(containerColumnIndex!);
            const stringValue = getCellStringValue(cell.value);
            if (!stringValue) return;
            const containerNumber = cleanContainerNumber(stringValue);
            if (containerNumber && !containerNumbers.includes(containerNumber)) {
              containerNumbers.push(containerNumber);
            }
          });
        } else {
          worksheet.eachRow((row) => {
            if (totalRowsProcessed >= MAX_ROWS || containerNumbers.length >= MAX_CONTAINERS) return;
            totalRowsProcessed++;
            row.eachCell((cell) => {
              if (containerNumbers.length >= MAX_CONTAINERS) return;
              const stringValue = getCellStringValue(cell.value);
              if (!stringValue) return;
              const containerNumber = cleanContainerNumber(stringValue);
              if (containerNumber && !containerNumbers.includes(containerNumber)) {
                containerNumbers.push(containerNumber);
              }
            });
          });
        }
      }
      
      if (containerNumbers.length === 0) {
        setError('No valid container numbers found.');
        return;
      }
      
      const uniqueNumbers = [...new Set(containerNumbers)];
      if (uniqueNumbers.length > MAX_CONTAINERS) {
        setError(`Too many containers (${uniqueNumbers.length}). Max: ${MAX_CONTAINERS}`);
        return;
      }
      
      onFileProcessed(uniqueNumbers);
    } catch {
      setError('Failed to read the Excel file.');
    } finally {
      setIsReading(false);
    }
  }, [onFileProcessed]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      setFile(droppedFile);
      processExcelFile(droppedFile);
    } else {
      setError('Please upload an Excel file (.xlsx or .xls)');
    }
  }, [processExcelFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      processExcelFile(selectedFile);
    }
  }, [processExcelFile]);

  const clearFile = useCallback(() => {
    setFile(null);
    setError(null);
  }, []);

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-3xl p-8 transition-all duration-300 cursor-pointer group overflow-hidden border border-border/40',
          isDragging 
            ? 'shadow-neu-inset bg-card/90 scale-[1.01]' 
            : 'shadow-neu-inset bg-card/60 hover:bg-card/80',
          (isProcessing || isReading) && 'pointer-events-none opacity-70'
        )}
      >
        {/* Animated background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '24px 24px'
          }} />
        </div>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing || isReading}
        />
        
        <div className="relative z-10 flex flex-col items-center justify-center gap-4 text-center">
          <AnimatePresence mode="wait">
            {file ? (
              <motion.div
                key="file"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <motion.div 
                  className="w-16 h-16 rounded-2xl bg-card shadow-neu border border-white/80 dark:border-white/10 flex items-center justify-center"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <FileSpreadsheet className="w-8 h-8 text-status-arrived" />
                </motion.div>
                <div>
                  <p className="font-semibold text-foreground flex items-center gap-2 justify-center">
                    <CheckCircle2 className="w-4 h-4 text-status-arrived" />
                    {file.name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                {!isProcessing && !isReading && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); clearFile(); }}
                      className="gap-2 rounded-xl"
                    >
                      <X className="w-4 h-4" />
                      Remove
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="upload"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <motion.div 
                  className="w-16 h-16 rounded-2xl bg-card shadow-neu border border-white/80 dark:border-white/10 flex items-center justify-center text-primary"
                  animate={isDragging ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <CloudUpload className="w-8 h-8 text-primary" />
                </motion.div>
                <div>
                  <p className="font-semibold text-foreground">
                    Drop your Excel file here
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Max 10MB • Up to 2,000 containers</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {(isReading || isProcessing) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-primary"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">{isReading ? 'Reading file...' : 'Processing...'}</span>
            </motion.div>
          )}
        </div>
      </motion.div>
      
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ArrowRight, X, Sparkles, FileText, Receipt, Upload, CheckCircle2 } from 'lucide-react';

interface ManualEntryFormProps {
  onTrack: (containerNumber: string, blFile?: File, invoiceFile?: File) => void;
  isTracking: boolean;
}

const CONTAINER_REGEX = /^[A-Z]{4}\d{7}$/;

export function ManualEntryForm({ onTrack, isTracking }: ManualEntryFormProps) {
  const [containerNumber, setContainerNumber] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [blFile, setBlFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const blInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  const formatContainerNumber = (value: string): string => {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatContainerNumber(e.target.value);
    setContainerNumber(formatted);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!containerNumber.trim()) {
      setError('Please enter a container number');
      return;
    }

    if (!CONTAINER_REGEX.test(containerNumber)) {
      setError('Invalid format. Use 4 letters + 7 digits (e.g., MSCU1234567)');
      return;
    }

    onTrack(containerNumber, blFile || undefined, invoiceFile || undefined);
    setContainerNumber('');
    setBlFile(null);
    setInvoiceFile(null);
  };

  const handleClear = () => {
    setContainerNumber('');
    setError('');
  };

  const isValid = CONTAINER_REGEX.test(containerNumber);
  const progress = Math.min(containerNumber.length / 11, 1) * 100;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        {/* Animated border effect */}
        <motion.div 
          className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary via-accent to-primary opacity-0"
          animate={{ 
            opacity: isFocused ? 0.5 : 0,
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
          }}
          transition={{ 
            opacity: { duration: 0.2 },
            backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" }
          }}
          style={{ backgroundSize: '200% 200%' }}
        />
        
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
              <motion.div
                animate={{ scale: isFocused ? 1.1 : 1 }}
                transition={{ duration: 0.2 }}
              >
                <Search className="w-5 h-5 text-muted-foreground" />
              </motion.div>
            </div>
            <Input
              value={containerNumber}
              onChange={handleChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="MSCU1234567"
              className="h-14 pl-12 pr-12 text-lg font-mono tracking-widest rounded-2xl"
              disabled={isTracking}
            />
            <AnimatePresence>
              {containerNumber && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  type="button"
                  onClick={handleClear}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Progress indicator */}
            <motion.div 
              className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              type="submit" 
              disabled={isTracking || !containerNumber}
              className="h-14 px-6 rounded-2xl shadow-neu-primary gap-2 font-semibold text-white"
            >
              {isTracking ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-5 h-5" />
                </motion.div>
              ) : (
                <>
                  <span className="hidden sm:inline">Track</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Document Upload Section */}
      <AnimatePresence>
        {isValid && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Hidden file inputs */}
              <input ref={blInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => { if (e.target.files?.[0]) setBlFile(e.target.files[0]); }} />
              <input ref={invoiceInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => { if (e.target.files?.[0]) setInvoiceFile(e.target.files[0]); }} />

              {/* BL Upload */}
              <motion.button
                type="button"
                onClick={() => blInputRef.current?.click()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all duration-200 text-left ${
                  blFile 
                    ? 'shadow-neu-inset bg-emerald-500/10 border border-emerald-500/30' 
                    : 'shadow-neu bg-card border border-white/80 dark:border-white/10 hover:shadow-neu-inset-sm'
                }`}
              >
                {blFile ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${blFile ? 'text-emerald-600' : 'text-foreground'}`}>
                    {blFile ? blFile.name : 'Upload BL'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {blFile ? `${(blFile.size / 1024).toFixed(0)} KB` : 'Bill of Lading (optional)'}
                  </p>
                </div>
                {blFile && (
                  <X className="w-4 h-4 text-muted-foreground hover:text-destructive shrink-0" 
                    onClick={(e) => { e.stopPropagation(); setBlFile(null); if(blInputRef.current) blInputRef.current.value = ''; }} />
                )}
              </motion.button>

              {/* Invoice Upload */}
              <motion.button
                type="button"
                onClick={() => invoiceInputRef.current?.click()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all duration-200 text-left ${
                  invoiceFile 
                    ? 'shadow-neu-inset bg-primary/10 border border-primary/30' 
                    : 'shadow-neu bg-card border border-white/80 dark:border-white/10 hover:shadow-neu-inset-sm'
                }`}
              >
                {invoiceFile ? (
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <Receipt className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${invoiceFile ? 'text-primary' : 'text-foreground'}`}>
                    {invoiceFile ? invoiceFile.name : 'Upload Invoice'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {invoiceFile ? `${(invoiceFile.size / 1024).toFixed(0)} KB` : 'Invoice document (optional)'}
                  </p>
                </div>
                {invoiceFile && (
                  <X className="w-4 h-4 text-muted-foreground hover:text-destructive shrink-0" 
                    onClick={(e) => { e.stopPropagation(); setInvoiceFile(null); if(invoiceInputRef.current) invoiceInputRef.current.value = ''; }} />
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation feedback */}
      <div className="flex items-center justify-between">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p 
              key="error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-sm text-destructive font-medium"
            >
              {error}
            </motion.p>
          ) : containerNumber && !isValid ? (
            <motion.p 
              key="hint"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-sm text-muted-foreground"
            >
              {11 - containerNumber.length} more characters needed
            </motion.p>
          ) : isValid ? (
            <motion.p 
              key="valid"
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-sm text-status-arrived font-medium flex items-center gap-1"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500 }}
              >
                ✓
              </motion.span>
              Valid container number
            </motion.p>
          ) : (
            <motion.p 
              key="format"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground"
            >
              Format: 4 letters + 7 digits
            </motion.p>
          )}
        </AnimatePresence>

        {/* Character counter */}
        <span className="text-xs text-muted-foreground font-mono">
          {containerNumber.length}/11
        </span>
      </div>
    </form>
  );
}

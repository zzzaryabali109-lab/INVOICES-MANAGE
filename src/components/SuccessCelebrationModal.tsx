import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SuccessIllustration } from './SuccessIllustration';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface SuccessCelebrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalTimeDisplay: string;
  totalBls: number;
  totalInvoices: number;
  downloadingAll: boolean;
  downloadProgressText: string;
  onDownloadAll: () => void;
}

export function SuccessCelebrationModal({
  open,
  onOpenChange,
  totalTimeDisplay,
  totalBls,
  totalInvoices,
  downloadingAll,
  downloadProgressText,
  onDownloadAll,
}: SuccessCelebrationModalProps) {
  const handleOkClick = () => {
    if (totalInvoices > 0 && !downloadingAll) {
      onDownloadAll();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[340px] sm:max-w-[360px] w-[90vw] p-0 border border-white/80 dark:border-white/10 rounded-[32px] bg-card shadow-neu overflow-hidden focus:outline-none [&>button.absolute]:hidden"
      >
        <div className="pt-9 pb-8 px-6 sm:px-7 text-center flex flex-col items-center select-none">
          {/* Exact Graphic Illustration matching uploaded reference design */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220 }}
            className="w-full flex justify-center -mt-1"
          >
            <SuccessIllustration size={170} />
          </motion.div>

          {/* Heading matching uploaded reference: 'Success' */}
          <DialogTitle asChild>
            <motion.h3
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="text-[22px] font-bold text-foreground tracking-tight mt-3 text-center"
            >
              Success
            </motion.h3>
          </DialogTitle>

          {/* Subtitle matching uploaded reference style */}
          <DialogDescription asChild>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="text-[13px] sm:text-[14px] text-muted-foreground font-normal leading-relaxed mt-1.5 max-w-[260px] text-center"
            >
              Congratulations on your invoices generated successfully!
            </motion.p>
          </DialogDescription>

          {/* Subtle Details Tag: Time, BLs, Invoices */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mt-3 px-3.5 py-1.5 rounded-full bg-card shadow-neu-inset-sm border border-border/40 text-[11px] text-foreground font-medium flex items-center gap-2"
          >
            <span>Time: <strong className="text-primary">{totalTimeDisplay || '0.0s'}</strong></span>
            <span>•</span>
            <span>BLs: <strong className="text-primary">{totalBls}</strong></span>
            <span>•</span>
            <span>Invoices: <strong className="text-primary">{totalInvoices}</strong></span>
          </motion.div>

          {/* Download status hint if actively downloading */}
          {downloadingAll && (
            <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span>{downloadProgressText || 'Downloading files...'}</span>
            </div>
          )}

          {/* Exact Pill Button matching reference: 'ok' in coral-red */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26 }}
            className="mt-6 w-full flex flex-col items-center"
          >
            <button
              onClick={handleOkClick}
              disabled={downloadingAll}
              className="w-36 h-10 rounded-full bg-[#ff3b68] hover:bg-[#eb2b58] active:scale-[0.98] text-white text-sm font-semibold tracking-wide shadow-neu-sm hover:shadow-neu transition-all cursor-pointer flex items-center justify-center disabled:opacity-75"
            >
              {downloadingAll ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span className="text-xs">Saving...</span>
                </div>
              ) : (
                'ok'
              )}
            </button>

            {/* Subtle dismiss / view files option */}
            <button
              onClick={() => onOpenChange(false)}
              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Close and view files
            </button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

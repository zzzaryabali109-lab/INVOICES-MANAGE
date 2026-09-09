import { ContainerData, ContainerStatus } from '@/types/container';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Ship, 
  MapPin, 
  Clock, 
  AlertCircle,
  Loader2,
  Anchor,
  CheckCircle2,
  Package,
  Timer,
  Trash2,
  Upload,
  Download,
  FileText,
  Receipt
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RealTimeETA } from '@/components/RealTimeETA';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadDocument, getDocumentUrl, getDocumentsStatus, DocumentType } from '@/services/documentService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TrackingTableProps {
  data: ContainerData[];
  onDeleteSelected?: (containerNumbers: string[]) => void;
  isDeleting?: boolean;
}

function getStatusConfig(status: ContainerStatus) {
  switch (status) {
    case 'In Transit':
      return { 
        color: 'bg-status-transit/15 text-status-transit border-status-transit/30', 
        icon: Ship,
        label: 'In Transit',
        gradient: 'from-status-transit/20 to-transparent'
      };
    case 'Arrived':
      return { 
        color: 'bg-status-arrived/15 text-status-arrived border-status-arrived/30', 
        icon: CheckCircle2,
        label: 'Arrived',
        gradient: 'from-status-arrived/20 to-transparent'
      };
    case 'Discharged':
      return { 
        color: 'bg-status-discharged/15 text-status-discharged border-status-discharged/30', 
        icon: Package,
        label: 'Discharged',
        gradient: 'from-status-discharged/20 to-transparent'
      };
    case 'Loading':
      return { 
        color: 'bg-primary/15 text-primary border-primary/30', 
        icon: Anchor,
        label: 'Loading',
        gradient: 'from-primary/20 to-transparent'
      };
    case 'Pending':
      return { 
        color: 'bg-status-pending/15 text-status-pending border-status-pending/30', 
        icon: Timer,
        label: 'Pending',
        gradient: 'from-status-pending/20 to-transparent'
      };
    default:
      return { 
        color: 'bg-muted text-muted-foreground border-border', 
        icon: AlertCircle,
        label: 'Not Available',
        gradient: 'from-muted/20 to-transparent'
      };
  }
}

function StatusBadge({ status }: { status: ContainerStatus }) {
  const config = getStatusConfig(status);
  const Icon = config.icon;
  
  return (
    <motion.span 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-neu-xs',
        config.color
      )}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </motion.span>
  );
}

function DocButtons({ containerNumber, docStatus }: { 
  containerNumber: string; 
  docStatus: { bl: boolean; invoice: boolean } | undefined;
}) {
  const blInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [localStatus, setLocalStatus] = useState(docStatus);

  useEffect(() => {
    setLocalStatus(docStatus);
  }, [docStatus]);

  const handleUpload = async (docType: DocumentType, file: File) => {
    setUploading(docType);
    const result = await uploadDocument(containerNumber, docType, file);
    if (result.success) {
      toast.success(`${docType === 'bl' ? 'BL' : 'Invoice'} uploaded for ${containerNumber}`);
      setLocalStatus(prev => prev ? { ...prev, [docType]: true } : { bl: docType === 'bl', invoice: docType === 'invoice' });
    } else {
      toast.error(`Upload failed: ${result.error}`);
    }
    setUploading(null);
  };

  const handleDownload = async (docType: DocumentType) => {
    const { url } = await getDocumentUrl(containerNumber, docType);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error(`No ${docType === 'bl' ? 'BL' : 'Invoice'} found`);
    }
  };

  const hasDoc = (type: DocumentType) => localStatus?.[type] ?? false;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        {/* BL */}
        <input 
          ref={blInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={(e) => { if (e.target.files?.[0]) handleUpload('bl', e.target.files[0]); e.target.value = ''; }}
        />
        {hasDoc('bl') ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-status-arrived" onClick={() => handleDownload('bl')}>
                <FileText className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Download BL</p></TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" 
                onClick={() => blInputRef.current?.click()} disabled={uploading === 'bl'}>
                {uploading === 'bl' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Upload BL</p></TooltipContent>
          </Tooltip>
        )}

        {/* Invoice */}
        <input 
          ref={invoiceInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={(e) => { if (e.target.files?.[0]) handleUpload('invoice', e.target.files[0]); e.target.value = ''; }}
        />
        {hasDoc('invoice') ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleDownload('invoice')}>
                <Receipt className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Download Invoice</p></TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" 
                onClick={() => invoiceInputRef.current?.click()} disabled={uploading === 'invoice'}>
                {uploading === 'invoice' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Upload Invoice</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export function TrackingTable({ data, onDeleteSelected, isDeleting }: TrackingTableProps) {
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set());
  const [docStatuses, setDocStatuses] = useState<Record<string, { bl: boolean; invoice: boolean }>>({});
  const { user } = useAuth();

  // Load document statuses
  useEffect(() => {
    if (!user || data.length === 0) return;
    const containerNumbers = data.map(c => c.containerNumber);
    getDocumentsStatus(user.id, containerNumbers).then(setDocStatuses);
  }, [user, data.length]);

  if (data.length === 0) {
    return null;
  }

  const allSelected = selectedContainers.size === data.length && data.length > 0;
  const someSelected = selectedContainers.size > 0 && selectedContainers.size < data.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContainers(new Set(data.map(c => c.containerNumber)));
    } else {
      setSelectedContainers(new Set());
    }
  };

  const handleSelectOne = (containerNumber: string, checked: boolean) => {
    const newSet = new Set(selectedContainers);
    if (checked) {
      newSet.add(containerNumber);
    } else {
      newSet.delete(containerNumber);
    }
    setSelectedContainers(newSet);
  };

  const handleDeleteSelected = () => {
    if (onDeleteSelected && selectedContainers.size > 0) {
      onDeleteSelected(Array.from(selectedContainers));
      setSelectedContainers(new Set());
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-4"
    >
      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedContainers.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="flex items-center justify-between p-4 rounded-2xl bg-card border border-white/80 dark:border-white/10 shadow-neu"
          >
            <span className="text-sm font-semibold text-foreground">
              {selectedContainers.size} container{selectedContainers.size > 1 ? 's' : ''} selected
            </span>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="gap-2 rounded-xl"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-3xl border border-white/80 dark:border-white/10 bg-card shadow-neu">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                  />
                </TableHead>
                <TableHead className="font-semibold text-foreground">Container</TableHead>
                <TableHead className="font-semibold text-foreground">Line</TableHead>
                <TableHead className="font-semibold text-foreground">Location</TableHead>
                <TableHead className="font-semibold text-foreground">Vessel</TableHead>
                <TableHead className="font-semibold text-foreground">Voyage</TableHead>
                <TableHead className="font-semibold text-foreground">Destination</TableHead>
                <TableHead className="font-semibold text-foreground">ETA</TableHead>
                <TableHead className="font-semibold text-foreground">Updated</TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
                <TableHead className="font-semibold text-foreground text-center">Docs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((container, index) => (
                <motion.tr 
                  key={container.containerNumber}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.3 }}
                  className={cn(
                    'transition-all duration-200 hover:bg-muted/30 border-b border-border/40',
                    container.isTracking && 'bg-primary/5',
                    selectedContainers.has(container.containerNumber) && 'bg-primary/10'
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedContainers.has(container.containerNumber)}
                      onCheckedChange={(checked) => handleSelectOne(container.containerNumber, !!checked)}
                      aria-label={`Select ${container.containerNumber}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      {container.isTracking ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Loader2 className="w-4 h-4 text-primary" />
                        </motion.div>
                      ) : (
                        <Package className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="tracking-wide">{container.containerNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Ship className="w-4 h-4 text-primary" />
                      <span className="text-sm">{container.shippingLine || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-accent" />
                      <span className="max-w-[140px] truncate text-sm">
                        {container.currentLocation || '-'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="max-w-[100px] truncate block text-sm">
                      {container.vesselName || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {container.voyageNumber || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Anchor className="w-4 h-4 text-primary" />
                      <span className="max-w-[120px] truncate text-sm">
                        {container.destinationPort || 'MBQ'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RealTimeETA eta={container.eta} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">{container.lastUpdate || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {container.error ? (
                      <motion.span 
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20"
                      >
                        <AlertCircle className="w-3 h-3" />
                        Error
                      </motion.span>
                    ) : (
                      <StatusBadge status={container.status} />
                    )}
                  </TableCell>
                  <TableCell>
                    <DocButtons 
                      containerNumber={container.containerNumber} 
                      docStatus={docStatuses[container.containerNumber]}
                    />
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </motion.div>
  );
}

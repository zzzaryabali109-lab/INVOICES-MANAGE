import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { ContainerData, ContainerStatus } from '@/types/container';
import { fetchUserContainers, deleteContainer } from '@/services/containerDbService';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Ship, 
  MapPin, 
  Clock, 
  AlertCircle,
  Anchor,
  CheckCircle2,
  Package,
  Timer,
  Navigation,
  Globe,
  Filter,
  Search,
  ArrowRight,
  Sparkles,
  Container,
  Trash2,
  Loader2,
  Upload,
  FileText,
  Receipt
} from 'lucide-react';
import { getDocumentUrl, getDocumentsStatus, uploadDocument, DocumentType } from '@/services/documentService';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RealTimeETA } from '@/components/RealTimeETA';
import { Input } from '@/components/ui/input';

function getStatusConfig(status: ContainerStatus) {
  switch (status) {
    case 'In Transit':
      return { 
        color: 'bg-card text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800', 
        icon: Ship,
        label: 'In Transit',
        glow: 'shadow-neu-sm'
      };
    case 'Arrived':
      return { 
        color: 'bg-card text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', 
        icon: CheckCircle2,
        label: 'Arrived',
        glow: 'shadow-neu-sm'
      };
    case 'Discharged':
      return { 
        color: 'bg-card text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800', 
        icon: Package,
        label: 'Discharged',
        glow: 'shadow-neu-sm'
      };
    case 'Loading':
      return { 
        color: 'bg-card text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800', 
        icon: Anchor,
        label: 'Loading',
        glow: 'shadow-neu-sm'
      };
    case 'Pending':
      return { 
        color: 'bg-card text-muted-foreground border-border/40', 
        icon: Timer,
        label: 'Pending',
        glow: 'shadow-neu-sm'
      };
    default:
      return { 
        color: 'bg-card text-muted-foreground border-border/40', 
        icon: AlertCircle,
        label: 'Not Available',
        glow: 'shadow-neu-sm'
      };
  }
}

function StatusBadge({ status }: { status: ContainerStatus }) {
  const config = getStatusConfig(status);
  const Icon = config.icon;
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border',
      config.color,
      config.glow
    )}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

interface CardDocSectionProps {
  containerNumber: string;
  docStatus: { bl: boolean; invoice: boolean } | undefined;
}

function CardDocSection({ containerNumber, docStatus }: CardDocSectionProps) {
  const blInputRef = React.useRef<HTMLInputElement>(null);
  const invoiceInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState<DocumentType | null>(null);
  const [localStatus, setLocalStatus] = React.useState(docStatus);

  React.useEffect(() => {
    setLocalStatus(docStatus);
  }, [docStatus]);

  const handleDownload = async (docType: DocumentType) => {
    const { url } = await getDocumentUrl(containerNumber, docType);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error(`No ${docType === 'bl' ? 'BL' : 'Invoice'} found`);
    }
  };

  const handleUpload = async (docType: DocumentType, file: File) => {
    setUploading(docType);
    const result = await uploadDocument(containerNumber, docType, file);
    if (result.success) {
      toast.success(`${docType === 'bl' ? 'BL' : 'Invoice'} replaced for ${containerNumber}`);
      setLocalStatus(prev => prev ? { ...prev, [docType]: true } : { bl: docType === 'bl', invoice: docType === 'invoice' });
    } else {
      toast.error(`Upload failed: ${result.error}`);
    }
    setUploading(null);
  };

  const hasBl = localStatus?.bl ?? false;
  const hasInvoice = localStatus?.invoice ?? false;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Hidden file inputs */}
      <input ref={blInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        onChange={(e) => { if (e.target.files?.[0]) handleUpload('bl', e.target.files[0]); e.target.value = ''; }} />
      <input ref={invoiceInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        onChange={(e) => { if (e.target.files?.[0]) handleUpload('invoice', e.target.files[0]); e.target.value = ''; }} />

      {/* BL */}
      {hasBl ? (
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={() => handleDownload('bl')}
            className="gap-2 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 transition-all">
            <FileText className="w-4 h-4" />
            <span className="font-semibold">Download BL</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => blInputRef.current?.click()} disabled={uploading === 'bl'}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-xl h-7">
            {uploading === 'bl' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Re-upload BL
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => blInputRef.current?.click()} disabled={uploading === 'bl'}
          className="gap-2 rounded-xl border-dashed border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/30 transition-all">
          {uploading === 'bl' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>Upload BL</span>
        </Button>
      )}

      {/* Invoice */}
      {hasInvoice ? (
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={() => handleDownload('invoice')}
            className="gap-2 rounded-xl border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all">
            <Receipt className="w-4 h-4" />
            <span className="font-semibold">Download Invoice</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => invoiceInputRef.current?.click()} disabled={uploading === 'invoice'}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-xl h-7">
            {uploading === 'invoice' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Re-upload Invoice
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => invoiceInputRef.current?.click()} disabled={uploading === 'invoice'}
          className="gap-2 rounded-xl border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
          {uploading === 'invoice' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>Upload Invoice</span>
        </Button>
      )}
    </div>
  );
}
interface LocationCardProps {
  container: ContainerData;
  onDelete: (containerNumber: string) => void;
  isDeleting: boolean;
  docStatus: { bl: boolean; invoice: boolean } | undefined;
}

function LocationCard({ container, onDelete, isDeleting, docStatus }: LocationCardProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-card border border-white/80 dark:border-white/10 shadow-neu hover:shadow-neu-hover transition-all duration-300 group">
      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-primary">
              <Container className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground font-mono tracking-wider">
                {container.containerNumber}
              </h3>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Ship className="w-3.5 h-3.5" />
                {container.shippingLine || 'Unknown Line'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={container.status} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shadow-neu-sm"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-destructive" />
                    Delete Container
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete container <span className="font-mono font-semibold text-foreground">{container.containerNumber}</span>? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl shadow-neu-sm">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(container.containerNumber)}
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-neu-sm"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Journey Map */}
        <div className="relative py-6">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/60 -translate-x-1/2" />
          
          {/* Origin */}
          <div className="relative flex items-center gap-4 mb-8">
            <div className="flex-1 text-right pr-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Origin</p>
              <p className="font-semibold text-foreground">Loading Port</p>
            </div>
            <div className="relative z-10 w-10 h-10 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-primary">
              <Anchor className="w-5 h-5" />
            </div>
            <div className="flex-1 pl-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Vessel</p>
              <p className="font-semibold text-foreground">{container.vesselName || 'TBD'}</p>
            </div>
          </div>

          {/* Current Location */}
          <div className="relative flex items-center gap-4 mb-8">
            <div className="flex-1 text-right pr-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Location</p>
              <p className="font-semibold text-foreground">{container.currentLocation || 'At Sea'}</p>
            </div>
            <div className="relative z-10 w-12 h-12 rounded-2xl bg-card shadow-neu-sm border border-border/40 flex items-center justify-center text-primary">
              <Navigation className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1 pl-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Voyage</p>
              <p className="font-mono font-semibold text-foreground">{container.voyageNumber || 'N/A'}</p>
            </div>
          </div>

          {/* Destination */}
          <div className="relative flex items-center gap-4">
            <div className="flex-1 text-right pr-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Destination</p>
              <p className="font-semibold text-foreground">{container.destinationPort || 'Mohammad Bin Qasim'}</p>
            </div>
            <div className="relative z-10 w-10 h-10 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 pl-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">ETA</p>
              <div className="font-semibold">
                <RealTimeETA eta={container.eta} />
              </div>
            </div>
          </div>
        </div>

        {/* Documents Section */}
        <div className="pt-4 mt-4 border-t border-border/40">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Documents</span>
          </div>
          <CardDocSection containerNumber={container.containerNumber} docStatus={docStatus} />
        </div>

        {/* Footer */}
        <div className="pt-4 mt-4 border-t border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Last Update: {container.lastUpdate || 'Not available'}</span>
            </div>
            {container.error && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="w-3 h-3" />
                Error
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Tracking() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContainer, setSelectedContainer] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDestination, setSelectedDestination] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingContainer, setDeletingContainer] = useState<string | null>(null);
  const [docStatuses, setDocStatuses] = useState<Record<string, { bl: boolean; invoice: boolean }>>({});

  // Load document statuses
  useEffect(() => {
    if (!user || containers.length === 0) return;
    const containerNumbers = containers.map(c => c.containerNumber);
    getDocumentsStatus(user.id, containerNumbers).then(setDocStatuses);
  }, [user, containers.length]);

  const handleDeleteContainer = async (containerNumber: string) => {
    setDeletingContainer(containerNumber);
    try {
      await deleteContainer(containerNumber);
      setContainers(prev => prev.filter(c => c.containerNumber !== containerNumber));
      toast.success('Container deleted successfully', {
        description: `Container ${containerNumber} has been removed from tracking.`,
      });
    } catch (error) {
      console.error('Error deleting container:', error);
      toast.error('Failed to delete container', {
        description: 'Please try again later.',
      });
    } finally {
      setDeletingContainer(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const loadContainers = async () => {
      if (!user) return;
      try {
        const data = await fetchUserContainers();
        setContainers(data);
      } catch (error) {
        console.error('Error loading containers:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadContainers();
    }
  }, [user]);

  const destinations = useMemo(() => {
    const uniqueDestinations = new Set(containers.map(c => c.destinationPort || 'Unknown'));
    return Array.from(uniqueDestinations);
  }, [containers]);

  const statuses = useMemo(() => {
    const uniqueStatuses = new Set(containers.map(c => c.status));
    return Array.from(uniqueStatuses);
  }, [containers]);

  const filteredContainers = useMemo(() => {
    return containers.filter(container => {
      const matchesContainer = selectedContainer === 'all' || container.containerNumber === selectedContainer;
      const matchesStatus = selectedStatus === 'all' || container.status === selectedStatus;
      const matchesDestination = selectedDestination === 'all' || 
        (container.destinationPort || 'Unknown') === selectedDestination;
      const matchesSearch = searchQuery === '' || 
        container.containerNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (container.vesselName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (container.shippingLine?.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return matchesContainer && matchesStatus && matchesDestination && matchesSearch;
    });
  }, [containers, selectedContainer, selectedStatus, selectedDestination, searchQuery]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-bounce">
            <Ship className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-lg font-medium text-muted-foreground animate-pulse">Loading your containers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="relative container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-card shadow-neu-sm border border-border/40 flex items-center justify-center text-primary">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                Container Tracking
              </h1>
              <p className="text-muted-foreground flex items-center gap-2 mt-1 text-sm">
                <Sparkles className="w-4 h-4 text-primary" />
                Real-time location updates for your shipments
              </p>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <Card className="mb-8 border border-white/80 dark:border-white/10 shadow-neu bg-card rounded-3xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="w-5 h-5 text-primary" />
              Filter Containers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search Input */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by container, vessel, or shipping line..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 bg-card rounded-2xl shadow-neu-inset-sm border border-border/40 focus:border-primary/50"
                />
              </div>

              {/* Container Dropdown */}
              <Select value={selectedContainer} onValueChange={setSelectedContainer}>
                <SelectTrigger className="h-12 bg-card rounded-2xl shadow-neu-inset-sm border border-border/40">
                  <div className="flex items-center gap-2">
                    <Container className="w-4 h-4 text-primary" />
                    <SelectValue placeholder="All Containers" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Containers</SelectItem>
                  {containers.map((c) => (
                    <SelectItem key={c.containerNumber} value={c.containerNumber}>
                      {c.containerNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Dropdown */}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-12 bg-card rounded-2xl shadow-neu-inset-sm border border-border/40">
                  <div className="flex items-center gap-2">
                    <Ship className="w-4 h-4 text-primary" />
                    <SelectValue placeholder="All Statuses" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Destination Dropdown */}
              <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                <SelectTrigger className="h-12 bg-card rounded-2xl shadow-neu-inset-sm border border-border/40">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                    <SelectValue placeholder="All Destinations" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Destinations</SelectItem>
                  {destinations.map((dest) => (
                    <SelectItem key={dest} value={dest}>
                      {dest}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{containers.length}</p>
                <p className="text-xs text-muted-foreground">Total Containers</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {containers.filter(c => c.status === 'Arrived').length}
                </p>
                <p className="text-xs text-muted-foreground">Arrived</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Ship className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {containers.filter(c => c.status === 'In Transit').length}
                </p>
                <p className="text-xs text-muted-foreground">In Transit</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center text-violet-600 dark:text-violet-400">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{destinations.length}</p>
                <p className="text-xs text-muted-foreground">Destinations</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Containers Grid */}
        {filteredContainers.length === 0 ? (
          <Card className="p-12 text-center bg-card border border-white/80 dark:border-white/10 shadow-neu rounded-3xl">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
                <Package className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">No containers found</h3>
              <p className="text-muted-foreground max-w-md">
                {containers.length === 0 
                  ? "You haven't tracked any containers yet. Go back to the home page to add containers."
                  : "No containers match your current filters. Try adjusting your search criteria."}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredContainers.map((container, index) => (
              <div 
                key={container.containerNumber}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <LocationCard 
                  container={container} 
                  onDelete={handleDeleteContainer}
                  isDeleting={deletingContainer === container.containerNumber}
                  docStatus={docStatuses[container.containerNumber]}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

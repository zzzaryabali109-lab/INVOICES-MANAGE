import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Header } from '@/components/Header';
import { FileUpload } from '@/components/FileUpload';
import { ManualEntryForm } from '@/components/ManualEntryForm';
import { TrackingTable } from '@/components/TrackingTable';
import { StatsCards } from '@/components/StatsCards';
import { ExportButtons } from '@/components/ExportButtons';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { EmailNotificationForm } from '@/components/EmailNotificationForm';
import { ContainerData } from '@/types/container';
import { trackContainer, trackContainers } from '@/services/trackingService';
import { sendStatusNotification, detectStatusChanges } from '@/services/notificationService';
import { fetchUserContainers, upsertContainer, upsertContainers, deleteAllContainers, deleteContainers } from '@/services/containerDbService';
import { uploadDocument } from '@/services/documentService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  RefreshCcw,
  FileSpreadsheet,
  Sparkles,
  Search,
  Clock,
  Bell,
  Loader2,
  Ship,
  Globe,
  Zap,
  Shield,
  Container,
  Waves,
  ArrowRight,
  Package } from
'lucide-react';
import { toast } from 'sonner';

const AUTO_REFRESH_INTERVAL = 3 * 60 * 60 * 1000;

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [containerNumbers, setContainerNumbers] = useState<string[]>([]);
  const [trackingData, setTrackingData] = useState<ContainerData[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [trackingProgress, setTrackingProgress] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [nextRefresh, setNextRefresh] = useState<Date | null>(null);
  const [notificationEmail, setNotificationEmail] = useState<string | null>(() => {
    return localStorage.getItem('cargotrack_notification_email');
  });
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousDataRef = useRef<ContainerData[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const loadContainers = async () => {
      if (!user) return;
      try {
        const containers = await fetchUserContainers();
        setTrackingData(containers);
        setContainerNumbers(containers.map((c) => c.containerNumber));
      } catch (error) {
        console.error('Error loading containers:', error);
        toast.error('Failed to load your containers');
      } finally {
        setIsLoadingData(false);
      }
    };
    if (user) {
      loadContainers();
    }
  }, [user]);

  useEffect(() => {
    if (containerNumbers.length > 0 && !isTracking) {
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
      }
      const nextTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL);
      setNextRefresh(nextTime);
      autoRefreshTimerRef.current = setTimeout(() => {
        toast.info('Auto-refreshing tracking data...');
        handleRefreshAll();
      }, AUTO_REFRESH_INTERVAL);
    }
    return () => {
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
      }
    };
  }, [containerNumbers.length, isTracking, lastRefresh]);

  const checkAndSendNotifications = useCallback(async (newData: ContainerData[]) => {
    if (!notificationEmail || previousDataRef.current.length === 0) return;
    const changes = detectStatusChanges(previousDataRef.current, newData);
    for (const { container, oldStatus } of changes) {
      const result = await sendStatusNotification(
        notificationEmail,
        container.containerNumber,
        oldStatus,
        container.status,
        container.vesselName,
        container.eta,
        container.destinationPort
      );
      if (result.success) {
        toast.success(`Notification sent for ${container.containerNumber}`);
      }
    }
  }, [notificationEmail]);

  const saveTrackingData = useCallback((data: ContainerData[]) => {
    localStorage.setItem('cargotrack_tracking_data', JSON.stringify(data));
    const now = new Date();
    const counts: Record<string, number> = {
      'In Transit': 0, 'Arrived': 0, 'Discharged': 0, 'Loading': 0, 'Pending': 0, 'Not Available': 0
    };
    data.forEach((container) => {
      if (counts[container.status] !== undefined) {
        counts[container.status]++;
      }
    });
    const historyEntry = {
      timestamp: now.toISOString(),
      date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      counts
    };
    const existingHistory = localStorage.getItem('cargotrack_status_history');
    let history = existingHistory ? JSON.parse(existingHistory) : [];
    history.push(historyEntry);
    if (history.length > 50) {
      history = history.slice(-50);
    }
    localStorage.setItem('cargotrack_status_history', JSON.stringify(history));
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (containerNumbers.length === 0 || isTracking || !user) return;
    previousDataRef.current = [...trackingData];
    setIsTracking(true);
    setTrackingProgress(0);
    setTrackingData((prev) => prev.map((item) => ({ ...item, isTracking: true })));
    const newResults: ContainerData[] = [];
    try {
      await trackContainers(containerNumbers, (completed, data) => {
        setTrackingProgress(completed);
        newResults.push(data);
        setTrackingData((prev) =>
        prev.map((item) =>
        item.containerNumber === data.containerNumber ?
        { ...data, isTracking: false } :
        item
        )
        );
      });
      await upsertContainers(newResults, user.id);
      await checkAndSendNotifications(newResults);
      saveTrackingData(newResults);
      setLastRefresh(new Date());
      toast.success('All containers refreshed!');
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error('Some containers failed to refresh');
    } finally {
      setIsTracking(false);
    }
  }, [containerNumbers, isTracking, trackingData, user, checkAndSendNotifications, saveTrackingData]);

  const handleSubscribe = useCallback((email: string) => {
    setNotificationEmail(email);
    localStorage.setItem('cargotrack_notification_email', email);
  }, []);

  const handleUnsubscribe = useCallback(() => {
    setNotificationEmail(null);
    localStorage.removeItem('cargotrack_notification_email');
    toast.info('Email notifications disabled');
  }, []);

  const handleFileProcessed = useCallback(async (numbers: string[]) => {
    if (!user) return;
    const existingNumbers = new Set(trackingData.map((c) => c.containerNumber));
    const newNumbers = numbers.filter((num) => !existingNumbers.has(num));
    if (newNumbers.length === 0) {
      toast.info(`All ${numbers.length} containers are already being tracked`);
      return;
    }
    const allNumbers = [...containerNumbers, ...newNumbers];
    setContainerNumbers(allNumbers);
    toast.success(`Found ${numbers.length} containers, tracking ${newNumbers.length} new ones!`);
    const initialData: ContainerData[] = newNumbers.map((num) => ({
      containerNumber: num, shippingLine: '', currentLocation: '', vesselName: '',
      voyageNumber: '', eta: '', lastUpdate: '', status: 'Pending', isTracking: true
    }));
    setTrackingData((prev) => [...prev, ...initialData]);
    setIsTracking(true);
    setTrackingProgress(0);
    const results: ContainerData[] = [];
    try {
      await trackContainers(newNumbers, async (completed, data) => {
        setTrackingProgress(completed);
        results.push(data);
        setTrackingData((prev) =>
        prev.map((item) =>
        item.containerNumber === data.containerNumber ?
        { ...data, isTracking: false } :
        item
        )
        );
        await upsertContainer(data, user.id);
      });
      setTrackingData((prev) => {
        saveTrackingData(prev);
        return prev;
      });
      toast.success(`${newNumbers.length} containers tracked successfully!`);
    } catch (error) {
      console.error('Tracking error:', error);
      toast.error('Some containers failed to track');
    } finally {
      setIsTracking(false);
    }
  }, [user, saveTrackingData, trackingData, containerNumbers]);

  const handleManualTrack = useCallback(async (containerNumber: string, blFile?: File, invoiceFile?: File) => {
    if (!user) return;
    if (trackingData.some((c) => c.containerNumber === containerNumber)) {
      toast.info('Container is already in the tracking list');
      return;
    }
    setContainerNumbers((prev) => [...prev, containerNumber]);
    const newContainer: ContainerData = {
      containerNumber, shippingLine: '', currentLocation: '', vesselName: '',
      voyageNumber: '', eta: '', lastUpdate: '', status: 'Pending', isTracking: true
    };
    setTrackingData((prev) => [...prev, newContainer]);
    toast.info(`Tracking ${containerNumber}...`);

    // Upload documents in parallel if provided
    const uploadPromises: Promise<void>[] = [];
    if (blFile) {
      uploadPromises.push(
        uploadDocument(containerNumber, 'bl', blFile).then((r) => {
          if (r.success) toast.success('BL uploaded successfully');else
          toast.error(`BL upload failed: ${r.error}`);
        })
      );
    }
    if (invoiceFile) {
      uploadPromises.push(
        uploadDocument(containerNumber, 'invoice', invoiceFile).then((r) => {
          if (r.success) toast.success('Invoice uploaded successfully');else
          toast.error(`Invoice upload failed: ${r.error}`);
        })
      );
    }

    try {
      const [result] = await Promise.all([
      trackContainer(containerNumber),
      ...uploadPromises]
      );
      const data = result.data || {
        containerNumber, shippingLine: '', currentLocation: '', vesselName: '',
        voyageNumber: '', eta: '', lastUpdate: '', status: 'Not Available' as const, error: result.error
      };
      await upsertContainer(data, user.id);
      setTrackingData((prev) => {
        const updated = prev.map((item) =>
        item.containerNumber === containerNumber ?
        { ...data, isTracking: false } :
        item
        );
        saveTrackingData(updated);
        return updated;
      });
      if (result.success) {
        toast.success(`${containerNumber} tracked successfully!`);
      } else {
        toast.error(`Failed to track ${containerNumber}`);
      }
    } catch (error) {
      console.error('Manual tracking error:', error);
      setTrackingData((prev) =>
      prev.map((item) =>
      item.containerNumber === containerNumber ?
      { ...item, isTracking: false, status: 'Not Available', error: 'Tracking failed' } :
      item
      )
      );
      toast.error(`Failed to track ${containerNumber}`);
    }
  }, [trackingData, user, saveTrackingData]);

  const handleClear = useCallback(async () => {
    try {
      await deleteAllContainers();
      setContainerNumbers([]);
      setTrackingData([]);
      setTrackingProgress(0);
      setLastRefresh(null);
      setNextRefresh(null);
      localStorage.removeItem('cargotrack_tracking_data');
      localStorage.removeItem('cargotrack_status_history');
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
      }
      toast.success('All containers cleared');
    } catch (error) {
      console.error('Error clearing containers:', error);
      toast.error('Failed to clear containers');
    }
  }, []);

  const handleDeleteSelected = useCallback(async (containerNumbersToDelete: string[]) => {
    try {
      await deleteContainers(containerNumbersToDelete);
      setContainerNumbers((prev) => prev.filter((n) => !containerNumbersToDelete.includes(n)));
      setTrackingData((prev) => prev.filter((c) => !containerNumbersToDelete.includes(c.containerNumber)));
      toast.success(`${containerNumbersToDelete.length} container${containerNumbersToDelete.length > 1 ? 's' : ''} deleted`);
    } catch (error) {
      console.error('Error deleting containers:', error);
      toast.error('Failed to delete containers');
    }
  }, []);

  if (authLoading || user && isLoadingData) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4">
            
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              
              <Loader2 className="w-10 h-10 text-primary mx-auto" />
            </motion.div>
            <p className="text-muted-foreground font-medium">Loading your containers...</p>
          </motion.div>
        </main>
      </div>);

  }

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-hidden">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section - Only show when no data */}
        {trackingData.length === 0 &&
        <section className="relative py-16 lg:py-24 overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
              className="absolute top-20 left-[10%] w-72 h-72 bg-primary/10 rounded-full blur-3xl"
              animate={{
                x: [0, 30, 0],
                y: [0, -20, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
            
              <motion.div
              className="absolute top-40 right-[10%] w-80 h-80 bg-accent/10 rounded-full blur-3xl"
              animate={{
                x: [0, -20, 0],
                y: [0, 30, 0],
                scale: [1.1, 1, 1.1]
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
            
              <motion.div
              className="absolute bottom-20 left-1/3 w-64 h-64 bg-status-arrived/10 rounded-full blur-3xl"
              animate={{
                x: [0, 20, 0],
                y: [0, 20, 0]
              }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
            
            </div>
            
            <div className="container mx-auto px-4 relative z-10">
              <div className="text-center space-y-6 max-w-3xl mx-auto">
                {/* Badge */}
                <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/60 shadow-lg">
                
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-arrived opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-status-arrived" />
                  </span>
                  <span className="text-sm font-medium text-foreground">Real-time Container Tracking</span>
                </motion.div>
                
                {/* Main heading */}
                <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold font-display leading-tight tracking-tight">
                
                  Track Your Cargo
                  <br />
                  <span className="text-gradient">Across the Globe</span>
                </motion.h1>
                
                {/* Subheading */}
                <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-lg text-muted-foreground max-w-xl mx-auto">
                
                  Real-time visibility for your shipments. Track containers from MSC, Maersk, CMA CGM, and more.
                </motion.p>
                
                {/* Feature pills */}
                <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap justify-center gap-2">
                
                  {[
                { icon: Globe, label: 'Global Coverage' },
                { icon: Zap, label: 'Instant Updates' },
                { icon: Shield, label: 'Secure & Reliable' }].
                map((feature, i) =>
                <motion.div
                  key={feature.label}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/80 backdrop-blur-sm border border-border/60 shadow-sm">
                  
                      <feature.icon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{feature.label}</span>
                    </motion.div>
                )}
                </motion.div>
              </div>
              
              {/* Floating icons */}
              <motion.div
              className="hidden lg:block absolute top-1/4 left-[5%]"
              animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
              
                <div className="w-14 h-14 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/60 shadow-lg flex items-center justify-center">
                  <Container className="w-7 h-7 text-primary" />
                </div>
              </motion.div>
              <motion.div
              className="hidden lg:block absolute top-1/3 right-[5%]"
              animate={{ y: [0, 15, 0], rotate: [0, -5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}>
              
                <div className="w-12 h-12 rounded-xl bg-card/80 backdrop-blur-sm border border-border/60 shadow-lg flex items-center justify-center">
                  <Ship className="w-6 h-6 text-accent" />
                </div>
              </motion.div>
            </div>
          </section>
        }

        {/* Main Content */}
        <div className="container mx-auto px-4 pb-16 space-y-8">
          {/* Centered Page Heading - Always Visible */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center py-10 lg:py-14">
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-arrived opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-arrived" />
              </span>
              <span className="text-sm font-medium text-primary">Live Container Tracking</span>
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-4xl md:text-5xl lg:text-6xl font-extrabold font-display leading-tight tracking-tight mb-4">
              
              Track Your <span className="text-gradient">Cargo</span>
              <br />
              <span className="text-gradient-sunset">Worldwide</span>
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              
              Real-time visibility for MSC, Maersk, CMA CGM, and more shipping lines
            </motion.p>
            
            {trackingData.length > 0 &&
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-6 inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/60 shadow-lg">
              
                <Package className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {trackingData.length} container{trackingData.length !== 1 ? 's' : ''} being tracked
                </span>
              </motion.div>
            }
          </motion.div>

          {/* Input Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Manual Entry Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              whileHover={{ y: -3 }}
              className="bg-card rounded-3xl border border-white/80 dark:border-white/10 shadow-neu p-6 lg:p-8 transition-all duration-300 hover:shadow-neu-lg">
              
              <div className="flex items-center gap-4 mb-6">
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-card shadow-neu-sm border border-white/90 dark:border-white/10 flex items-center justify-center"
                  whileHover={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.4 }}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-neu-primary">
                    <Search className="w-5 h-5 text-white" />
                  </div>
                </motion.div>
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground">Track Container</h3>
                  <p className="text-sm text-muted-foreground font-medium">Enter container number</p>
                </div>
              </div>
              <ManualEntryForm onTrack={handleManualTrack} isTracking={isTracking} />
            </motion.div>

            {/* Bulk Upload Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={{ y: -3 }}
              className="bg-card rounded-3xl border border-white/80 dark:border-white/10 shadow-neu p-6 lg:p-8 transition-all duration-300 hover:shadow-neu-lg">
              
              <div className="flex items-center gap-4 mb-6">
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-card shadow-neu-sm border border-white/90 dark:border-white/10 flex items-center justify-center"
                  whileHover={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.4 }}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-neu-accent">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                </motion.div>
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground">Bulk Upload</h3>
                  <p className="text-sm text-muted-foreground font-medium">Upload Excel with containers</p>
                </div>
              </div>
              <FileUpload onFileProcessed={handleFileProcessed} isProcessing={isTracking} />
            </motion.div>
          </div>

          {/* Results Section */}
          {trackingData.length > 0 &&
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6">
            
              {/* Stats */}
              <StatsCards data={trackingData} isTracking={isTracking} />
              
              {/* Email & Actions Row */}
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Email Notifications */}
                <motion.div
                whileHover={{ scale: 1.005 }}
                className="flex-1 bg-card rounded-2xl border border-white/80 dark:border-white/10 shadow-neu p-5">
                
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-card shadow-neu-xs border border-white/80 dark:border-white/10 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground text-sm">Email Notifications</span>
                      <p className="text-xs text-muted-foreground">Get alerts on status changes</p>
                    </div>
                  </div>
                  <EmailNotificationForm
                  subscribedEmail={notificationEmail}
                  onSubscribe={handleSubscribe}
                  onUnsubscribe={handleUnsubscribe} />
                
                </motion.div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  {nextRefresh && !isTracking &&
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card shadow-neu-xs border border-white/80 dark:border-white/10 px-4 py-2.5 rounded-xl">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>Auto-refresh in 3h</span>
                    </div>
                }
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                    onClick={handleRefreshAll}
                    disabled={isTracking}
                    variant="outline"
                    className="gap-2 rounded-xl">
                    
                      <RefreshCcw className="w-4 h-4" />
                      Refresh All
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                    onClick={handleClear}
                    disabled={isTracking}
                    variant="ghost"
                    className="text-muted-foreground rounded-xl">
                    
                      Clear All
                    </Button>
                  </motion.div>
                  <ExportButtons data={trackingData} disabled={isTracking} />
                </div>
              </div>
              
              {/* Table */}
              <TrackingTable
              data={trackingData}
              onDeleteSelected={handleDeleteSelected}
              isDeleting={isTracking} />
            
            </motion.section>
          }
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-border/60 py-8 mt-auto">
        <div className="absolute inset-0 bg-gradient-to-t from-muted/20 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Waves className="w-5 h-5 text-primary" />
              <span className="text-lg font-bold font-display">
                <span className="text-foreground">Ship</span>
                <span className="text-gradient">Ahead</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ShipAhead. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Loading Overlay */}
      {isTracking && trackingData.length > 0 &&
      <LoadingOverlay progress={trackingProgress} total={containerNumbers.length} />
      }
    </div>);

};

export default Index;
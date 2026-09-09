import { useState, useEffect } from 'react';
import { Clock, Calendar, AlertCircle } from 'lucide-react';

interface RealTimeETAProps {
  eta: string;
}

function parseETA(eta: string): Date | null {
  if (!eta || eta === '-' || eta === 'N/A' || eta === 'TBD') return null;
  
  // Try parsing various date formats
  const date = new Date(eta);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try parsing "DD MMM YYYY" format (e.g., "16 Jan 2026")
  const dateMatch = eta.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = monthNames.indexOf(month.toLowerCase());
    if (monthIndex !== -1) {
      return new Date(parseInt(year), monthIndex, parseInt(day));
    }
  }
  
  // Try parsing "MMM DD, YYYY" format (e.g., "Jan 16, 2026")
  const dateMatch2 = eta.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (dateMatch2) {
    const [, month, day, year] = dateMatch2;
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = monthNames.indexOf(month.toLowerCase());
    if (monthIndex !== -1) {
      return new Date(parseInt(year), monthIndex, parseInt(day));
    }
  }
  
  return null;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Arrived';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  return `${seconds}s`;
}

export function RealTimeETA({ eta }: RealTimeETAProps) {
  const [countdown, setCountdown] = useState<string>('');
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const etaDate = parseETA(eta);
    
    if (!etaDate) {
      // Show the raw string if we can't parse it, or a placeholder
      setCountdown(eta && eta.trim() !== '' ? eta : 'Pending');
      setIsLive(false);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = etaDate.getTime() - now.getTime();
      setCountdown(formatCountdown(diff));
      setIsLive(diff > 0);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [eta]);

  // Handle null, undefined, or empty eta
  if (!eta || eta.trim() === '') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">Pending</span>
      </div>
    );
  }

  const etaDate = parseETA(eta);

  // If we couldn't parse the date, show the raw ETA string nicely
  if (!etaDate) {
    return (
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{eta}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {etaDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </span>
      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-card shadow-neu-inset-sm border border-border/30 w-fit">
        {isLive && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
        <span className={`font-mono text-xs ${isLive ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
          {countdown}
        </span>
      </div>
    </div>
  );
}

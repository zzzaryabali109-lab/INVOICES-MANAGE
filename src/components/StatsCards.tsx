import { ContainerData } from '@/types/container';
import { Package, Ship, MapPin, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatsCardsProps {
  data: ContainerData[];
  isTracking: boolean;
}

export function StatsCards({ data, isTracking }: StatsCardsProps) {
  const total = data.length;
  const inTransit = data.filter(d => d.status === 'In Transit').length;
  const arrived = data.filter(d => d.status === 'Arrived').length;
  const discharged = data.filter(d => d.status === 'Discharged').length;
  const errors = data.filter(d => d.error || d.status === 'Not Available').length;
  const tracking = data.filter(d => d.isTracking).length;

  const stats = [
    {
      label: 'Total',
      value: total,
      icon: Package,
      gradient: 'from-primary/20 via-primary/10 to-transparent',
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
      borderColor: 'border-primary/20'
    },
    {
      label: 'In Transit',
      value: inTransit,
      icon: Ship,
      gradient: 'from-status-transit/20 via-status-transit/10 to-transparent',
      iconBg: 'bg-status-transit/15',
      iconColor: 'text-status-transit',
      borderColor: 'border-status-transit/20'
    },
    {
      label: 'Arrived',
      value: arrived,
      icon: MapPin,
      gradient: 'from-status-arrived/20 via-status-arrived/10 to-transparent',
      iconBg: 'bg-status-arrived/15',
      iconColor: 'text-status-arrived',
      borderColor: 'border-status-arrived/20'
    },
    {
      label: 'Discharged',
      value: discharged,
      icon: CheckCircle2,
      gradient: 'from-status-discharged/20 via-status-discharged/10 to-transparent',
      iconBg: 'bg-status-discharged/15',
      iconColor: 'text-status-discharged',
      borderColor: 'border-status-discharged/20'
    },
    {
      label: isTracking ? 'Tracking' : 'Errors',
      value: isTracking ? tracking : errors,
      icon: isTracking ? Clock : AlertTriangle,
      gradient: isTracking ? 'from-primary/20 via-primary/10 to-transparent' : 'from-destructive/20 via-destructive/10 to-transparent',
      iconBg: isTracking ? 'bg-primary/15' : 'bg-destructive/15',
      iconColor: isTracking ? 'text-primary' : 'text-destructive',
      borderColor: isTracking ? 'border-primary/20' : 'border-destructive/20'
    }
  ];

  return (
    <motion.div 
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.08 }
        }
      }}
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            variants={{
              hidden: { opacity: 0, y: 20, scale: 0.95 },
              visible: { opacity: 1, y: 0, scale: 1 }
            }}
            whileHover={{ 
              y: -3, 
              transition: { duration: 0.2 } 
            }}
            className={cn(
              'relative overflow-hidden rounded-2xl border border-white/80 dark:border-white/10 p-4 bg-card shadow-neu transition-all duration-300 hover:shadow-neu-lg group'
            )}
          >
            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <motion.div 
                  className={cn('w-10 h-10 rounded-xl flex items-center justify-center shadow-neu-inset-sm border border-border/40', stat.iconBg)}
                  whileHover={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.4 }}
                >
                  <Icon className={cn('w-5 h-5', stat.iconColor)} />
                </motion.div>
                {isTracking && stat.label === 'Tracking' && (
                  <motion.span 
                    className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm"
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
              <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{stat.label}</p>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { Ship, Anchor, Container, Waves } from 'lucide-react';

interface LoadingOverlayProps {
  progress: number;
  total: number;
}

export function LoadingOverlay({ progress, total }: LoadingOverlayProps) {
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-card/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-border/60 p-8 max-w-md w-full mx-4"
      >
        <div className="flex flex-col items-center text-center">
          {/* Animated ship with waves */}
          <div className="relative w-28 h-28 mb-6">
            {/* Outer ring */}
            <motion.div 
              className="absolute inset-0 rounded-full border-2 border-primary/20"
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
            {/* Middle ring */}
            <motion.div 
              className="absolute inset-2 rounded-full border-2 border-dashed border-primary/30"
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />
            {/* Inner glow */}
            <motion.div 
              className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/10"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Ship icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Ship className="w-12 h-12 text-primary" />
              </motion.div>
            </div>
            {/* Wave animation at bottom */}
            <motion.div 
              className="absolute -bottom-2 left-1/2 -translate-x-1/2"
              animate={{ y: [0, 2, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Waves className="w-8 h-8 text-primary/40" />
            </motion.div>
          </div>
          
          <motion.h3 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xl font-bold font-display text-foreground mb-2"
          >
            Tracking Containers
          </motion.h3>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground text-sm mb-6"
          >
            Fetching real-time data from shipping lines...
          </motion.p>
          
          {/* Progress bar with glow */}
          <div className="w-full mb-4 relative">
            <div className="h-3 bg-muted/60 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-primary via-primary to-accent rounded-full relative"
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {/* Shine effect */}
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
                />
              </motion.div>
            </div>
            {/* Glow under progress bar */}
            <motion.div 
              className="absolute -bottom-1 left-0 h-2 bg-primary/30 blur-md rounded-full"
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          
          <div className="flex items-center justify-between w-full text-sm">
            <span className="text-muted-foreground">
              <motion.span
                key={progress}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-block"
              >
                {progress}
              </motion.span>
              {' '}of {total} containers
            </span>
            <motion.span 
              key={percentage}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="font-bold text-primary"
            >
              {percentage}%
            </motion.span>
          </div>
          
          {/* Decorative icons */}
          <div className="flex items-center gap-6 mt-6">
            {[Anchor, Container, Ship].map((Icon, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.4, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
              >
                <Icon className="w-5 h-5 text-muted-foreground" />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

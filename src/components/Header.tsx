import { Ship, BarChart3, LogOut, User, Sparkles, Globe, Waves, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Ship },
    { path: '/tracking', label: 'Tracking', icon: Globe },
    { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { path: '/invoice-home', label: 'Invoice', icon: Sparkles },
    { path: '/noc-tracker', label: 'NOC', icon: ShieldCheck },
  ];

  const isItemActive = (path: string) => {
    if (path === '/invoice-home') {
      return (
        location.pathname === '/invoice-home' ||
        location.pathname.startsWith('/invoice-generator') ||
        location.pathname.startsWith('/multi-bl-invoice')
      );
    }
    return location.pathname === path;
  };
  
  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full pt-2 pb-2 px-3 md:px-6"
    >
      {/* Neumorphic floating navbar */}
      <div className="mx-auto max-w-7xl">
        <div className="bg-card/95 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-white/80 dark:border-white/5 shadow-neu px-3.5 sm:px-4 py-2.5">
          <div className="flex items-center justify-between">
            {/* Logo with tactile neumorphic badge */}
            <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-card shadow-neu flex items-center justify-center border border-white/90 dark:border-white/10">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-neu-primary">
                    <Waves className="w-4 h-4 text-white" />
                  </div>
                </div>
              </motion.div>
              <div className="flex flex-col">
                <h1 className="text-lg sm:text-xl font-bold font-display tracking-tight leading-tight">
                  <span className="text-foreground">Ship</span>
                  <span className="text-primary ml-0.5">Ahead</span>
                </h1>
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-semibold tracking-wider uppercase -mt-0.5">Container Tracking</span>
              </div>
            </Link>
            
            {/* Desktop Navigation - Neumorphic Sunken Track & Raised Active Tab */}
            <nav className="hidden md:flex items-center">
              <div className="flex items-center gap-1.5 p-1.5 bg-card/80 shadow-neu-inset rounded-2xl border border-border/50">
                {navItems.map((item) => {
                  const isActive = isItemActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link key={item.path} to={item.path}>
                      <motion.div
                        className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                          isActive 
                            ? 'text-primary bg-card shadow-neu-sm border border-white/80 dark:border-white/10' 
                            : 'text-muted-foreground hover:text-foreground hover:bg-card/40'
                        }`}
                        whileHover={{ scale: isActive ? 1 : 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span>{item.label}</span>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Right side - Status & Auth */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Live Status Badge */}
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card shadow-neu-xs border border-white/80 dark:border-white/5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-sm" />
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Live</span>
              </div>

              {/* Auth controls */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="gap-2 rounded-xl border border-white/80 dark:border-white/10 shadow-neu-sm bg-card hover:shadow-neu cursor-pointer h-9 px-2.5 sm:px-3"
                      >
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-primary/10 shadow-neu-inset-sm flex items-center justify-center">
                          <User className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-primary" />
                        </div>
                        <span className="hidden sm:inline max-w-[100px] truncate text-foreground font-semibold text-xs sm:text-sm">
                          {user.email?.split('@')[0]}
                        </span>
                      </Button>
                    </motion.div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-2xl p-2 bg-card shadow-neu-lg border border-white/80 dark:border-white/10">
                    <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer rounded-xl font-medium text-destructive hover:bg-destructive/10">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link to="/auth">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      size="sm"
                      className="rounded-xl shadow-neu-primary gap-1.5 font-semibold cursor-pointer h-9 px-3 text-xs sm:text-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Sign In</span>
                    </Button>
                  </motion.div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

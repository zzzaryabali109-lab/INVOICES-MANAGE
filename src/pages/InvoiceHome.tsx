import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import {
  Sparkles, ArrowRight, Package, FileText, FileSpreadsheet,
  ShieldCheck, Zap, Clock, BadgeCheck,
} from 'lucide-react';

type CardDef = {
  id: 'multi' | 'single' | 'excel';
  title: string;
  desc: string;
  btn: string;
  icon: typeof Package;
  onClick: () => void;
  gradient: string;
  iconTint: string;
  btnText: string;
  glow: string;
};

const InvoiceHome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  if (authLoading || !user) return <div className="min-h-screen bg-background" />;

  const cards: CardDef[] = [
    {
      id: 'multi',
      title: 'Multiple BL',
      desc: 'Upload up to 10 BL files at once and generate invoices in bulk with automatic matching',
      btn: 'Upload Multiple BL',
      icon: Package,
      onClick: () => navigate('/multi-bl-invoice'),
      gradient: 'from-primary/10 via-primary/5 to-transparent',
      iconTint: 'text-primary',
      btnText: 'text-primary',
      glow: 'shadow-neu hover:shadow-neu-lg',
    },
    {
      id: 'single',
      title: 'Single BL',
      desc: 'Upload a single BL file and generate invoice instantly with live OCR extraction',
      btn: 'Upload Single BL',
      icon: FileText,
      onClick: () => navigate('/invoice-generator'),
      gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
      iconTint: 'text-emerald-600 dark:text-emerald-400',
      btnText: 'text-emerald-600 dark:text-emerald-400',
      glow: 'shadow-neu hover:shadow-neu-lg',
    },
    {
      id: 'excel',
      title: 'Excel Upload',
      desc: 'Upload or update your Excel file for rate cards, data mapping, and container matching',
      btn: 'Upload Excel File',
      icon: FileSpreadsheet,
      onClick: () => navigate('/invoice-generator?upload=excel'),
      gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
      iconTint: 'text-amber-600 dark:text-amber-400',
      btnText: 'text-amber-600 dark:text-amber-400',
      glow: 'shadow-neu hover:shadow-neu-lg',
    },
  ];

  const features = [
    { icon: ShieldCheck, title: 'Secure & Private', sub: 'Your data is safe with us', color: 'text-primary' },
    { icon: Zap, title: 'AI Powered', sub: 'Smart data extraction', color: 'text-emerald-600' },
    { icon: Clock, title: 'Fast Processing', sub: 'Quick invoice generation', color: 'text-sky-600' },
    { icon: BadgeCheck, title: 'Accurate Results', sub: '99.9% accuracy rate', color: 'text-amber-600' },
  ];

  const renderCard = (card: CardDef, idx: number) => {
    const Icon = card.icon;
    return (
      <motion.button
        key={card.id}
        type="button"
        onClick={card.onClick}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 + idx * 0.1 }}
        whileHover={{ y: -4, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`group relative text-left overflow-hidden rounded-3xl p-6 sm:p-8 bg-card border border-white/80 dark:border-white/10 ${card.glow} transition-all duration-300 w-full`}
      >
        <div className="relative flex items-start gap-4 sm:gap-5">
          <motion.div
            whileHover={{ rotate: 6, scale: 1.05 }}
            className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-card shadow-neu border border-white/90 dark:border-white/10 flex items-center justify-center"
          >
            <div className="w-12 h-12 rounded-xl bg-card shadow-neu-inset-sm flex items-center justify-center">
              <Icon className={`w-7 h-7 sm:w-8 sm:h-8 ${card.iconTint}`} />
            </div>
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {card.title}
            </h3>
            <p className="mt-1.5 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md">
              {card.desc}
            </p>
            <div className={`mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-white/80 dark:border-white/10 font-semibold text-sm sm:text-base ${card.btnText} shadow-neu-sm group-hover:shadow-neu transition-all`}>
              {card.btn}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </div>
      </motion.button>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      <Header />

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 sm:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card shadow-neu-xs border border-white/80 dark:border-white/10 mb-4">
            <Sparkles className="w-4 h-4 text-primary animate-pulse-soft" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Automated Billing</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            BL Invoice System
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mt-2">
            Choose an option below to get started with invoice generation
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderCard(cards[0], 0)}
          {renderCard(cards[1], 1)}
          <div className="md:col-span-2 md:flex md:justify-center">
            <div className="w-full md:w-2/3">
              {renderCard(cards[2], 2)}
            </div>
          </div>
        </div>

        {/* Bottom feature bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-8 sm:mt-12 rounded-3xl bg-card border border-white/80 dark:border-white/10 shadow-neu p-5 sm:p-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-2">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center shrink-0">
                    <Icon className={`w-5 h-5 ${f.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{f.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default InvoiceHome;

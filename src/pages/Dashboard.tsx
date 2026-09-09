import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, AreaChart, Area,
} from 'recharts';
import {
  FileText, ShieldCheck, PackageCheck, MapPin, Search, Loader2,
  TrendingUp, AlertTriangle, Clock, Activity, Ship,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchUserContainers } from '@/services/containerDbService';
import { ContainerData } from '@/types/container';

interface NocRecord {
  id: string;
  container_number: string;
  bl_number: string | null;
  invoice_number: string | null;
  generated_date: string;
  status: string;
  approval_date: string | null;
  expiry_date: string | null;
  arrived_date: string | null;
}

type RangeKey = 'today' | 'yesterday' | 'weekly' | 'monthly';

const DAY_MS = 24 * 60 * 60 * 1000;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

function computeNocDisplay(r: NocRecord, now: number) {
  if (r.status === 'Container Arrived' || r.arrived_date) return 'Container Arrived';
  if (!r.approval_date || !r.expiry_date) return 'Pending Approval';
  const expiry = new Date(r.expiry_date).getTime();
  const daysLeft = Math.ceil((expiry - now) / DAY_MS);
  if (daysLeft <= 0) return 'Expired';
  if (daysLeft <= 3) return 'Expiring Soon';
  return 'NOC Approved';
}

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtTime = (d: Date) =>
  d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const PORT_COLORS = ['#8b5cf6', '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function classifyPort(loc?: string, dest?: string) {
  const t = `${loc || ''} ${dest || ''}`.toLowerCase();
  if (t.includes('qasim')) return 'Port Qasim';
  if (t.includes('kict')) return 'KICT';
  if (t.includes('sapt')) return 'SAPT';
  if (t.includes('karachi')) return 'Karachi Port';
  if (!t.trim()) return 'Unknown';
  return 'Other';
}

const KpiCard = ({
  icon: Icon, label, value, sublabel, trend, tint, delay = 0,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  sublabel: string;
  trend?: number;
  tint: string; // tailwind color group e.g. 'violet'
  delay?: number;
}) => {
  const animated = useCountUp(value);
  const tintMap: Record<string, { bg: string; text: string }> = {
    violet:  { bg: 'text-violet-600 dark:text-violet-400',  text: 'text-violet-600 dark:text-violet-400' },
    emerald: { bg: 'text-emerald-600 dark:text-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
    amber:   { bg: 'text-amber-600 dark:text-amber-400',   text: 'text-amber-600 dark:text-amber-400' },
    sky:     { bg: 'text-sky-600 dark:text-sky-400',     text: 'text-sky-600 dark:text-sky-400' },
    rose:    { bg: 'text-rose-600 dark:text-rose-400',    text: 'text-rose-600 dark:text-rose-400' },
    fuchsia: { bg: 'text-fuchsia-600 dark:text-fuchsia-400', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
  };
  const t = tintMap[tint] || tintMap.violet;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-3xl bg-card border border-white/80 dark:border-white/10 p-5 shadow-neu transition-all hover:shadow-neu-hover"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 shrink-0 rounded-2xl bg-card shadow-neu-inset-sm border border-border/40 ${t.text} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground truncate">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums">
            {fmtNum(animated)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs border-t border-border/40 pt-3">
        <span className="text-muted-foreground">{sublabel}</span>
        {typeof trend === 'number' && (
          <span className={`inline-flex items-center gap-1 font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            <TrendingUp className={`w-3.5 h-3.5 ${trend < 0 ? 'rotate-180' : ''}`} />
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
      </div>
    </motion.div>
  );
};


const Panel = ({
  title, right, children, className = '',
}: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <Card className={`rounded-3xl border border-white/80 dark:border-white/10 bg-card shadow-neu ${className}`}>
    <div className="flex items-center justify-between px-6 pt-6">
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {right}
    </div>
    <div className="p-6">{children}</div>
  </Card>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [nocs, setNocs] = useState<NocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const [overviewRange, setOverviewRange] = useState<RangeKey>('monthly');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  // Tick for relative times
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Load data
  const loadAll = async () => {
    if (!user) return;
    try {
      const [c, n] = await Promise.all([
        fetchUserContainers(),
        supabase.from('noc_records').select('*').order('generated_date', { ascending: false }),
      ]);
      setContainers(c);
      if (!n.error && n.data) setNocs(n.data as NocRecord[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracked_containers', filter: `user_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'noc_records', filter: `user_id=eq.${user.id}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Derived metrics
  const today = new Date();
  const yesterday = new Date(Date.now() - DAY_MS);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

  const invoicesAll = useMemo(
    () => nocs.filter((n) => !!n.invoice_number),
    [nocs]
  );
  const arrivedAll = useMemo(
    () => containers.filter((c) => c.status === 'Arrived'),
    [containers]
  );
  const approvedAll = useMemo(
    () => nocs.filter((n) => !!n.approval_date),
    [nocs]
  );
  const pendingNoc = useMemo(
    () => nocs.filter((n) => computeNocDisplay(n, now) === 'Pending Approval').length,
    [nocs, now]
  );
  const expiringNoc = useMemo(
    () => nocs.filter((n) => computeNocDisplay(n, now) === 'Expiring Soon').length,
    [nocs, now]
  );

  const countInRange = <T,>(arr: T[], getDate: (x: T) => string | null | undefined, range: 'thisMonth' | 'lastMonth' | 'today' | 'yesterday') =>
    arr.filter((x) => {
      const ds = getDate(x); if (!ds) return false;
      const d = new Date(ds);
      if (range === 'thisMonth') return sameMonth(d, today);
      if (range === 'lastMonth') return d >= lastMonthStart && d <= lastMonthEnd;
      if (range === 'today') return sameDay(d, today);
      return sameDay(d, yesterday);
    }).length;

  const pct = (curr: number, prev: number) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);

  const invThisMonth = countInRange(invoicesAll, (n) => n.generated_date, 'thisMonth');
  const invLastMonth = countInRange(invoicesAll, (n) => n.generated_date, 'lastMonth');
  const nocThisMonth = countInRange(approvedAll, (n) => n.approval_date, 'thisMonth');
  const nocLastMonth = countInRange(approvedAll, (n) => n.approval_date, 'lastMonth');
  const arrivedThisMonth = arrivedAll.length; // status flag without date — use total
  const trackedThisMonth = containers.length;
  const trackedLastMonth = containers.filter((c) => {
    // tracked_containers has created_at via DB but not in ContainerData type — approximate using all
    return false;
  }).length;

  // Monthly Overview chart data
  const overviewData = useMemo(() => {
    const days = overviewRange === 'today' ? 1 : overviewRange === 'yesterday' ? 1 : overviewRange === 'weekly' ? 7 : 30;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    if (overviewRange === 'yesterday') { end.setDate(end.getDate() - 1); }
    const points: { date: string; Invoices: number; 'NOC Approved': number; Arrived: number; Tracked: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const ds = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const inv = invoicesAll.filter((n) => n.generated_date && sameDay(new Date(n.generated_date), d)).length;
      const apr = approvedAll.filter((n) => n.approval_date && sameDay(new Date(n.approval_date!), d)).length;
      const arr = nocs.filter((n) => n.arrived_date && sameDay(new Date(n.arrived_date!), d)).length;
      const trk = nocs.filter((n) => n.generated_date && sameDay(new Date(n.generated_date), d)).length;
      points.push({ date: ds, Invoices: inv, 'NOC Approved': apr, Arrived: arr, Tracked: trk });
    }
    return points;
  }, [overviewRange, invoicesAll, approvedAll, nocs]);

  // Ports
  const portsData = useMemo(() => {
    const counts: Record<string, number> = {};
    containers.forEach((c) => {
      const p = classifyPort(c.currentLocation, c.destinationPort);
      counts[p] = (counts[p] || 0) + 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      total,
      slices: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], i) => ({ name, value, fill: PORT_COLORS[i % PORT_COLORS.length] })),
    };
  }, [containers]);

  // Shipping lines
  const linesData = useMemo(() => {
    const counts: Record<string, number> = {};
    containers.forEach((c) => {
      const k = (c.shippingLine || 'Unknown').trim() || 'Unknown';
      counts[k] = (counts[k] || 0) + 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, pct: (count / total) * 100 }));
  }, [containers]);

  // Daily report compare today/yesterday
  const todayInv = countInRange(invoicesAll, (n) => n.generated_date, 'today');
  const yInv = countInRange(invoicesAll, (n) => n.generated_date, 'yesterday');
  const todayNoc = countInRange(approvedAll, (n) => n.approval_date, 'today');
  const yNoc = countInRange(approvedAll, (n) => n.approval_date, 'yesterday');
  const todayArr = countInRange(nocs, (n) => n.arrived_date, 'today');
  const yArr = countInRange(nocs, (n) => n.arrived_date, 'yesterday');
  const todayTrk = countInRange(nocs, (n) => n.generated_date, 'today');
  const yTrk = countInRange(nocs, (n) => n.generated_date, 'yesterday');

  const hourlyToday = useMemo(() => {
    const arr = new Array(24).fill(0).map((_, h) => ({ hour: `${h.toString().padStart(2, '0')}:00`, today: 0, yesterday: 0 }));
    invoicesAll.forEach((n) => {
      if (!n.generated_date) return;
      const d = new Date(n.generated_date);
      if (sameDay(d, today)) arr[d.getHours()].today++;
      else if (sameDay(d, yesterday)) arr[d.getHours()].yesterday++;
    });
    return arr;
  }, [invoicesAll]);

  // Recent activity
  const activities = useMemo(() => {
    const items: { id: string; text: string; ts: number; type: string }[] = [];
    nocs.forEach((n) => {
      if (n.invoice_number && n.generated_date) {
        items.push({ id: `inv-${n.id}`, text: `Invoice ${n.invoice_number} generated`, ts: new Date(n.generated_date).getTime(), type: 'invoice' });
      }
      if (n.approval_date) items.push({ id: `apr-${n.id}`, text: `NOC approved for ${n.container_number}`, ts: new Date(n.approval_date).getTime(), type: 'noc' });
      if (n.arrived_date) items.push({ id: `arr-${n.id}`, text: `Container ${n.container_number} arrived`, ts: new Date(n.arrived_date).getTime(), type: 'arrived' });
    });
    return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [nocs]);

  // Top active containers table
  const tableRows = useMemo(() => {
    const nocByContainer = new Map<string, NocRecord>();
    nocs.forEach((n) => { if (!nocByContainer.has(n.container_number)) nocByContainer.set(n.container_number, n); });
    let rows = containers.map((c) => {
      const n = nocByContainer.get(c.containerNumber);
      const nocStatus = n ? computeNocDisplay(n, now) : '—';
      return {
        container: c.containerNumber,
        line: c.shippingLine || '—',
        bl: n?.bl_number || '—',
        port: classifyPort(c.currentLocation, c.destinationPort),
        status: c.status,
        nocStatus,
        invoice: n?.invoice_number || '—',
        lastUpdate: c.lastUpdate || '',
      };
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.container.toLowerCase().includes(q) ||
        r.line.toLowerCase().includes(q) ||
        r.bl.toLowerCase().includes(q) ||
        r.port.toLowerCase().includes(q) ||
        r.invoice.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') rows = rows.filter((r) => r.status === statusFilter);
    return rows.slice(0, 10);
  }, [containers, nocs, search, statusFilter, now]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </main>
      </div>
    );
  }

  const statusBadgeCls = (s: string) => {
    switch (s) {
      case 'Arrived': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'In Transit': return 'bg-sky-100 text-sky-700 border-sky-200';
      case 'Discharged': return 'bg-violet-100 text-violet-700 border-violet-200';
      case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };
  const nocBadgeCls = (s: string) => {
    switch (s) {
      case 'NOC Approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Pending Approval': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Expiring Soon': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Expired': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'Container Arrived': return 'bg-sky-100 text-sky-700 border-sky-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Title */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              Dashboard <span className="animate-pulse-soft">👋</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Welcome back! Here's what's happening today.</p>
          </motion.div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card shadow-neu-sm border border-white/80 dark:border-white/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-600">Live</span>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={FileText} label="Invoices Generated" value={invThisMonth} sublabel="This Month" trend={pct(invThisMonth, invLastMonth)} tint="violet" delay={0.0} />
          <KpiCard icon={ShieldCheck} label="NOCs Approved" value={nocThisMonth} sublabel="This Month" trend={pct(nocThisMonth, nocLastMonth)} tint="emerald" delay={0.05} />
          <KpiCard icon={PackageCheck} label="Containers Arrived" value={arrivedThisMonth} sublabel="This Month" trend={pct(todayArr, yArr)} tint="amber" delay={0.1} />
          <KpiCard icon={MapPin} label="Containers Tracked" value={trackedThisMonth} sublabel="This Month" trend={pct(todayTrk, yTrk)} tint="sky" delay={0.15} />
        </div>




        {/* Monthly Overview / Ports / Lines */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Panel
            title="Monthly Overview"
            className="lg:col-span-6"
            right={
              <Select value={overviewRange} onValueChange={(v) => setOverviewRange(v as RangeKey)}>
                <SelectTrigger className="w-32 h-8 rounded-xl shadow-neu-inset-sm border border-border/40 text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">This Month</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
              {[
                { k: 'Invoices', c: '#a855f7' },
                { k: 'NOC Approved', c: '#10b981' },
                { k: 'Arrived', c: '#f59e0b' },
                { k: 'Tracked', c: '#3b82f6' },
              ].map((l) => (
                <span key={l.k} className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.c }} /> {l.k}
                </span>
              ))}
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overviewData} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="Invoices" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="NOC Approved" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Arrived" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Tracked" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Containers by Port" className="lg:col-span-3">
            {portsData.total === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">No data</div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative w-full h-[220px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={portsData.slices} innerRadius={62} outerRadius={88} paddingAngle={2} dataKey="value" nameKey="name">
                        {portsData.slices.map((s, i) => (<Cell key={i} fill={s.fill} />))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Total</p>
                      <p className="text-2xl font-bold text-slate-800 tabular-nums">{fmtNum(portsData.total)}</p>
                    </div>
                  </div>
                </div>
                <div className="w-full mt-3 space-y-1.5">
                  {portsData.slices.slice(0, 4).map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-2 text-slate-600">
                        <span className="w-2 h-2 rounded-full" style={{ background: s.fill }} />{s.name}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {fmtNum(s.value)} <span className="text-slate-400">· {((s.value / portsData.total) * 100).toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Shipping Lines Overview" className="lg:col-span-3">
            <div className="max-h-[280px] overflow-y-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    <th className="text-left font-normal py-2 px-1">Shipping Line</th>
                    <th className="text-right font-normal py-2 px-1">Containers</th>
                    <th className="text-right font-normal py-2 px-1">%</th>
                  </tr>
                </thead>
                <tbody>
                  {linesData.length === 0 && (
                    <tr><td colSpan={3} className="text-center text-slate-400 py-8">No data</td></tr>
                  )}
                  {linesData.slice(0, 8).map((l) => (
                    <tr key={l.name} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-1 text-slate-700 font-medium truncate max-w-[140px]">{l.name}</td>
                      <td className="py-2.5 px-1 text-right text-slate-700 tabular-nums">{fmtNum(l.count)}</td>
                      <td className="py-2.5 px-1 text-right text-slate-400 tabular-nums">{l.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* Daily Report + Top Active Containers */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Panel title="Daily Report" className="lg:col-span-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Invoices Generated', icon: FileText, tint: 'violet', today: todayInv, yest: yInv },
                { label: 'NOC Approved', icon: ShieldCheck, tint: 'emerald', today: todayNoc, yest: yNoc },
                { label: 'Containers Arrived', icon: PackageCheck, tint: 'amber', today: todayArr, yest: yArr },
                { label: 'Containers Tracked', icon: MapPin, tint: 'sky', today: todayTrk, yest: yTrk },
              ].map((d) => {
                const tintMap: Record<string, string> = { violet: 'text-violet-600 dark:text-violet-400', emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', sky: 'text-sky-600 dark:text-sky-400' };
                const delta = pct(d.today, d.yest);
                return (
                  <div key={d.label} className="rounded-2xl border border-white/80 dark:border-white/10 p-3 bg-card shadow-neu-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-xl bg-card shadow-neu-inset-sm border border-border/40 flex items-center justify-center ${tintMap[d.tint]}`}>
                        <d.icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs text-muted-foreground leading-tight">{d.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{fmtNum(d.today)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Yesterday: {d.yest}{' '}
                      <span className={`ml-1 font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mb-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Today</span>
              <span className="inline-flex items-center gap-1.5 text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Yesterday</span>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer>
                <BarChart data={hourlyToday} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="yesterday" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="today" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Top Active Containers"
            className="lg:col-span-6"
            right={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-7 w-36 text-xs rounded-xl shadow-neu-inset-sm" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-28 h-8 rounded-xl text-xs shadow-neu-inset-sm border border-border/40 bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="In Transit">In Transit</SelectItem>
                    <SelectItem value="Arrived">Arrived</SelectItem>
                    <SelectItem value="Discharged">Discharged</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
          >
            <div className="overflow-x-auto -mx-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="text-xs text-slate-400 font-normal">Container No.</TableHead>
                    <TableHead className="text-xs text-slate-400 font-normal">Shipping Line</TableHead>
                    <TableHead className="text-xs text-slate-400 font-normal">Port</TableHead>
                    <TableHead className="text-xs text-slate-400 font-normal">Status</TableHead>
                    <TableHead className="text-xs text-slate-400 font-normal">Last Update</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-10 text-sm text-slate-400">No containers</TableCell></TableRow>
                  )}
                  {tableRows.map((r) => (
                    <TableRow key={r.container} className="border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="font-medium text-slate-700 text-sm">{r.container}</TableCell>
                      <TableCell className="text-sm text-slate-600 truncate max-w-[140px]">{r.line}</TableCell>
                      <TableCell className="text-sm text-slate-600">{r.port}</TableCell>
                      <TableCell><Badge variant="outline" className={statusBadgeCls(r.status)}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">{r.lastUpdate || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>



        <p className="text-center text-xs text-slate-400 pt-2">All times are shown in PKT (Pakistan Standard Time)</p>
      </main>
    </div>
  );
};

export default Dashboard;

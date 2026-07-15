import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  DollarSign,
  Filter,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import { http } from '../../core/api/http';
import { productApi } from '../../core/api/product.api';
import type { IStorageDurationKpis } from '../../types/product.type';
import './dashboard.css';

const fmt = (value: number) => Number(value || 0).toLocaleString('vi-VN');
const fmtCompact = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value || 0}`;
};

const CHART_RANGE_OPTIONS = ['Tuần này', 'Tuần trước', '7 ngày', '14 ngày', '30 ngày', 'Tháng này', 'Tháng trước'];
const CHART_TYPE_OPTIONS = [
  { value: 'bar_compare', label: 'Cột so sánh' },
  { value: 'bar', label: 'Cột doanh thu' },
  { value: 'line', label: 'Đường doanh thu' },
  { value: 'area', label: 'Miền doanh thu' },
];
const TOP_RANGE_OPTIONS = ['7 ngày', '14 ngày', '30 ngày'];
const TOP_LIMIT_OPTIONS = [10, 20, 50];
const RECENT_RANGE_OPTIONS = ['Hôm nay', '3 ngày', '7 ngày'];
const DASHBOARD_FILTER_STORAGE = {
  chartRange: 'dashboard.chartRange',
  chartType: 'dashboard.chartType',
};

type DropdownOption = { value: string; label: string };
type DashboardData = {
  totals: Record<string, number>;
  inventory: { totalQty: number; totalCostValue: number; totalSaleValue: number };
  topProducts: any[];
  chartData: { date: string; fullDate: string; revenue: number; prevRevenue: number }[];
  recentSales: any[];
  availableStores?: string[];
};

function formatSaleTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDisplayDate(d: string): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getWeekDateRange(isCurrentWeek: boolean): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay(); // 0=Chủ nhật, 1=Thứ hai, ..., 6=Thứ bảy
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday);
  if (!isCurrentWeek) {
    monday.setDate(monday.getDate() - 7);
  }
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };
  return { start: fmt(monday), end: fmt(sunday) };
}

function readStoredOption(key: string, fallback: string, options: readonly string[]) {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  return stored && options.includes(stored) ? stored : fallback;
}

function useStoredOption(key: string, fallback: string, options: readonly string[]) {
  const [value, setValue] = useState(() => readStoredOption(key, fallback, options));
  useEffect(() => {
    window.localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

function isWithinRecentRange(value: string, range: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === '3 ngày') start.setDate(start.getDate() - 2);
  if (range === '7 ngày') start.setDate(start.getDate() - 6);
  return date >= start;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dv-tooltip">
      <div className="dv-tooltip-title">{label}</div>
      {payload.map((item: any) => (
        <div className="dv-tooltip-row" key={item.dataKey}>
          <span className="dv-tooltip-dot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <strong>{fmt(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [storePanelPos, setStorePanelPos] = useState<{ top: number; left: number; width: number; dropUp: boolean } | null>(null);
  const [chartRange, setChartRange] = useStoredOption(DASHBOARD_FILTER_STORAGE.chartRange, '7 ngày', CHART_RANGE_OPTIONS);
  const [chartType, setChartType] = useStoredOption(DASHBOARD_FILTER_STORAGE.chartType, 'bar_compare', CHART_TYPE_OPTIONS.map((option) => option.value));
  const [chartStartDate, setChartStartDate] = useState('');
  const [chartEndDate, setChartEndDate] = useState('');
  const [topRange, setTopRange] = useState('7 ngày');
  const [topLimit, setTopLimit] = useState(10);
  const [recentRange, setRecentRange] = useState('Hôm nay');
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dailyProducts, setDailyProducts] = useState<any[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState('');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [storageSummary, setStorageSummary] = useState<IStorageDurationKpis | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState('');

  type CurrentUser = { name?: string; fullName?: string };

  const storeMenuRef = useRef<HTMLDivElement | null>(null);
  const storesCountRef = useRef(0);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (storeMenuRef.current && storeMenuRef.current.contains(target)) return;
      const panel = (target as HTMLElement)?.closest?.('.dv-store-panel');
      if (panel) return;
      setStoreMenuOpen(false);
    };
    const onScroll = () => {
      if (!storeMenuOpen || !storeMenuRef.current) return;
      const rect = storeMenuRef.current.getBoundingClientRect();
      const panelHeight = Math.min((storesCountRef.current || 1) * 40 + 64, 284);
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12;
      const width = Math.max(rect.width, 244);
      const rawTop = dropUp ? rect.top - panelHeight - 8 : rect.bottom + 8;
      const top = Math.max(8, Math.min(rawTop, window.innerHeight - panelHeight - 8));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setStorePanelPos({ top, left, width, dropUp });
    };
    const onResize = () => setStoreMenuOpen(false);
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setStoreMenuOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [storeMenuOpen]);

  useEffect(() => {
    let active = true;
    http.get('/auth/me')
      .then((response) => { if (active) setUser(response.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (selectedStores.length) params.set('stores', selectedStores.join(','));
      const hasStartDate = Boolean(chartStartDate);
      const hasEndDate = Boolean(chartEndDate);
      const isDateFilterActive = hasStartDate || hasEndDate;
      const bothDatesPresent = hasStartDate && hasEndDate;
      const dateRangeInvalid = bothDatesPresent && chartStartDate > chartEndDate;
      const isWeekPreset = chartRange === 'Tuần này' || chartRange === 'Tuần trước';
      if (isDateFilterActive && !dateRangeInvalid) {
        if (hasStartDate) params.set('startDate', chartStartDate);
        if (hasEndDate) params.set('endDate', chartEndDate);
      } else if (isWeekPreset) {
        const { start, end } = getWeekDateRange(chartRange === 'Tuần này');
        params.set('startDate', start);
        params.set('endDate', end);
      } else {
        params.set('chartRange', chartRange);
      }
      params.set('topRange', topRange);
      params.set('topLimit', String(topLimit));

      setLoading(true);
      setError('');
      http.get(`/dashboard?${params.toString()}`, { signal: controller.signal })
        .then((response) => {
          if (!active) return;
          setData(response.data);
        })
        .catch((err: any) => {
          if (!active || err.code === 'ERR_CANCELED') return;
          setError(err.response?.data?.message ?? 'Không thể tải dữ liệu tổng quan.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedStores, chartRange, chartStartDate, chartEndDate, topRange, topLimit, refreshKey]);

  useEffect(() => {
    let active = true;
    setStorageLoading(true);
    setStorageError('');
    productApi.getStorageDuration({ page: 1, limit: 5 })
      .then((response) => {
        if (!active) return;
        setStorageSummary(response.kpis || null);
      })
      .catch(() => {
        if (!active) return;
        setStorageSummary(null);
        setStorageError('Không tải được cảnh báo tồn kho.');
      })
      .finally(() => {
        if (active) setStorageLoading(false);
      });
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshKey((value) => value + 1);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const initialLoading = loading && !data;
  const userName = user?.name || user?.fullName || '';
  const todayLabel = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const stores = data?.availableStores ?? [];
  storesCountRef.current = stores.length;
  useLayoutEffect(() => {
    if (!storeMenuOpen || !storeMenuRef.current) return;
    const rect = storeMenuRef.current.getBoundingClientRect();
    const panelHeight = Math.min((stores.length || 1) * 40 + 64, 284);
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12;
    setStorePanelPos({ top: dropUp ? rect.top - panelHeight - 8 : rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 244), dropUp });
  }, [storeMenuOpen, stores.length]);
  const chartData = data?.chartData ?? [];
  const topProducts = data?.topProducts ?? [];
  const recentSales = data?.recentSales ?? [];
  const inventory = data?.inventory ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
  const selectedStoreLabel = selectedStores.length === 0 ? 'Tất cả cửa hàng' : selectedStores.length === 1 ? selectedStores[0] : `${selectedStores.length} cửa hàng`;
  const chartMode = CHART_TYPE_OPTIONS.find((option) => option.value === chartType)?.label ?? chartType;
  const hasStartDate = Boolean(chartStartDate);
  const hasEndDate = Boolean(chartEndDate);
  const isDateFilterActive = hasStartDate || hasEndDate;
  const bothDatesPresent = hasStartDate && hasEndDate;
  const dateRangeInvalid = bothDatesPresent && chartStartDate > chartEndDate;
  let rangeLabel: string;
  if (hasStartDate || hasEndDate) {
    if (bothDatesPresent && dateRangeInvalid) {
      rangeLabel = `Từ ${formatDisplayDate(chartStartDate)} đến ${formatDisplayDate(chartEndDate)} (không hợp lệ)`;
    } else if (bothDatesPresent) {
      rangeLabel = `Từ ${formatDisplayDate(chartStartDate)} đến ${formatDisplayDate(chartEndDate)}`;
    } else if (hasStartDate) {
      rangeLabel = `Từ ${formatDisplayDate(chartStartDate)}`;
    } else {
      rangeLabel = `Đến ${formatDisplayDate(chartEndDate)}`;
    }
  } else if (chartRange === 'Tuần này' || chartRange === 'Tuần trước') {
    rangeLabel = chartRange;
  } else {
    rangeLabel = `${chartRange} gần nhất`;
  }
  const chartHasData = chartData.some((row) => row.revenue > 0 || row.prevRevenue > 0);
  const chartTotals = chartData.reduce((acc, row) => ({ current: acc.current + (row.revenue ?? 0), previous: acc.previous + (row.prevRevenue ?? 0) }), { current: 0, previous: 0 });
  const chartPeak = chartData.reduce<{ date: string; revenue: number } | null>((best, row) => (!best || row.revenue > best.revenue ? { date: row.fullDate, revenue: row.revenue ?? 0 } : best), null);
  const filteredRecentSales = recentSales.filter((sale) => isWithinRecentRange(sale.createdAt, recentRange));

  const closeDailyModal = () => {
    setShowDailyModal(false);
    setDailyLoading(false);
    setDailyError('');
    setDailyProducts([]);
  };

  useEffect(() => {
    if (!showDailyModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDailyModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showDailyModal]);

  const openDailyProducts = async (payload: any) => {
    const fullDate = payload?.activePayload?.[0]?.payload?.fullDate;
    if (!fullDate) return;
    setSelectedDate(fullDate);
    setShowDailyModal(true);
    setDailyLoading(true);
    setDailyError('');
    setDailyProducts([]);
    try {
      const response = await http.get(`/dashboard/daily-products?date=${encodeURIComponent(fullDate)}&stores=${encodeURIComponent(selectedStores.join(','))}`);
      setDailyProducts(response.data.products ?? []);
    } catch (err: any) {
      setDailyProducts([]);
      setDailyError(err.response?.data?.message ?? 'Không thể tải chi tiết sản phẩm bán ra.');
    } finally {
      setDailyLoading(false);
    }
  };

  const toggleStore = (store: string) => {
    setSelectedStores((current) => current.includes(store) ? current.filter((item) => item !== store) : [...current, store]);
  };


  return (
    <main className="dv-page" data-testid="dashboard-page">
      {loading && <div className="dv-progress" aria-hidden="true" />}
      <section className="dv-hero">
        <div className="dv-hero-text">
          <span className="dv-eyebrow"><TrendingUp size={14} /> Tổng quan</span>
          <h1>Xin chào{userName ? `, ${userName}` : ''}</h1>
          <p>{todayLabel} · {selectedStoreLabel}</p>
        </div>
        <div className="dv-hero-actions">
          <div className="dv-store-picker" ref={storeMenuRef}>
            <button type="button" className={`dv-store-trigger${storeMenuOpen ? ' is-open' : ''}`} onClick={() => setStoreMenuOpen((value) => !value)} data-testid="store-filter-button" aria-expanded={storeMenuOpen} aria-haspopup="dialog">
              <Filter size={16} aria-hidden="true" />
              <span>{selectedStoreLabel}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {storeMenuOpen && storePanelPos && createPortal(
              <div className={`dv-store-panel ${storePanelPos.dropUp ? "open-up" : ""}`} data-testid="store-filter-panel" style={{ position: 'fixed', top: storePanelPos.top, left: storePanelPos.left, width: storePanelPos.width }} onClick={(e) => e.stopPropagation()}>
                <div className="dv-store-actions">
                  <button type="button" onClick={() => setSelectedStores([...stores])}>Chọn tất cả</button>
                  <button type="button" onClick={() => setSelectedStores([])}>Bỏ chọn</button>
                </div>
                <div className="dv-store-list">
                  {stores.map((store) => (
                    <label key={store} className="dv-store-option">
                      <input type="checkbox" checked={selectedStores.includes(store)} onChange={() => toggleStore(store)} />
                      <span>{store}</span>
                    </label>
                  ))}
                  {!stores.length && <div className="dv-empty-state compact">Chưa có cửa hàng khả dụng.</div>}
                </div>
              </div>,
              document.body,
            )}
          </div>
          <div className={`dv-sync-card${loading ? ' is-loading' : ''}`}>
            <span aria-hidden="true"><RefreshCw size={18} /></span>
            <div className="dv-sync-text"><small>Trạng thái dữ liệu</small><strong>{loading ? 'Đang đồng bộ...' : 'Đã cập nhật'}</strong></div>
            <button type="button" className="dv-sync-refresh" onClick={() => setRefreshKey((value) => value + 1)} aria-label="Làm mới dữ liệu dashboard"><RefreshCw size={16} /> Làm mới</button>
          </div>
        </div>
      </section>


      {error && <div className="dv-alert">{error}</div>}

      <section className="dv-layout">
          <section className="dv-surface dv-card-chart">
            <div className="dv-surface-head">
              <div>
                <h2>Doanh thu theo thời gian</h2>
                <p>{rangeLabel}, dạng {chartMode.toLowerCase()}.</p>
              </div>
              <div className="dv-control-row">
                <div className="dv-date-range">
                  <label className={`dv-date-field ${dateRangeInvalid ? 'invalid' : ''}`}>
                    <span>TỪ</span>
                    <input
                      type="date"
                      value={chartStartDate}
                      onChange={(e) => setChartStartDate(e.target.value)}
                      aria-label="Từ ngày"
                    />
                  </label>
                  <label className={`dv-date-field ${dateRangeInvalid ? 'invalid' : ''}`}>
                    <span>ĐẾN</span>
                    <input
                      type="date"
                      value={chartEndDate}
                      onChange={(e) => setChartEndDate(e.target.value)}
                      aria-label="Đến ngày"
                    />
                  </label>
                </div>
                <Dropdown value={chartRange} options={CHART_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setChartRange} testId="chart-range-filter" disabled={isDateFilterActive} />
                <Dropdown value={chartType} options={CHART_TYPE_OPTIONS} onChange={setChartType} testId="chart-type-filter" wide />
              </div>
            </div>
            <div className="dv-chart-shell" data-chart-type={chartType} data-testid="chart-shell">
              <div className="dv-chart-meta">
                <div><span>Kỳ này</span><strong>{fmt(chartTotals.current)}</strong></div>
                <div><span>Kỳ trước</span><strong>{fmt(chartTotals.previous)}</strong></div>
                <div><span>Đỉnh doanh thu</span><strong>{chartPeak && chartPeak.revenue > 0 ? `${fmt(chartPeak.revenue)} · ${chartPeak.date}` : 'Chưa có dữ liệu'}</strong></div>
              </div>
              <div className={`dv-chart ${loading ? 'is-loading' : ''}`}>
                {initialLoading ? <div className="dv-chart-skeleton" /> : !chartHasData && (
                  <div className="dv-chart-empty" data-testid="chart-empty-state">
                    <span className="dv-empty-icon" aria-hidden="true"><BarChart3 size={22} /></span>
                    <span>Khoảng này chưa có doanh thu để vẽ biểu đồ.</span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={320}>
                  {chartType === 'area' ? (
                    <AreaChart data={chartData} onClick={openDailyProducts}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" /><Area dataKey="prevRevenue" name="Kỳ trước" stroke="#a7f3d0" fill="transparent" strokeWidth={2} /><Area dataKey="revenue" name="Kỳ này" stroke="#059669" fill="#d1fae5" strokeWidth={2} /></AreaChart>
                  ) : chartType === 'line' ? (
                    <LineChart data={chartData} onClick={openDailyProducts}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" /><Line dataKey="revenue" name="Doanh thu" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} /></LineChart>
                  ) : (
                    <BarChart data={chartData} onClick={openDailyProducts}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" />{chartType === 'bar_compare' && <Bar dataKey="prevRevenue" name="Kỳ trước" fill="#a7f3d0" radius={[6, 6, 0, 0]} maxBarSize={28} />}<Bar dataKey="revenue" name="Kỳ này" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} /></BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="dv-surface dv-card-top">
            <div className="dv-surface-head">
              <div><h2>Sản phẩm bán chạy</h2><p>Top sản phẩm theo khoảng Top riêng (7/14/30 ngày), không theo ngày tùy chỉnh biểu đồ.</p></div>
              <div className="dv-control-row">
                <Dropdown value={topRange} options={TOP_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setTopRange} testId="top-range-filter" />
                <Dropdown value={String(topLimit)} options={TOP_LIMIT_OPTIONS.map((option) => ({ value: String(option), label: `Top ${option}` }))} onChange={(value) => setTopLimit(Number(value))} testId="top-limit-filter" />
              </div>
            </div>
            <div className="dv-table-wrap" role="region" aria-label="Bảng sản phẩm bán chạy">
              <table className="dv-table">
                <thead><tr><th scope="col">#</th><th scope="col">Tên sản phẩm</th><th scope="col">SL bán</th><th scope="col">SL trả</th><th scope="col">Doanh thu</th></tr></thead>
                <tbody>
                  {initialLoading && [0,1,2,3,4].map((i) => (<tr key={'psk'+i}><td colSpan={5}><span className="dv-skeleton-bar" /></td></tr>))}
                  {topProducts.map((product) => (
                    <tr key={`${product.rank}-${product.code}`}>
                      <td>{product.rank}</td>
                      <td className="dv-product-name" title={product.name}><span className="dv-product-title">{product.name}</span><span className="dv-product-code">{product.code}</span></td>
                      <td>{fmt(product.qtySold)}</td>
                      <td className={product.qtyReturned ? 'is-danger' : ''}>{product.qtyReturned ? fmt(product.qtyReturned) : ''}</td>
                      <td>{fmt(product.revenue)}</td>
                    </tr>
                  ))}
                  {!initialLoading && !topProducts.length && (
                    <tr>
                      <td colSpan={5}>
                        <div className="dv-empty-state compact">
                          <span className="dv-empty-icon" aria-hidden="true"><Package size={20} /></span>
                          <p>Chưa có dữ liệu sản phẩm bán chạy trong khoảng này.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dv-surface dv-card-inventory">
            <div className="dv-surface-head"><div><h2>Tồn kho</h2><p>Thay đổi theo cửa hàng đang chọn.</p></div><span className="dv-head-tag">{selectedStoreLabel}</span></div>
            <div className="dv-stack-metrics dv-inventory-row">
              <Metric icon={<Store size={18} />} label="Số lượng tồn" value={inventory.totalQty} tone="amber" testId="inventory-totalQty-value" />
              <Metric icon={<DollarSign size={18} />} label="Giá vốn tồn kho" value={inventory.totalCostValue} tone="emerald" />
              <Metric icon={<ArrowUpRight size={18} />} label="Giá bán quy đổi" value={inventory.totalSaleValue} tone="blue" />
            </div>
          </section>

          <section className="dv-surface dv-card-storage dv-storage-alert-card">
            <div className="dv-surface-head"><div><h2>Cảnh báo tồn kho</h2><p>Hàng chưa bán hoặc bán chậm trên {storageSummary?.thresholdDays || 30} ngày.</p></div><Link className="dv-head-tag" to="/products/storage-duration">Xem tất cả</Link></div>
            {storageLoading && !storageSummary ? (
              <div className="dv-empty-state compact">
                <span className="dv-empty-icon" aria-hidden="true"><Package size={20} /></span>
                <p>Đang tải cảnh báo tồn kho...</p>
              </div>
            ) : null}
            {storageError ? (
              <div className="dv-empty-state is-error compact">
                <span className="dv-empty-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
                <p>{storageError}</p>
              </div>
            ) : null}
            {!storageLoading && !storageError && storageSummary ? (
              <>
                <div className="dv-stack-metrics dv-inventory-row">
                  <Link className="dv-storage-metric" to="/products/storage-duration?tab=unsold_long"><small>Hàng chưa bán &gt; {storageSummary.thresholdDays || 30} ngày</small><strong>{fmt(storageSummary.unsoldLong)}</strong></Link>
                  <Link className="dv-storage-metric" to="/products/storage-duration?tab=slow_selling"><small>Hàng bán chậm &gt; {storageSummary.thresholdDays || 30} ngày</small><strong>{fmt(storageSummary.slowSelling)}</strong></Link>
                  <Link className="dv-storage-metric" to="/products/storage-duration"><small>Giá vốn hàng tồn lâu</small><strong>{fmt(storageSummary.totalValue)}</strong></Link>
                </div>
                <div className="dv-storage-toplist">
                  {[...(storageSummary.topUnsoldLong || []), ...(storageSummary.topSlowSelling || [])].slice(0, 5).map((item) => (
                    <Link key={item._id} to={`/products/storage-duration?q=${encodeURIComponent(item.code)}`}><span>{item.code} · {item.name}</span><strong>{item.daysFromLastSold === null ? `${item.daysFromStart} ngày chưa bán` : `${item.daysFromLastSold} ngày chưa bán lại`}</strong></Link>
                  ))}
                  {![...(storageSummary.topUnsoldLong || []), ...(storageSummary.topSlowSelling || [])].length ? (
                    <div className="dv-empty-state compact">
                      <span className="dv-empty-icon" aria-hidden="true"><Package size={20} /></span>
                      <p>Chưa có dữ liệu tồn lâu đáng chú ý.</p>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
          <section className="dv-surface dv-card-recent">
            <div className="dv-surface-head">
              <div><h2>Giao dịch gần nhất</h2><p>Danh sách này theo cửa hàng đang chọn.</p></div>
              <Dropdown value={recentRange} options={RECENT_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setRecentRange} testId="recent-range-filter" />
            </div>
            <div className="dv-recent-list" data-testid="recent-sales-list">
              {initialLoading && [0,1,2,3].map((i) => (<div key={'rsk'+i} className="dv-recent-skeleton"><span className="dv-skeleton-bar" /><span className="dv-skeleton-bar" style={{ width: '60%' }} /><span className="dv-skeleton-bar" style={{ width: '40%' }} /></div>))}
              {filteredRecentSales.map((sale) => (
                <div key={sale.id} className="dv-recent-item">
                  <span className="dv-recent-icon"><ShoppingBag size={18} /></span>
                  <span className="dv-recent-info"><strong>{sale.customerName}</strong><small>{sale.type} {sale.branchName ? `(${sale.branchName})` : ''}</small><small>{formatSaleTime(sale.createdAt)}</small></span>
                  <span className="dv-recent-value">{fmt(sale.value)}</span>
                </div>
              ))}
              {!initialLoading && !filteredRecentSales.length && (
                <div className="dv-empty-state">
                  <span className="dv-empty-icon" aria-hidden="true"><ShoppingBag size={22} /></span>
                  <p>Chưa có giao dịch nào để hiển thị.</p>
                </div>
              )}
            </div>
          </section>
      </section>

      {showDailyModal && (
        <div
          className="dv-modal-backdrop"
          role="presentation"
          data-testid="daily-products-backdrop"
          onClick={closeDailyModal}
        >
          <div
            className="dv-modal wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-products-title"
            data-testid="daily-products-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dv-modal-head">
              <h3 id="daily-products-title">Chi tiết sản phẩm bán ra ngày {selectedDate}</h3>
              <button type="button" onClick={closeDailyModal} aria-label="Đóng chi tiết ngày">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="dv-modal-body">
              {dailyLoading ? (
                <div className="dv-empty-state">Đang tải dữ liệu chi tiết...</div>
              ) : dailyError ? (
                <div className="dv-empty-state is-error" data-testid="daily-products-error">
                  <span className="dv-empty-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
                  <p>{dailyError}</p>
                  <button
                    type="button"
                    className="dv-sync-refresh"
                    onClick={() => openDailyProducts({ activePayload: [{ payload: { fullDate: selectedDate } }] })}
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <table className="dv-table">
                  <thead><tr><th>#</th><th>Tên sản phẩm</th><th>Số lượng</th><th>Giá bán TB</th><th>Doanh thu</th></tr></thead>
                  <tbody>
                    {dailyProducts.map((product, index) => (
                      <tr key={`${product.code}-${index}`}><td>{index + 1}</td><td className="dv-product-name">{product.name}<span>{product.code}</span></td><td>{fmt(product.qty)}</td><td>{fmt(product.price)}</td><td>{fmt(product.revenue)}</td></tr>
                    ))}
                    {!dailyProducts.length && <tr><td colSpan={5} className="dv-empty">Không có sản phẩm bán ra trong ngày này</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Dropdown({ value, options, onChange, testId, wide = false, disabled = false }: { value: string; options: DropdownOption[]; onChange: (value: string) => void; testId?: string; wide?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; dropUp: boolean } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const label = options.find((option) => option.value === value)?.label ?? value;
  useEffect(() => {
    if (disabled) {
      setOpen(false);
      return;
    }
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      const panel = (target as HTMLElement)?.closest?.('.dv-select-options');
      if (panel) return;
      setOpen(false);
    };
    const onScroll = () => {
      if (!open || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const panelHeight = Math.min(options.length * 42 + 16, 320);
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12;
      const width = wide ? Math.max(rect.width, 260) : rect.width;
      const rawTop = dropUp ? rect.top - panelHeight - 8 : rect.bottom + 8;
      const top = Math.max(8, Math.min(rawTop, window.innerHeight - panelHeight - 8));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPos({ top, left, width, dropUp });
    };
    const onResize = () => setOpen(false);
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('mousedown', close);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', onKeyDown);
      };
  }, [open, options.length, wide, disabled]);
  useLayoutEffect(() => {
    if (!open || !ref.current || disabled) return;
    const rect = ref.current.getBoundingClientRect();
    const panelHeight = Math.min(options.length * 42 + 16, 320);
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12;
    const width = wide ? Math.max(rect.width, 260) : rect.width;
    setPos({ top: dropUp ? rect.top - panelHeight - 8 : rect.bottom + 8, left: rect.left, width, dropUp });
  }, [open, options.length, wide, disabled]);
  return (
    <div className={`dv-select-menu ${wide ? 'wide' : ''}`} ref={ref} data-testid={testId}>
      <button type="button" className={`dv-select-button${open ? ' is-open' : ''}`} disabled={disabled} aria-expanded={open} aria-haspopup="listbox" onClick={disabled ? undefined : () => setOpen((value) => !value)}><span>{label}</span><ChevronDown size={16} aria-hidden="true" /></button>
      {open && pos && createPortal(
        <div className={`dv-select-options ${pos.dropUp ? 'open-up' : ''}`} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }} onClick={() => setOpen(false)}>
          {options.map((option) => <button type="button" key={option.value} className={option.value === value ? 'active' : ''} onClick={(e) => { e.stopPropagation(); onChange(option.value); setOpen(false); }}>{option.label}</button>)}
        </div>,
        document.body,
      )}
    </div>
  );
}

function Metric({ icon, label, value, tone, testId }: { icon: ReactNode; label: string; value: number; tone: 'violet' | 'blue' | 'emerald' | 'amber'; testId?: string }) {
  return <div className={`dv-info-metric ${tone}`}><span>{icon}</span><div><small>{label}</small><strong data-testid={testId}>{fmt(value)}</strong></div></div>;
}

import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  ArrowUpRight,
  ChevronDown,
  DollarSign,
  Filter,
  RotateCcw,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import { http } from '../../core/api/http';
import './dashboard.css';

const fmt = (value: number) => Number(value || 0).toLocaleString('vi-VN');
const fmtCompact = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value || 0}`;
};

const CHART_RANGE_OPTIONS = ['7 ngày', '14 ngày', '30 ngày', 'Tháng này', 'Tháng trước'];
const CHART_TYPE_OPTIONS = [
  { value: 'bar_compare', label: 'Cột so sánh' },
  { value: 'bar', label: 'Cột doanh thu' },
  { value: 'line', label: 'Đường doanh thu' },
  { value: 'area', label: 'Miền doanh thu' },
];
const ORDER_RANGE_OPTIONS = ['2 ngày', '7 ngày', '30 ngày'];
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
  salesChannels: any[];
  orderChannels: any[];
  inventory: { totalQty: number; totalCostValue: number; totalSaleValue: number };
  topProducts: any[];
  chartData: { date: string; fullDate: string; revenue: number; prevRevenue: number }[];
  wallets: { zaloOA: number; shopeeWallet: number; zaloWallet: number; adsWallet: number };
  walletItems?: { code: string; name: string; balance: number }[];
  recentSales: any[];
  availableStores?: string[];
};

function formatSaleTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
  const [orderRange, setOrderRange] = useState('2 ngày');
  const [topRange, setTopRange] = useState('7 ngày');
  const [topLimit, setTopLimit] = useState(10);
  const [recentRange, setRecentRange] = useState('Hôm nay');
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dailyProducts, setDailyProducts] = useState<any[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [now, setNow] = useState(() => new Date());

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
      params.set('chartRange', chartRange);
      params.set('orderRange', orderRange);
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
  }, [selectedStores, chartRange, orderRange, topRange, topLimit, refreshKey]);

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
  const orderChannels = data?.orderChannels ?? [];
  const chartData = data?.chartData ?? [];
  const topProducts = data?.topProducts ?? [];
  const recentSales = data?.recentSales ?? [];
  const inventory = data?.inventory ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
  const selectedStoreLabel = selectedStores.length === 0 ? 'Tất cả cửa hàng' : selectedStores.length === 1 ? selectedStores[0] : `${selectedStores.length} cửa hàng`;
  const chartMode = CHART_TYPE_OPTIONS.find((option) => option.value === chartType)?.label ?? chartType;
  const chartHasData = chartData.some((row) => row.revenue > 0 || row.prevRevenue > 0);
  const chartTotals = chartData.reduce((acc, row) => ({ current: acc.current + (row.revenue ?? 0), previous: acc.previous + (row.prevRevenue ?? 0) }), { current: 0, previous: 0 });
  const chartPeak = chartData.reduce<{ date: string; revenue: number } | null>((best, row) => (!best || row.revenue > best.revenue ? { date: row.fullDate, revenue: row.revenue ?? 0 } : best), null);
  const filteredRecentSales = recentSales.filter((sale) => isWithinRecentRange(sale.createdAt, recentRange));

  const openDailyProducts = async (payload: any) => {
    const fullDate = payload?.activePayload?.[0]?.payload?.fullDate;
    if (!fullDate) return;
    setSelectedDate(fullDate);
    setShowDailyModal(true);
    setDailyLoading(true);
    const response = await http.get(`/dashboard/daily-products?date=${encodeURIComponent(fullDate)}&stores=${encodeURIComponent(selectedStores.join(','))}`);
    setDailyProducts(response.data.products ?? []);
    setDailyLoading(false);
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
            <button type="button" className="dv-store-trigger" onClick={() => setStoreMenuOpen((value) => !value)} data-testid="store-filter-button">
              <Filter size={16} />
              <span>{selectedStoreLabel}</span>
              <ChevronDown size={16} />
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
          <div className="dv-sync-card">
            <span className={loading ? 'is-loading' : ''}><RefreshCw size={18} /></span>
            <div className="dv-sync-text"><small>Trạng thái dữ liệu</small><strong>{loading ? 'Đang đồng bộ...' : 'Đã cập nhật'}</strong></div>
            <button type="button" className="dv-sync-refresh" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={16} /> Làm mới</button>
          </div>
        </div>
      </section>


      {error && <div className="dv-alert">{error}</div>}

      <section className="dv-layout">
          <section className="dv-surface dv-card-chart">
            <div className="dv-surface-head">
              <div>
                <h2>Doanh thu theo thời gian</h2>
                <p>{chartRange} gần nhất, dạng {chartMode.toLowerCase()}.</p>
              </div>
              <div className="dv-control-row">
                <Dropdown value={chartRange} options={CHART_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setChartRange} testId="chart-range-filter" />
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
                {initialLoading ? <div className="dv-chart-skeleton" /> : !chartHasData && <div className="dv-chart-empty" data-testid="chart-empty-state">Khoảng này chưa có doanh thu để vẽ biểu đồ.</div>}
                <ResponsiveContainer width="100%" height={320}>
                  {chartType === 'area' ? (
                    <AreaChart data={chartData} onClick={openDailyProducts}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" /><Area dataKey="prevRevenue" name="Kỳ trước" stroke="#c4b5fd" fill="transparent" strokeWidth={2} /><Area dataKey="revenue" name="Kỳ này" stroke="#6d28d9" fill="#ede9fe" strokeWidth={2} /></AreaChart>
                  ) : chartType === 'line' ? (
                    <LineChart data={chartData} onClick={openDailyProducts}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" /><Line dataKey="revenue" name="Doanh thu" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} /></LineChart>
                  ) : (
                    <BarChart data={chartData} onClick={openDailyProducts}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis tickFormatter={fmtCompact} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" />{chartType === 'bar_compare' && <Bar dataKey="prevRevenue" name="Kỳ trước" fill="#c4b5fd" radius={[6, 6, 0, 0]} maxBarSize={28} />}<Bar dataKey="revenue" name="Kỳ này" fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={28} /></BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="dv-surface dv-card-orders">
            <div className="dv-surface-head">
              <div><h2>Đơn hàng</h2><p>Trạng thái đơn theo khoảng chọn.</p></div>
              <Dropdown value={orderRange} options={ORDER_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setOrderRange} testId="orders-range-filter" />
            </div>
            <div className="dv-table-wrap">
              <table className="dv-table">
                <thead><tr><th>Gian hàng</th><th>Mới / chờ xử lý</th><th>Đóng gói</th><th>Đang chuyển</th><th>Hoàn hủy</th><th>Trả hàng</th></tr></thead>
                <tbody>
                  {initialLoading && [0,1,2,3].map((i) => (<tr key={'osk'+i}><td colSpan={6}><span className="dv-skeleton-bar" /></td></tr>))}
                  {orderChannels.map((channel) => (
                    <tr key={channel.label}>
                      <td><span className={`dv-channel-icon ${channel.icon}`}>{channel.label?.[0] || 'A'}</span>{channel.label}</td>
                      <td>{fmt(channel.newOrders)}</td><td>{fmt(channel.packing)}</td><td>{fmt(channel.shipping)}</td><td>{fmt(channel.cancelled)}</td><td>{fmt(channel.returned)}</td>
                    </tr>
                  ))}
                  {!initialLoading && !orderChannels.length && <tr><td colSpan={6} className="dv-empty">Chưa có dữ liệu</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dv-surface dv-card-top">
            <div className="dv-surface-head">
              <div><h2>Sản phẩm bán chạy</h2><p>Top sản phẩm được tính theo khoảng đang xem.</p></div>
              <div className="dv-control-row">
                <Dropdown value={topRange} options={TOP_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setTopRange} testId="top-range-filter" />
                <Dropdown value={String(topLimit)} options={TOP_LIMIT_OPTIONS.map((option) => ({ value: String(option), label: `Top ${option}` }))} onChange={(value) => setTopLimit(Number(value))} testId="top-limit-filter" />
              </div>
            </div>
            <div className="dv-table-wrap">
              <table className="dv-table">
                <thead><tr><th>#</th><th>Tên sản phẩm</th><th>SL bán</th><th>SL trả</th><th>Doanh thu</th></tr></thead>
                <tbody>
                  {initialLoading && [0,1,2,3,4].map((i) => (<tr key={'psk'+i}><td colSpan={5}><span className="dv-skeleton-bar" /></td></tr>))}
                  {topProducts.map((product) => (
                    <tr key={`${product.rank}-${product.code}`}>
                      <td>{product.rank}</td>
                      <td className="dv-product-name">{product.name}<span>{product.code}</span></td>
                      <td>{fmt(product.qtySold)}</td>
                      <td className={product.qtyReturned ? 'is-danger' : ''}>{product.qtyReturned ? fmt(product.qtyReturned) : ''}</td>
                      <td>{fmt(product.revenue)}</td>
                    </tr>
                  ))}
                  {!initialLoading && !topProducts.length && <tr><td colSpan={5} className="dv-empty">Chưa có dữ liệu</td></tr>}
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
              {!initialLoading && !filteredRecentSales.length && <div className="dv-empty-state">Chưa có giao dịch hoàn tất nào để hiển thị.</div>}
            </div>
          </section>
      </section>

      {showDailyModal && (
        <div className="dv-modal-backdrop">
          <div className="dv-modal wide">
            <div className="dv-modal-head"><h3>Chi tiết sản phẩm bán ra ngày {selectedDate}</h3><button type="button" onClick={() => setShowDailyModal(false)}><X size={18} /></button></div>
            <div className="dv-modal-body">
              {dailyLoading ? <div className="dv-empty-state">Đang tải dữ liệu chi tiết...</div> : (
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

function Dropdown({ value, options, onChange, testId, wide = false }: { value: string; options: DropdownOption[]; onChange: (value: string) => void; testId?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; dropUp: boolean } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const label = options.find((option) => option.value === value)?.label ?? value;
  useEffect(() => {
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
  }, [open, options.length, wide]);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const panelHeight = Math.min(options.length * 42 + 16, 320);
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12;
    const width = wide ? Math.max(rect.width, 260) : rect.width;
    setPos({ top: dropUp ? rect.top - panelHeight - 8 : rect.bottom + 8, left: rect.left, width, dropUp });
  }, [open, options.length, wide]);
  return (
    <div className={`dv-select-menu ${wide ? 'wide' : ''}`} ref={ref} data-testid={testId}>
      <button type="button" className="dv-select-button" onClick={() => setOpen((value) => !value)}><span>{label}</span><ChevronDown size={16} /></button>
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

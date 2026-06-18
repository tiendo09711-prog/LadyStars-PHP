import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  BellDot,
  Check,
  ChevronDown,
  DollarSign,
  Filter,
  LoaderCircle,
  Package,
  RefreshCcw,
  RotateCcw,
  Save,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  WalletCards,
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

const DATE_OPTIONS = ['Hôm nay', 'Hôm qua', '7 ngày', 'Tuần này', 'Tuần trước', '14 ngày', 'Tháng này', 'Tháng trước', '30 ngày'];
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
const DEFAULT_COLUMNS = {
  channel: true,
  revenue: true,
  orders: true,
  avgOrder: true,
  avgProducts: false,
  ads: true,
  profit: true,
  profitPercent: true,
};
const COLUMN_DEFS = [
  { id: 'channel', label: 'Kênh bán' },
  { id: 'revenue', label: 'Doanh thu' },
  { id: 'orders', label: 'Số đơn' },
  { id: 'avgOrder', label: 'GTTB' },
  { id: 'avgProducts', label: 'SLSPTB' },
  { id: 'ads', label: 'Ads' },
  { id: 'profit', label: 'Lợi nhuận' },
  { id: 'profitPercent', label: '% LN / doanh thu' },
] as const;

type ColumnId = keyof typeof DEFAULT_COLUMNS;
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [dateRange, setDateRange] = useState('Hôm nay');
  const [chartRange, setChartRange] = useState('7 ngày');
  const [chartType, setChartType] = useState('bar_compare');
  const [orderRange, setOrderRange] = useState('2 ngày');
  const [topRange, setTopRange] = useState('7 ngày');
  const [topLimit, setTopLimit] = useState(10);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [tempColumns, setTempColumns] = useState(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dailyProducts, setDailyProducts] = useState<any[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  const storeMenuRef = useRef<HTMLDivElement | null>(null);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (storeMenuRef.current && !storeMenuRef.current.contains(event.target as Node)) {
        setStoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (selectedStores.length) params.set('stores', selectedStores.join(','));
      params.set('date', dateRange);
      params.set('chartRange', chartRange);
      params.set('orderRange', orderRange);
      params.set('topRange', topRange);
      params.set('topLimit', String(topLimit));
      if (forceRefreshRef.current) {
        params.set('refresh', String(Date.now()));
        forceRefreshRef.current = false;
      }

      setLoading(true);
      setError('');
      http.get(`/dashboard?${params.toString()}`, { signal: controller.signal })
        .then((response) => {
          if (!active) return;
          setData(response.data);
          setLastUpdated(new Date());
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
  }, [selectedStores, dateRange, chartRange, orderRange, topRange, topLimit, refreshKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshKey((value) => value + 1);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const refreshDashboard = () => {
    forceRefreshRef.current = true;
    setRefreshKey((value) => value + 1);
  };

  const stores = data?.availableStores ?? [];
  const salesChannels = data?.salesChannels ?? [];
  const orderChannels = data?.orderChannels ?? [];
  const chartData = data?.chartData ?? [];
  const topProducts = data?.topProducts ?? [];
  const recentSales = data?.recentSales ?? [];
  const inventory = data?.inventory ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
  const wallets = data?.wallets ?? { zaloOA: 0, shopeeWallet: 0, zaloWallet: 0, adsWallet: 0 };
  const walletItems = data?.walletItems ?? [];
  const totals = data?.totals ?? {};
  const visibleColumnCount = Object.values(columns).filter(Boolean).length || 1;
  const selectedStoreLabel = selectedStores.length === 0 ? 'Tất cả cửa hàng' : selectedStores.length === 1 ? selectedStores[0] : `${selectedStores.length} cửa hàng`;
  const chartMode = CHART_TYPE_OPTIONS.find((option) => option.value === chartType)?.label ?? chartType;
  const chartHasData = chartData.some((row) => row.revenue > 0 || row.prevRevenue > 0);
  const chartTotals = chartData.reduce((acc, row) => ({ current: acc.current + (row.revenue ?? 0), previous: acc.previous + (row.prevRevenue ?? 0) }), { current: 0, previous: 0 });
  const chartPeak = chartData.reduce<{ date: string; revenue: number } | null>((best, row) => (!best || row.revenue > best.revenue ? { date: row.fullDate, revenue: row.revenue ?? 0 } : best), null);
  const summaryCards = [
    { key: 'revenue', icon: <TrendingUp size={18} />, label: 'Doanh thu', value: totals.revenue ?? 0, note: `Theo ${dateRange.toLowerCase()}`, tone: 'violet' },
    { key: 'profit', icon: <DollarSign size={18} />, label: 'Lợi nhuận', value: totals.profit ?? 0, note: `Chi phí ${fmt(totals.expense ?? 0)}`, tone: (totals.profit ?? 0) >= 0 ? 'emerald' : 'rose' },
    { key: 'sales', icon: <ShoppingBag size={18} />, label: 'Đơn hoàn tất', value: totals.sales ?? 0, note: selectedStoreLabel, tone: 'blue' },
    { key: 'inventory', icon: <Package size={18} />, label: 'Giá trị tồn kho', value: inventory.totalCostValue ?? 0, note: `${fmt(inventory.totalQty ?? 0)} sản phẩm`, tone: 'amber' },
  ];
  const activeFilters = [
    { label: 'Kho dữ liệu', value: selectedStoreLabel },
    { label: 'Báo cáo', value: dateRange },
    { label: 'Biểu đồ', value: `${chartRange} · ${chartMode}` },
    { label: 'Đơn hàng', value: orderRange },
    { label: 'Top SP', value: `${topRange} · Top ${topLimit}` },
  ];

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

  const resetFilters = () => {
    setSelectedStores([]);
    setDateRange('Hôm nay');
    setChartRange('7 ngày');
    setChartType('bar_compare');
    setOrderRange('2 ngày');
    setTopRange('7 ngày');
    setTopLimit(10);
  };

  return (
    <main className="dv-page" data-testid="dashboard-page">
      <section className="dv-hero">
        <div>
          <span className="dv-eyebrow"><Sparkles size={14} /> Dashboard bán hàng</span>
          <h1>Tổng quan vận hành</h1>
          <p>Dữ liệu giờ bám theo bộ lọc đang chọn và các vùng chính đều có trạng thái rõ hơn để tránh cảm giác bấm mà như không đổi.</p>
        </div>
        <div className="dv-hero-actions">
          <div className={`dv-sync-card ${loading ? 'is-loading' : ''}`} data-testid="dashboard-status">
            <span>{loading ? <LoaderCircle size={18} /> : <Check size={18} />}</span>
            <div>
              <strong>{loading ? 'Đang cập nhật dữ liệu' : 'Dữ liệu đã đồng bộ'}</strong>
              <small>{error || (lastUpdated ? `Làm mới lúc ${lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa có dữ liệu')}</small>
            </div>
          </div>
          <div className="dv-hero-buttons">
            <button type="button" className="dv-ghost-button" onClick={refreshDashboard} data-testid="refresh-dashboard"><RefreshCcw size={16} /> Làm mới</button>
            <button type="button" className="dv-primary-button" onClick={() => { setTempColumns(columns); setShowColumns(true); }} data-testid="display-settings-button"><Settings2 size={16} /> Hiển thị</button>
          </div>
        </div>
      </section>

      <section className="dv-filter-bar">
        <div className="dv-filter-main">
          <div className="dv-store-picker" ref={storeMenuRef}>
            <button type="button" className="dv-store-trigger" onClick={() => setStoreMenuOpen((value) => !value)} data-testid="store-filter-button">
              <Filter size={16} />
              <span>{selectedStoreLabel}</span>
              <ChevronDown size={16} />
            </button>
            {storeMenuOpen && (
              <div className="dv-store-panel" data-testid="store-filter-panel">
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
              </div>
            )}
          </div>
          <Dropdown value={dateRange} options={DATE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setDateRange} testId="date-filter" />
          <button type="button" className="dv-ghost-button" onClick={resetFilters} data-testid="reset-filters"><RotateCcw size={16} /> Đặt lại</button>
        </div>
      </section>

      <section className="dv-chip-row" data-testid="filter-summary">
        {activeFilters.map((filter) => (
          <div className="dv-filter-chip" key={filter.label}><span>{filter.label}</span><strong>{filter.value}</strong></div>
        ))}
      </section>

      {error && <div className="dv-alert">{error}</div>}

      <section className="dv-summary-grid">
        {summaryCards.map((card) => (
          <article className={`dv-summary-card ${card.tone}`} key={card.key}>
            <span className="dv-summary-icon">{card.icon}</span>
            <div>
              <small>{card.label}</small>
              <strong data-testid={`summary-${card.key}-value`}>{fmt(card.value)}</strong>
              <p>{card.note}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="dv-layout">
        <div className="dv-main-column">
          <section className="dv-surface">
            <div className="dv-surface-head">
              <div>
                <h2>Kênh bán</h2>
                <p>Bảng lấy trực tiếp từ giao dịch thực theo bộ lọc đang chọn.</p>
              </div>
              <span className="dv-head-tag">{selectedStoreLabel}</span>
            </div>
            <div className="dv-table-wrap">
              <table className="dv-table" data-testid="sales-channels-table">
                <thead>
                  <tr>
                    {columns.channel && <th>Kênh bán</th>}
                    {columns.revenue && <th>Doanh thu</th>}
                    {columns.orders && <th>Số đơn</th>}
                    {columns.avgOrder && <th>GTTB</th>}
                    {columns.avgProducts && <th>SLSPTB</th>}
                    {columns.ads && <th>Ads</th>}
                    {columns.profit && <th>Lợi nhuận</th>}
                    {columns.profitPercent && <th>% LN / doanh thu</th>}
                  </tr>
                </thead>
                <tbody>
                  {salesChannels.map((channel) => (
                    <tr key={channel.type} className={channel.type === 'total' ? 'is-total' : ''}>
                      {columns.channel && <td>{channel.label}</td>}
                      {columns.revenue && <td>{fmt(channel.revenue)}</td>}
                      {columns.orders && <td>{fmt(channel.orders)}</td>}
                      {columns.avgOrder && <td>{fmt(channel.avgOrderValue)}</td>}
                      {columns.avgProducts && <td>{channel.avgProducts || ''}</td>}
                      {columns.ads && <td>{fmt(channel.ads)}</td>}
                      {columns.profit && <td className={channel.profit < 0 ? 'is-danger' : ''}>{fmt(channel.profit)}</td>}
                      {columns.profitPercent && <td>{channel.profitPercent ? `${channel.profitPercent}%` : ''}</td>}
                    </tr>
                  ))}
                  {!salesChannels.length && <tr><td colSpan={visibleColumnCount} className="dv-empty">Chưa có dữ liệu</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dv-surface">
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
                {!chartHasData && <div className="dv-chart-empty" data-testid="chart-empty-state">Khoảng này chưa có doanh thu để vẽ biểu đồ.</div>}
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

          <section className="dv-grid-two">
            <section className="dv-surface">
              <div className="dv-surface-head">
                <div><h2>Đơn hàng</h2><p>Trạng thái đơn theo khoảng chọn.</p></div>
                <Dropdown value={orderRange} options={ORDER_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setOrderRange} testId="orders-range-filter" />
              </div>
              <div className="dv-table-wrap">
                <table className="dv-table">
                  <thead><tr><th>Gian hàng</th><th>Mới / chờ xử lý</th><th>Đóng gói</th><th>Đang chuyển</th><th>Hoàn hủy</th><th>Trả hàng</th></tr></thead>
                  <tbody>
                    {orderChannels.map((channel) => (
                      <tr key={channel.label}>
                        <td><span className={`dv-channel-icon ${channel.icon}`}>{channel.label?.[0] || 'A'}</span>{channel.label}</td>
                        <td>{fmt(channel.newOrders)}</td><td>{fmt(channel.packing)}</td><td>{fmt(channel.shipping)}</td><td>{fmt(channel.cancelled)}</td><td>{fmt(channel.returned)}</td>
                      </tr>
                    ))}
                    {!orderChannels.length && <tr><td colSpan={6} className="dv-empty">Chưa có dữ liệu</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="dv-surface">
              <div className="dv-surface-head"><div><h2>Giao dịch gần nhất</h2><p>Danh sách này theo cửa hàng đang chọn.</p></div></div>
              <div className="dv-recent-list" data-testid="recent-sales-list">
                {recentSales.map((sale) => (
                  <a key={sale.id} className="dv-recent-item" href={`/sales-channels/store/find?code=${encodeURIComponent(sale.code)}`}>
                    <span className="dv-recent-icon"><ShoppingBag size={18} /></span>
                    <span className="dv-recent-info"><strong>{sale.customerName}</strong><small>{sale.type} {sale.branchName ? `(${sale.branchName})` : ''}</small><small>{formatSaleTime(sale.createdAt)}</small></span>
                    <span className="dv-recent-value">{fmt(sale.value)}</span>
                  </a>
                ))}
                {!recentSales.length && <div className="dv-empty-state">Chưa có giao dịch hoàn tất nào để hiển thị.</div>}
              </div>
            </section>
          </section>

          <section className="dv-surface">
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
                  {topProducts.map((product) => (
                    <tr key={`${product.rank}-${product.code}`}>
                      <td>{product.rank}</td>
                      <td className="dv-product-name">{product.name}<span>{product.code}</span></td>
                      <td>{fmt(product.qtySold)}</td>
                      <td className={product.qtyReturned ? 'is-danger' : ''}>{product.qtyReturned ? fmt(product.qtyReturned) : ''}</td>
                      <td>{fmt(product.revenue)}</td>
                    </tr>
                  ))}
                  {!topProducts.length && <tr><td colSpan={5} className="dv-empty">Chưa có dữ liệu</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="dv-side-column">
          <section className="dv-surface">
            <div className="dv-surface-head"><div><h2>Số dư ví</h2><p>Danh sách ví lấy từ dữ liệu thực.</p></div></div>
            <div className="dv-metric-grid">
              <Metric icon={<BellDot size={18} />} label="Zalo OA" value={wallets.zaloOA} tone="violet" />
              <Metric icon={<WalletCards size={18} />} label="Ví doanh thu" value={wallets.zaloWallet + wallets.shopeeWallet} tone="blue" />
              <Metric icon={<DollarSign size={18} />} label="Ví Ads" value={wallets.adsWallet} tone="emerald" />
            </div>
            <div className="dv-wallet-list">
              {walletItems.map((wallet) => <div className="dv-wallet-row" key={wallet.code}><span>{wallet.name}</span><strong>{fmt(wallet.balance)}</strong></div>)}
              {!walletItems.length && <div className="dv-empty-state compact">Chưa có dữ liệu ví.</div>}
            </div>
          </section>

          <section className="dv-surface">
            <div className="dv-surface-head"><div><h2>Tồn kho</h2><p>Thay đổi theo cửa hàng đang chọn.</p></div><span className="dv-head-tag">{selectedStoreLabel}</span></div>
            <div className="dv-stack-metrics">
              <Metric icon={<Store size={18} />} label="Số lượng tồn" value={inventory.totalQty} tone="amber" testId="inventory-totalQty-value" />
              <Metric icon={<DollarSign size={18} />} label="Giá vốn tồn kho" value={inventory.totalCostValue} tone="emerald" />
              <Metric icon={<ArrowUpRight size={18} />} label="Giá bán quy đổi" value={inventory.totalSaleValue} tone="blue" />
            </div>
          </section>
        </aside>
      </section>

      {showColumns && (
        <div className="dv-modal-backdrop">
          <div className="dv-modal" data-testid="column-settings-modal">
            <div className="dv-modal-head"><h3>Tùy chỉnh hiển thị</h3><button type="button" onClick={() => setShowColumns(false)}><X size={18} /></button></div>
            <div className="dv-modal-body">
              {COLUMN_DEFS.map((column) => (
                <label key={column.id} className="dv-check-row" data-testid={`column-toggle-${column.id}`}>
                  <input type="checkbox" checked={tempColumns[column.id]} onChange={(event) => setTempColumns({ ...tempColumns, [column.id]: event.target.checked })} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
            <div className="dv-modal-foot">
              <button type="button" onClick={() => setTempColumns(DEFAULT_COLUMNS)}>Về mặc định</button>
              <button type="button" className="primary" onClick={() => { setColumns(tempColumns); setShowColumns(false); }}><Save size={16} /> Lưu</button>
            </div>
          </div>
        </div>
      )}

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
  const ref = useRef<HTMLDivElement | null>(null);
  const label = options.find((option) => option.value === value)?.label ?? value;
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className={`dv-select-menu ${wide ? 'wide' : ''}`} ref={ref} data-testid={testId}>
      <button type="button" className="dv-select-button" onClick={() => setOpen((value) => !value)}><span>{label}</span><ChevronDown size={16} /></button>
      {open && <div className="dv-select-options">{options.map((option) => <button type="button" key={option.value} className={option.value === value ? 'active' : ''} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
    </div>
  );
}

function Metric({ icon, label, value, tone, testId }: { icon: ReactNode; label: string; value: number; tone: 'violet' | 'blue' | 'emerald' | 'amber'; testId?: string }) {
  return <div className={`dv-info-metric ${tone}`}><span>{icon}</span><div><small>{label}</small><strong data-testid={testId}>{fmt(value)}</strong></div></div>;
}

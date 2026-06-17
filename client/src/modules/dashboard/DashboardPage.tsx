import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  BellDot,
  DollarSign,
  Package,
  Save,
  Settings,
  ShoppingBag,
  Store,
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
  { value: 'bar_compare', label: 'Biểu đồ cột: so sánh kỳ trước' },
  { value: 'bar', label: 'Biểu đồ cột: Bán lẻ' },
  { value: 'line', label: 'Biểu đồ đường: Bán lẻ' },
  { value: 'area', label: 'Biểu đồ đường: Tổng doanh thu' },
];
const ORDER_RANGE_OPTIONS = ['2 ngày', '7 ngày', '30 ngày'];
const TOP_RANGE_OPTIONS = ['7 ngày', '14 ngày', '30 ngày'];
const TOP_LIMIT_OPTIONS = [10, 20, 50];

const COLUMN_DEFS = [
  { id: 'channel', label: 'Kênh bán', default: true },
  { id: 'revenue', label: 'Doanh thu', default: true },
  { id: 'orders', label: 'Số đơn', default: true },
  { id: 'avgOrder', label: 'GTTB', default: true },
  { id: 'avgProducts', label: 'SLSPTB', default: false },
  { id: 'ads', label: 'Ads', default: true },
  { id: 'profit', label: 'Lợi nhuận', default: true },
  { id: 'profitPercent', label: '% Lợi nhuận / Doanh thu', default: true },
] as const;

type ColumnId = typeof COLUMN_DEFS[number]['id'];
type DropdownOption = { value: string; label: string };

type DashboardData = {
  totals: Record<string, number>;
  salesChannels: any[];
  orderChannels: any[];
  inventory: { totalQty: number; totalCostValue: number; totalSaleValue: number };
  topProducts: any[];
  chartData: { date: string; fullDate: string; revenue: number; prevRevenue: number }[];
  wallets: { zaloOA: number; shopeeWallet: number; zaloWallet: number; adsWallet: number };
  recentSales: any[];
  availableStores?: string[];
};

const defaultColumns = COLUMN_DEFS.reduce((acc, column) => {
  acc[column.id] = column.default;
  return acc;
}, {} as Record<ColumnId, boolean>);

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
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [dateRange, setDateRange] = useState('Hôm nay');
  const [chartRange, setChartRange] = useState('7 ngày');
  const [chartType, setChartType] = useState('bar_compare');
  const [orderRange, setOrderRange] = useState('2 ngày');
  const [topRange, setTopRange] = useState('7 ngày');
  const [topLimit, setTopLimit] = useState(10);
  const [columns, setColumns] = useState(defaultColumns);
  const [tempColumns, setTempColumns] = useState(defaultColumns);
  const [showColumns, setShowColumns] = useState(false);
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dailyProducts, setDailyProducts] = useState<any[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedStores.length) params.set('stores', selectedStores.join(','));
    params.set('date', dateRange);
    params.set('chartRange', chartRange);
    params.set('orderRange', orderRange);
    params.set('topRange', topRange);
    params.set('topLimit', String(topLimit));

    setLoading(true);
    http.get(`/dashboard?${params.toString()}`)
      .then((response) => setData(response.data))
      .finally(() => setLoading(false));
  }, [selectedStores, dateRange, chartRange, orderRange, topRange, topLimit]);

  const stores = data?.availableStores ?? [];
  const filteredStores = useMemo(
    () => stores.filter((store) => store.toLowerCase().includes(storeSearch.toLowerCase())),
    [stores, storeSearch],
  );

  const chartData = data?.chartData ?? [];
  const salesChannels = data?.salesChannels ?? [];
  const orderChannels = data?.orderChannels ?? [];
  const recentSales = data?.recentSales ?? [];
  const topProducts = data?.topProducts ?? [];
  const inventory = data?.inventory ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
  const wallets = data?.wallets ?? { zaloOA: 0, shopeeWallet: 0, zaloWallet: 0, adsWallet: 0 };

  const visibleColumnCount = Object.values(columns).filter(Boolean).length || 1;

  const openDailyProducts = async (payload: any) => {
    if (!payload?.activePayload?.[0]?.payload?.fullDate) return;
    const fullDate = payload.activePayload[0].payload.fullDate;
    setSelectedDate(fullDate);
    setShowDailyModal(true);
    setDailyLoading(true);
    try {
      const storesParam = selectedStores.join(',');
      const response = await http.get(`/dashboard/daily-products?date=${encodeURIComponent(fullDate)}&stores=${encodeURIComponent(storesParam)}`);
      setDailyProducts(response.data.products ?? []);
    } finally {
      setDailyLoading(false);
    }
  };

  const toggleStore = (store: string) => {
    setSelectedStores((current) => (
      current.includes(store) ? current.filter((item) => item !== store) : [...current, store]
    ));
  };

  return (
    <main className="dv-page">
      <header className="dv-toolbar">
        <div>
          <h1>Tổng quan</h1>
          <span>{loading ? 'Đang cập nhật số liệu...' : 'Dữ liệu đồng bộ từ bán hàng, kho và đơn hàng'}</span>
        </div>
        <div className="dv-toolbar-actions">
          <div className="dv-store-filter">
            <Store size={16} />
            <input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Tìm cửa hàng" />
            <div className="dv-store-menu">
              {filteredStores.map((store) => (
                <label key={store}>
                  <input type="checkbox" checked={selectedStores.includes(store)} onChange={() => toggleStore(store)} />
                  {store}
                </label>
              ))}
              {!filteredStores.length && <span>Không có cửa hàng</span>}
            </div>
          </div>
          <Dropdown value={dateRange} options={DATE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setDateRange} />
          <button type="button" className="dv-icon-button" onClick={() => { setTempColumns(columns); setShowColumns(true); }} title="Tùy chỉnh cột">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <section className="dv-layout">
        <div className="dv-main-column">
          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Kênh bán</h2>
              <span>{selectedStores.length ? `${selectedStores.length} cửa hàng` : 'Tất cả cửa hàng'}</span>
            </div>
            <div className="dv-table-wrap">
              <table className="dv-table">
                <thead>
                  <tr>
                    {columns.channel && <th>Kênh bán</th>}
                    {columns.revenue && <th>Doanh thu</th>}
                    {columns.orders && <th>Số đơn</th>}
                    {columns.avgOrder && <th>GTTB</th>}
                    {columns.avgProducts && <th>SLSPTB</th>}
                    {columns.ads && <th>Ads</th>}
                    {columns.profit && <th>Lợi nhuận</th>}
                    {columns.profitPercent && <th>% Lợi nhuận / Doanh thu</th>}
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
                  {!salesChannels.length && (
                    <tr><td colSpan={visibleColumnCount} className="dv-empty">Chưa có dữ liệu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Doanh thu theo thời gian</h2>
              <div className="dv-card-actions">
                <Dropdown value={chartRange} options={CHART_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setChartRange} />
                <Dropdown value={chartType} options={CHART_TYPE_OPTIONS} onChange={setChartType} wide />
              </div>
            </div>
            <div className="dv-chart">
              <ResponsiveContainer width="100%" height={300}>
                {chartType === 'area' ? (
                  <AreaChart data={chartData} onClick={openDailyProducts} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="currentRevenue" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" />
                    <Area dataKey="prevRevenue" name="Kỳ trước" stroke="#c4b5fd" fill="transparent" strokeWidth={2} />
                    <Area dataKey="revenue" name="Kỳ này" stroke="#2563eb" fill="url(#currentRevenue)" strokeWidth={2} />
                  </AreaChart>
                ) : chartType === 'line' ? (
                  <LineChart data={chartData} onClick={openDailyProducts} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" />
                    <Line dataKey="revenue" name="Bán lẻ" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} onClick={openDailyProducts} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" />
                    {chartType === 'bar_compare' && <Bar dataKey="prevRevenue" name="Kỳ trước" fill="#c4b5fd" radius={[4, 4, 0, 0]} maxBarSize={28} />}
                    <Bar dataKey="revenue" name="Kỳ này" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Đơn hàng</h2>
              <Dropdown value={orderRange} options={ORDER_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setOrderRange} />
            </div>
            <div className="dv-table-wrap">
              <table className="dv-table">
                <thead>
                  <tr>
                    <th>Gian hàng</th>
                    <th>Đơn mới / Chờ xử lý</th>
                    <th>Đang đóng gói</th>
                    <th>Đang chuyển</th>
                    <th>Đơn hoàn hủy</th>
                    <th>Trả hàng hoàn tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {orderChannels.map((channel) => (
                    <tr key={channel.label}>
                      <td><span className={`dv-channel-icon ${channel.icon}`}>{channel.label?.[0] || 'A'}</span>{channel.label}</td>
                      <td>{fmt(channel.newOrders)}</td>
                      <td>{fmt(channel.packing)}</td>
                      <td>{fmt(channel.shipping)}</td>
                      <td>{fmt(channel.cancelled)}</td>
                      <td>{fmt(channel.returned)}</td>
                    </tr>
                  ))}
                  {!orderChannels.length && (
                    <tr><td colSpan={6} className="dv-empty">Chưa có dữ liệu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Số dư</h2>
              <span>Tất cả kênh bán</span>
            </div>
            <div className="dv-wallet-grid">
              <Metric icon={<BellDot size={20} />} label="Zalo OA" value={wallets.zaloOA} />
              <Metric icon={<WalletCards size={20} />} label="Ví doanh thu" value={wallets.zaloWallet + wallets.shopeeWallet} />
              <Metric icon={<DollarSign size={20} />} label="Ví Ads" value={wallets.adsWallet} tone="blue" />
            </div>
          </section>

          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Sản phẩm bán chạy</h2>
              <div className="dv-card-actions">
                <Dropdown value={topRange} options={TOP_RANGE_OPTIONS.map((option) => ({ value: option, label: option }))} onChange={setTopRange} />
                <Dropdown value={String(topLimit)} options={TOP_LIMIT_OPTIONS.map((option) => ({ value: String(option), label: `Top ${option}` }))} onChange={(value) => setTopLimit(Number(value))} />
              </div>
            </div>
            <div className="dv-table-wrap">
              <table className="dv-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tên sản phẩm</th>
                    <th>SL bán</th>
                    <th>SL trả</th>
                    <th>Doanh thu</th>
                  </tr>
                </thead>
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
                  {!topProducts.length && (
                    <tr><td colSpan={5} className="dv-empty">Chưa có dữ liệu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Tồn kho</h2>
            </div>
            <div className="dv-inventory-grid">
              <Metric icon={<Store size={22} />} label="Số lượng tồn" value={inventory.totalQty} raw />
              <Metric icon={<DollarSign size={22} />} label="Giá trị tồn theo giá vốn" value={inventory.totalCostValue} tone="green" />
              <Metric icon={<Package size={22} />} label="Giá trị tồn theo giá bán" value={inventory.totalSaleValue} tone="blue" />
            </div>
          </section>
        </div>

        <aside className="dv-side-column">
          <section className="dv-card">
            <div className="dv-card-head">
              <h2>Đơn mới</h2>
            </div>
            <div className="dv-recent-list">
              {recentSales.map((sale) => (
                <a key={sale.id} className="dv-recent-item" href={`/sales-channels/store/find?code=${encodeURIComponent(sale.code)}`}>
                  <span className="dv-recent-icon"><ShoppingBag size={18} /></span>
                  <span className="dv-recent-info">
                    <strong>{sale.customerName}</strong>
                    <small>{sale.type} {sale.branchName ? `(${sale.branchName})` : ''}</small>
                    <small>{formatSaleTime(sale.createdAt)}</small>
                  </span>
                  <span className="dv-recent-value">{fmt(sale.value)}</span>
                </a>
              ))}
              {!recentSales.length && <div className="dv-empty">Chưa có dữ liệu</div>}
            </div>
          </section>
        </aside>
      </section>

      {showColumns && (
        <div className="dv-modal-backdrop">
          <div className="dv-modal">
            <div className="dv-modal-head">
              <h3>Tùy chỉnh hiển thị</h3>
              <button type="button" onClick={() => setShowColumns(false)}><X size={18} /></button>
            </div>
            <div className="dv-modal-body">
              {COLUMN_DEFS.map((column) => (
                <label key={column.id} className="dv-check-row">
                  <input
                    type="checkbox"
                    checked={tempColumns[column.id]}
                    onChange={(event) => setTempColumns({ ...tempColumns, [column.id]: event.target.checked })}
                  />
                  {column.label}
                </label>
              ))}
            </div>
            <div className="dv-modal-foot">
              <button type="button" onClick={() => setTempColumns(defaultColumns)}>Quay về mặc định</button>
              <button type="button" className="primary" onClick={() => { setColumns(tempColumns); setShowColumns(false); }}>
                <Save size={16} /> Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {showDailyModal && (
        <div className="dv-modal-backdrop">
          <div className="dv-modal wide">
            <div className="dv-modal-head">
              <h3>Chi tiết sản phẩm bán ra ngày {selectedDate}</h3>
              <button type="button" onClick={() => setShowDailyModal(false)}><X size={18} /></button>
            </div>
            <div className="dv-modal-body">
              {dailyLoading ? (
                <div className="dv-empty">Đang tải dữ liệu...</div>
              ) : (
                <table className="dv-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tên sản phẩm</th>
                      <th>Số lượng</th>
                      <th>Giá bán TB</th>
                      <th>Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyProducts.map((product, index) => (
                      <tr key={`${product.code}-${index}`}>
                        <td>{index + 1}</td>
                        <td className="dv-product-name">{product.name}<span>{product.code}</span></td>
                        <td>{fmt(product.qty)}</td>
                        <td>{fmt(product.price)}</td>
                        <td>{fmt(product.revenue)}</td>
                      </tr>
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

function Dropdown({ value, options, onChange, wide = false }: { value: string; options: DropdownOption[]; onChange: (value: string) => void; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? value;

  return (
    <div className={`dv-select-menu ${wide ? 'wide' : ''}`} onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <button type="button" className="dv-select-button" onClick={() => setOpen((state) => !state)}>
        {current}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="dv-select-options">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={option.value === value ? 'active' : ''}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value, tone = 'purple', raw = false }: { icon: ReactNode; label: string; value: number; tone?: 'purple' | 'green' | 'blue'; raw?: boolean }) {
  return (
    <div className={`dv-metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{raw ? fmt(value) : fmt(value)}</strong>
      </div>
    </div>
  );
}

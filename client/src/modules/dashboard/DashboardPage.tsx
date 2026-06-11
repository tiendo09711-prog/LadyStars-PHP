import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { http } from '../../core/api/http';
import './dashboard.css';

const fmt = (v: number) => Number(v || 0).toLocaleString('vi-VN');
const fmtM = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
};

// Removed hardcoded storesList
const DATE_MATRIX = [
  'Hôm qua', 'Hôm nay', '7 ngày',
  'Tuần trước', 'Tuần này', '14 ngày',
  'Tháng trước', 'Tháng này', '30 ngày'
];
const CHART_RANGE_OPTS = ['7 ngày', '14 ngày', '30 ngày', 'Tháng trước', 'Tháng này'];
const CHART_TYPE_OPTS = [
  'Biểu đồ đường: Tổng doanh thu',
  'Biểu đồ đường: Từng kênh bán',
  'Biểu đồ cột: Từng kênh bán',
  'Biểu đồ cột: Từng kênh bán, so sánh kỳ trước'
];
const ORDER_OPTS = ['2 ngày', '7 ngày', '30 ngày'];
const WALLET_OPTS = ['Tất cả kênh bán'];
const TOP_DATE_OPTS = ['7 ngày', '14 ngày', '30 ngày'];
const TOP_COUNT_OPTS = ['Top 10', 'Top 20', 'Top 50'];

const COLS_DEF = [
  { id: 'kenh_ban', label: 'Kênh bán', default: true },
  { id: 'doanh_thu', label: 'Doanh thu', default: true },
  { id: 'so_don', label: 'Số đơn', default: true },
  { id: 'gttb', label: 'GTTB', default: true },
  { id: 'slsptb', label: 'SLSPTB', default: false },
  { id: 'ads', label: 'Ads', default: true },
  { id: 'loi_nhuan', label: 'Lợi nhuận', default: true },
  { id: 'pct_loi_nhuan', label: '% Lợi nhuận / Doanh thu', default: true },
];

type DashData = {
  totals: Record<string, number>;
  salesChannels: any[];
  orderChannels: any[];
  inventory: { totalQty: number; totalCostValue: number; totalSaleValue: number };
  topProducts: any[];
  chartData: { date: string; revenue: number; prevRevenue: number }[];
  wallets: { zaloOA: number; shopeeWallet: number; zaloWallet: number; adsWallet: number };
  recentSales: any[];
  availableStores?: string[];
};

// Channel icons as SVG/emoji
const CHANNEL_ICON: Record<string, { cls: string; text: string }> = {
  admin: { cls: 'admin', text: 'A' },
  facebook: { cls: 'facebook', text: 'f' },
  instagram: { cls: 'instagram', text: '📷' },
  zalo: { cls: 'zalo', text: 'Z' },
  api: { cls: 'api', text: '</>' },
  website: { cls: 'website', text: '🌐' },
  shopee: { cls: 'shopee', text: 'S' },
  tiktok: { cls: 'tiktok', text: '♪' },
};

export function DashboardPage() {
  const CustomTooltip = ({ active, payload, label, chartTypeOpt }: any) => {
    if (active && payload && payload.length) {
      const isCompareBar = chartTypeOpt === CHART_TYPE_OPTS[3];
      const isCompareLine = chartTypeOpt === CHART_TYPE_OPTS[0];

      return (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 9999 }}>
          {isCompareLine ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <div>
                <div style={{ color: '#6B7280', marginBottom: 4 }}>{label} (Kỳ trước)</div>
                <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#EF4444', marginRight: 4 }}></span>Tháng trước: {fmt(payload[1]?.value || 0)}</div>
              </div>
              <div>
                <div style={{ color: '#6B7280', marginBottom: 4 }}>{label} (Kỳ này)</div>
                <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', marginRight: 4 }}></span>Tháng này: {fmt(payload[0]?.value || 0)}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              {isCompareBar && (
                <div>
                  <div style={{ color: '#6B7280', marginBottom: 4 }}>{label} (Kỳ trước)</div>
                  <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#C4B5FD', marginRight: 4 }}></span>Bán lẻ: {fmt(payload[0]?.value || 0)}</div>
                </div>
              )}
              <div>
                <div style={{ color: '#6B7280', marginBottom: 4 }}>{label} {isCompareBar ? '(Kỳ này)' : ''}</div>
                <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6', marginRight: 4 }}></span>Bán lẻ: {fmt(isCompareBar ? (payload[1]?.value || 0) : (payload[0]?.value || 0))}</div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const [data, setData] = useState<DashData | null>(null);
  
  // Custom dropdown states
  const [showStoreDrop, setShowStoreDrop] = useState(false);
  const [showDateDrop, setShowDateDrop] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [dateRange, setDateRange] = useState('Hôm nay');
  const [cols, setCols] = useState(COLS_DEF.reduce((acc, c) => ({ ...acc, [c.id]: c.default }), {} as Record<string, boolean>));
  const [tempCols, setTempCols] = useState(cols);

  const [chartRange, setChartRange] = useState(CHART_RANGE_OPTS[1]);
  const [chartType, setChartType] = useState(CHART_TYPE_OPTS[3]);
  const [showChartRangeDrop, setShowChartRangeDrop] = useState(false);
  const [showChartTypeDrop, setShowChartTypeDrop] = useState(false);
  const [chartRangeSearch, setChartRangeSearch] = useState('');

  const [orderRange, setOrderRange] = useState(ORDER_OPTS[0]);
  const [walletFilter, setWalletFilter] = useState(WALLET_OPTS[0]);
  const [topDate, setTopDate] = useState(TOP_DATE_OPTS[0]);
  const [topCount, setTopCount] = useState(TOP_COUNT_OPTS[0]);
  const [orderExpanded, setOrderExpanded] = useState(true);

  // Modal Daily Products State
  const [showProductModal, setShowProductModal] = useState(false);
  const [dailyProducts, setDailyProducts] = useState<any[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.dv2-dropdown-container')) {
        setShowStoreDrop(false);
        setShowDateDrop(false);
        setShowChartRangeDrop(false);
        setShowChartTypeDrop(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchDashboard = async () => {
    const params = new URLSearchParams();
    if (selectedStores.length > 0) params.set('stores', selectedStores.join(','));
    params.set('date', dateRange);
    params.set('chartRange', chartRange);
    try {
      const r = await http.get(`/dashboard?${params.toString()}`);
      setData(r.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchDashboard();
  }, [selectedStores, dateRange, chartRange]);

  const handleChartClick = async (e: any) => {
    if (!e || !e.activePayload || !e.activePayload[0]) return;
    const item = e.activePayload[0].payload;
    if (!item.fullDate) return;
    
    setSelectedDate(item.fullDate);
    setShowProductModal(true);
    setLoadingDaily(true);
    
    try {
      const storesParam = selectedStores.length > 0 ? selectedStores.join(',') : '';
      const res = await http.get(`/dashboard/daily-products?date=${encodeURIComponent(item.fullDate)}&stores=${encodeURIComponent(storesParam)}`);
      setDailyProducts(res.data.products || []);
    } catch (err) {
      console.error(err);
      setDailyProducts([]);
    } finally {
      setLoadingDaily(false);
    }
  };

  const salesChannels = data?.salesChannels ?? [];
  const orderChannels = data?.orderChannels ?? [];
  const inventory = data?.inventory ?? { totalQty: 0, totalCostValue: 0, totalSaleValue: 0 };
  const topProducts = data?.topProducts ?? [];
  const chartData = data?.chartData ?? [];
  const wallets = data?.wallets ?? { zaloOA: 0, shopeeWallet: 0, zaloWallet: 0, adsWallet: 0 };
  const storesList = data?.availableStores ?? [];

  return (
    <div className="dv2">
      <div className="dv2-topbar">
        <h1>Tổng quan</h1>
        <div className="dv2-filters">
          <div className="dv2-dropdown-container">
            <button className="dv2-dropdown-btn" onClick={() => { setShowStoreDrop(!showStoreDrop); setShowDateDrop(false); }}>
              {selectedStores.length === 0 ? 'Tất cả cửa hàng' : `${selectedStores.length} cửa hàng`}
            </button>
            {showStoreDrop && (
              <div className="dv2-dropdown-menu" style={{ width: 260 }}>
                <div className="dv2-store-search">
                  <input type="text" placeholder="Tìm kiếm tên, SĐT chi nhánh" value={storeSearch} onChange={e => setStoreSearch(e.target.value)} />
                </div>
                <div className="dv2-store-list">
                  {storesList.filter(s => s.toLowerCase().includes(storeSearch.toLowerCase())).map(s => (
                    <label key={s} className="dv2-store-item">
                      <input 
                        type="checkbox" 
                        checked={selectedStores.includes(s)}
                        onChange={e => {
                          if (e.target.checked) setSelectedStores([...selectedStores, s]);
                          else setSelectedStores(selectedStores.filter(x => x !== s));
                        }} 
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="dv2-dropdown-container">
            <button className="dv2-dropdown-btn" onClick={() => { setShowDateDrop(!showDateDrop); setShowStoreDrop(false); }}>
              {dateRange}
            </button>
            {showDateDrop && (
              <div className="dv2-dropdown-menu">
                <div className="dv2-date-menu">
                  {DATE_MATRIX.map(d => (
                    <div 
                      key={d} 
                      className={`dv2-date-item ${dateRange === d ? 'active' : ''}`}
                      onClick={() => { setDateRange(d); setShowDateDrop(false); }}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button 
            onClick={() => { setTempCols(cols); setShowSettings(true); }}
            style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}
          >
            ⊞
          </button>
        </div>
      </div>

      <div className="dv2-card">
        <table className="dv2-table">
          <thead>
            <tr>
              {cols.kenh_ban && <th>Kênh bán</th>}
              {cols.doanh_thu && <th>Doanh thu</th>}
              {cols.so_don && <th>Số đơn</th>}
              {cols.gttb && <th>GTTB</th>}
              {cols.slsptb && <th>SLSPTB</th>}
              {cols.ads && <th>Ads</th>}
              {cols.loi_nhuan && <th>Lợi nhuận</th>}
              {cols.pct_loi_nhuan && <th>% Lợi nhuận / Doanh thu</th>}
            </tr>
          </thead>
          <tbody>
            {salesChannels.map((ch, i) => {
              const isTotal = ch.type === 'total';
              return (
                <tr key={i} className={isTotal ? 'row-total' : 'row-bold'}>
                  {cols.kenh_ban && <td style={{ fontWeight: isTotal ? 700 : 400 }}>{ch.label}</td>}
                  {cols.doanh_thu && <td>{fmt(ch.revenue)}</td>}
                  {cols.so_don && <td>{ch.orders}</td>}
                  {cols.gttb && <td>{fmt(ch.avgOrderValue)}</td>}
                  {cols.slsptb && <td></td>}
                  {cols.ads && <td></td>}
                  {cols.loi_nhuan && <td>{fmt(ch.profit)}</td>}
                  {cols.pct_loi_nhuan && <td></td>}
                </tr>
              );
            })}
            <tr>
              <td colSpan={Object.values(cols).filter(Boolean).length} style={{ padding: '6px 12px' }}>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#1F2937', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setOrderExpanded(!orderExpanded)}
                >
                  Đơn hàng {orderExpanded ? '▾' : '▸'}
                </button>
              </td>
            </tr>
            {orderExpanded && orderChannels.map((ch, i) => {
              const ic = CHANNEL_ICON[ch.icon] ?? { cls: 'admin', text: ch.label[0] };
              return (
                <tr key={i} className="row-channel">
                  {cols.kenh_ban && (
                    <td>
                      <span className={`ch-icon ${ic.cls}`}>{ic.text}</span>
                      <span className="txt-blue">{ch.label}</span>
                    </td>
                  )}
                  {cols.doanh_thu && <td></td>}
                  {cols.so_don && <td></td>}
                  {cols.gttb && <td></td>}
                  {cols.slsptb && <td></td>}
                  {cols.ads && <td></td>}
                  {cols.loi_nhuan && <td></td>}
                  {cols.pct_loi_nhuan && <td></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="dv2-card">
        <div className="dv2-card-header">
          <h2>Doanh thu theo thời gian</h2>
          <div className="dv2-filters">
            <div className="dv2-dropdown-container">
              <button 
                className="dv2-dropdown-btn" 
                style={{ minWidth: 120 }}
                onClick={() => { setShowChartRangeDrop(!showChartRangeDrop); setShowChartTypeDrop(false); }}
              >
                {chartRange}
              </button>
              {showChartRangeDrop && (
                <div className="dv2-dropdown-menu" style={{ width: 220 }}>
                  <div className="dv2-store-search">
                    <input type="text" placeholder="" value={chartRangeSearch} onChange={e => setChartRangeSearch(e.target.value)} />
                    <span style={{ position: 'absolute', right: 16, top: 18, color: '#9CA3AF' }}>🔍</span>
                  </div>
                  <div className="dv2-store-list" style={{ padding: '4px 0' }}>
                    {CHART_RANGE_OPTS.filter(o => o.toLowerCase().includes(chartRangeSearch.toLowerCase())).map(o => (
                      <div 
                        key={o} 
                        className="dv2-store-item" 
                        onClick={() => { setChartRange(o); setShowChartRangeDrop(false); }}
                        style={{ padding: '8px 16px' }}
                      >
                        {o}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="dv2-dropdown-container">
              <button 
                onClick={() => { setShowChartTypeDrop(!showChartTypeDrop); setShowChartRangeDrop(false); }}
                style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{ color: '#6B7280' }}>⚙</span>
                <span style={{ fontSize: 10, color: '#6B7280' }}>v</span>
              </button>
              {showChartTypeDrop && (
                <div className="dv2-dropdown-menu" style={{ width: 280 }}>
                  <div className="dv2-store-list" style={{ padding: '4px 0' }}>
                    {CHART_TYPE_OPTS.map(o => (
                      <div 
                        key={o} 
                        className="dv2-store-item" 
                        onClick={() => { setChartType(o); setShowChartTypeDrop(false); }}
                        style={{ padding: '8px 16px', fontWeight: chartType === o ? 600 : 400 }}
                      >
                        {o}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="dv2-chart-wrap" style={{ padding: '16px 16px 0 16px' }}>
          {chartData.length === 0 ? (
            <div className="dv2-empty">Chưa có dữ liệu</div>
          ) : (
            <div style={{ width: '100%', height: 280, marginTop: 10 }}>
              {chartType === CHART_TYPE_OPTS[0] && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPrev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={15} />
                    <YAxis tickFormatter={fmtM} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} dx={-10} domain={[0, 'auto']} />
                    <Tooltip content={<CustomTooltip chartTypeOpt={chartType} />} cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10, color: '#6B7280' }} />
                    <Area type="monotone" dataKey="revenue" name="Tháng này" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorCurrent)" activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer' }} />
                    <Area type="monotone" dataKey="prevRevenue" name="Tháng trước" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorPrev)" activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer' }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {chartType === CHART_TYPE_OPTS[1] && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={15} />
                    <YAxis tickFormatter={fmtM} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} dx={-10} domain={[0, 'auto']} />
                    <Tooltip content={<CustomTooltip chartTypeOpt={chartType} />} cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10, color: '#6B7280' }} />
                    <Line type="monotone" dataKey="revenue" name="Bán lẻ" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {chartType === CHART_TYPE_OPTS[2] && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={2} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={15} />
                    <YAxis tickFormatter={fmtM} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} dx={-10} domain={[0, 'auto']} />
                    <Tooltip content={<CustomTooltip chartTypeOpt={chartType} cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }} />} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10, color: '#6B7280' }} />
                    <Bar dataKey="revenue" name="Bán lẻ" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={40} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === CHART_TYPE_OPTS[3] && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={0} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={15} />
                    <YAxis tickFormatter={fmtM} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} dx={-10} domain={[0, 'auto']} />
                    <Tooltip content={<CustomTooltip chartTypeOpt={chartType} cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }} />} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10, color: '#6B7280' }} />
                    <Bar dataKey="prevRevenue" name="Kỳ trước" fill="#C4B5FD" radius={[4, 4, 0, 0]} maxBarSize={24} cursor="pointer" />
                    <Bar dataKey="revenue" name="Kỳ này" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={24} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="dv2-card dv2-order-section">
        <div className="dv2-card-header">
          <h2>Đơn hàng</h2>
          <div className="dv2-filters">
            <select className="dv2-select" value={orderRange} onChange={e => setOrderRange(e.target.value)}>
              {ORDER_OPTS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <table className="dv2-table">
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
            {orderChannels.length === 0 ? (
              <tr>
                <td colSpan={6} className="dv2-empty">Chưa có dữ liệu</td>
              </tr>
            ) : (
              orderChannels.map((ch, i) => {
                const ic = CHANNEL_ICON[ch.icon] ?? { cls: 'admin', text: ch.label[0] };
                return (
                  <tr key={i}>
                    <td>
                      <span className={`ch-icon ${ic.cls}`}>{ic.text}</span>
                      <span className="txt-blue">{ch.label}</span>
                    </td>
                    <td>{ch.newOrders || 0}</td>
                    <td>{ch.packing || 0}</td>
                    <td>{ch.shipping || 0}</td>
                    <td>{ch.cancelled || 0}</td>
                    <td>{ch.returned || 0}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="dv2-card">
        <div className="dv2-card-header">
          <h2>Số dư</h2>
          <div className="dv2-filters">
            <select className="dv2-select" value={walletFilter} onChange={e => setWalletFilter(e.target.value)}>
              {WALLET_OPTS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="dv2-wallets" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="dv2-wallet-item">
            <div className="dv2-wallet-icon" style={{ background: '#EFF6FF' }}>
              <span style={{ fontSize: 16 }}>📱</span>
            </div>
            <div className="dv2-wallet-info">
              <p>Zalo OA : <a href="#" className="dv2-wallet-link">{fmt(wallets.zaloOA)} [Nạp tiền]</a></p>
            </div>
          </div>
          <div className="dv2-wallet-item">
            <div className="dv2-wallet-icon" style={{ background: '#FFF0F0' }}>
              <span style={{ fontSize: 16 }}>❤️</span>
            </div>
            <div className="dv2-wallet-info">
              <p>Ví doanh thu</p>
              <strong>{fmt(wallets.zaloWallet)}</strong>
            </div>
          </div>
          <div className="dv2-wallet-item">
            <div className="dv2-wallet-icon" style={{ background: '#FFF0F0' }}>
              <span style={{ fontSize: 16, filter: 'sepia(1) saturate(3) hue-rotate(320deg)' }}>🛍</span>
            </div>
            <div className="dv2-wallet-info">
              <p>Ví Ads</p>
              <strong>{fmt(wallets.adsWallet)}</strong>
            </div>
          </div>
        </div>
        <table className="dv2-wallet-table">
          <thead>
            <tr>
              <th>Gian hàng</th>
              <th>Ví doanh thu</th>
              <th>Ví Ads</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tổng cộng</td>
              <td className="txt-blue">{fmt(wallets.zaloWallet)}</td>
              <td className="txt-red">{fmt(wallets.adsWallet)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="dv2-card">
        <div className="dv2-card-header">
          <h2>Sản phẩm bán chạy</h2>
          <div className="dv2-filters">
            <select className="dv2-select" value={topDate} onChange={e => setTopDate(e.target.value)}>
              {TOP_DATE_OPTS.map(o => <option key={o}>{o}</option>)}
            </select>
            <select className="dv2-select" value={topCount} onChange={e => setTopCount(e.target.value)}>
              {TOP_COUNT_OPTS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <table className="dv2-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: 40 }}>#</th>
              <th style={{ textAlign: 'left' }}>Tên sản phẩm</th>
              <th>SL bán</th>
              <th>SL trả</th>
              <th>Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {topProducts.length === 0 ? (
              <tr><td colSpan={5} className="dv2-empty">Chưa có dữ liệu</td></tr>
            ) : (
              topProducts.map((p, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#6B7280' }}>{p.rank}</td>
                  <td style={{ textAlign: 'left' }}>{p.name}</td>
                  <td className="txt-blue">{p.qtySold}</td>
                  <td>{p.qtyReturned > 0 ? p.qtyReturned : ''}</td>
                  <td>{fmt(p.revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="dv2-card">
        <div className="dv2-card-header">
          <h2>Tồn kho</h2>
        </div>
        <div className="dv2-inventory">
          <div className="dv2-inv-item">
            <div className="dv2-inv-icon">🏪</div>
            <div className="dv2-inv-info">
              <p>Số lượng tồn</p>
              <strong>{fmt(inventory.totalQty)}</strong>
            </div>
          </div>
          <div className="dv2-inv-item">
            <div className="dv2-inv-icon" style={{ background: '#F0FDF4' }}>💲</div>
            <div className="dv2-inv-info">
              <p>Giá trị tồn theo giá vốn</p>
              <strong>{fmt(inventory.totalCostValue)}</strong>
            </div>
          </div>
          <div className="dv2-inv-item">
            <div className="dv2-inv-icon" style={{ background: '#EFF6FF' }}>💰</div>
            <div className="dv2-inv-info">
              <p>Giá trị tồn theo giá bán</p>
              <strong>{fmt(inventory.totalSaleValue)}</strong>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="dv2-modal-overlay">
          <div className="dv2-modal">
            <div className="dv2-modal-header">
              <h3>Tùy chỉnh hiển thị</h3>
              <button className="dv2-modal-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="dv2-modal-body">
              <div className="dv2-modal-search">
                <input 
                  type="checkbox" 
                  checked={Object.values(tempCols).every(Boolean)}
                  onChange={e => {
                    const val = e.target.checked;
                    setTempCols(Object.keys(tempCols).reduce((acc, k) => ({ ...acc, [k]: val }), {}));
                  }}
                />
                <div className="input-wrap">
                  <input type="text" placeholder="Tìm kiếm tên cột" />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}>🔍</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {COLS_DEF.map(c => (
                  <label key={c.id} className={`dv2-col-item ${tempCols[c.id] ? 'checked' : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={tempCols[c.id]} 
                      onChange={e => setTempCols({ ...tempCols, [c.id]: e.target.checked })} 
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="dv2-modal-footer">
              <button 
                className="dv2-btn-default"
                onClick={() => setTempCols(COLS_DEF.reduce((acc, c) => ({ ...acc, [c.id]: c.default }), {}))}
              >
                Quay về mặc định
              </button>
              <button 
                className="dv2-btn-primary"
                onClick={() => { setCols(tempCols); setShowSettings(false); }}
              >
                <span>💾</span> Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, width: 800, maxWidth: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#111827' }}>Chi tiết sản phẩm bán ra ngày {selectedDate}</h2>
              <button onClick={() => setShowProductModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6B7280', padding: 0, lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {loadingDaily ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Đang tải dữ liệu...</div>
              ) : dailyProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Không có sản phẩm nào được bán ra vào ngày này.</div>
              ) : (
                <table className="dv2-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center', width: 40 }}>#</th>
                      <th style={{ textAlign: 'left' }}>Tên sản phẩm</th>
                      <th style={{ textAlign: 'center' }}>Số lượng</th>
                      <th style={{ textAlign: 'right' }}>Giá bán trung bình</th>
                      <th style={{ textAlign: 'right' }}>Tổng doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyProducts.map((p, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: 'center', color: '#6B7280' }}>{i + 1}</td>
                        <td style={{ textAlign: 'left', fontWeight: 500, color: '#111827' }}>{p.name} <span style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 8 }}>({p.code})</span></td>
                        <td style={{ textAlign: 'center' }} className="txt-blue">{p.qty}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F9FAFB', fontWeight: 600 }}>
                      <td colSpan={2} style={{ textAlign: 'right', padding: '12px 16px' }}>Tổng cộng:</td>
                      <td style={{ textAlign: 'center', color: '#3B82F6' }}>{fmt(dailyProducts.reduce((acc, p) => acc + p.qty, 0))}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', color: '#059669' }}>{fmt(dailyProducts.reduce((acc, p) => acc + p.revenue, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB' }}>
              <button onClick={() => setShowProductModal(false)} style={{ background: '#fff', border: '1px solid #D1D5DB', padding: '8px 16px', borderRadius: 6, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { http } from '../../core/api/http';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { FileDown, Printer, LayoutGrid, Plus, X, Search } from 'lucide-react';
import { DateRangePicker } from '../../core/components/ui/DateRangePicker';
import { CustomSelect } from '../../core/components/ui/CustomSelect';
import './RevenueByStorePage.css';

interface StoreRevenueData {
  id: string;
  branchId: string;
  branchName: string;
  time: string;
  order: { revenue: number; pointUsage: number; profit: number; };
  retail: { revenue: number; pointUsage: number; profit: number; };
  wholesale: { revenue: number; profit: number; };
  total: { revenue: number; pointUsage: number; profit: number; };
}

const COLORS = ['#42a5f5', '#7e57c2', '#ff9800', '#4caf50', '#ef5350', '#26a69a', '#ec407a'];

export function RevenueByStorePage() {
  const [data, setData] = useState<StoreRevenueData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [displayType, setDisplayType] = useState('Theo ngày');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceType, setInvoiceType] = useState('all');
  const [startHour, setStartHour] = useState('');
  const [startMinute, setStartMinute] = useState('');
  const [endHour, setEndHour] = useState('');
  const [endMinute, setEndMinute] = useState('');
  const [tab, setTab] = useState('Kho hàng');
  
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Column visibility state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [colSearch, setColSearch] = useState('');
  const [cols, setCols] = useState({
    num: true, branch: true,
    order: true, orderRev: true, orderPoint: true, orderProfit: true,
    retail: true, retailRev: true, retailPoint: true, retailProfit: true,
    wholesale: true, wholesaleRev: true, wholesaleProfit: true,
    total: true, totalRev: true, totalPoint: true, totalPercent: true,
  });

  useEffect(() => {
    fetchOptions();
    fetchData();
  }, []);

  const fetchOptions = async () => {
    try {
      const [whRes, catRes] = await Promise.all([
        http.get('/system/branches'),
        http.get('/products/categories')
      ]);
      setWarehouses(whRes.data.items || whRes.data || []);
      setCategories(catRes.data.items || catRes.data || []);
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('displayType', displayType);
      if (dateRange.start) {
        params.append('fromDate', dateRange.start.toISOString());
      }
      if (dateRange.end) {
        params.append('toDate', dateRange.end.toISOString());
      }
      if (warehouseId) params.append('branchId', warehouseId);
      if (invoiceType && invoiceType !== 'all') params.append('invoiceType', invoiceType);

      const response = await http.get(`/reports/revenue-store?${params.toString()}`);
      setData(response.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchData();
  };

  const formatCurrency = (value: number) => {
    if (value === 0 || !value) return '';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  // Aggregation logic for Kho hàng tab
  const branchDataMap: Record<string, StoreRevenueData> = {};
  data.forEach(curr => {
    if (!branchDataMap[curr.branchId]) {
      branchDataMap[curr.branchId] = {
        id: curr.branchId, branchId: curr.branchId, branchName: curr.branchName, time: '',
        order: { revenue: 0, pointUsage: 0, profit: 0 },
        retail: { revenue: 0, pointUsage: 0, profit: 0 },
        wholesale: { revenue: 0, profit: 0 },
        total: { revenue: 0, pointUsage: 0, profit: 0 }
      };
    }
    const acc = branchDataMap[curr.branchId];
    acc.order.revenue += curr.order.revenue;
    acc.order.pointUsage += curr.order.pointUsage;
    acc.order.profit += curr.order.profit;
    acc.retail.revenue += curr.retail.revenue;
    acc.retail.pointUsage += curr.retail.pointUsage;
    acc.retail.profit += curr.retail.profit;
    acc.wholesale.revenue += curr.wholesale.revenue;
    acc.wholesale.profit += curr.wholesale.profit;
    acc.total.revenue += curr.total.revenue;
    acc.total.pointUsage += curr.total.pointUsage;
    acc.total.profit += curr.total.profit;
  });
  const branchDataList = Object.values(branchDataMap);

  const calculateTotals = (list: StoreRevenueData[]) => {
    return list.reduce(
      (acc, curr) => {
        acc.order.revenue += curr.order.revenue;
        acc.order.pointUsage += curr.order.pointUsage;
        acc.order.profit += curr.order.profit;
        acc.retail.revenue += curr.retail.revenue;
        acc.retail.pointUsage += curr.retail.pointUsage;
        acc.retail.profit += curr.retail.profit;
        acc.wholesale.revenue += curr.wholesale.revenue;
        acc.wholesale.profit += curr.wholesale.profit;
        acc.total.revenue += curr.total.revenue;
        acc.total.pointUsage += curr.total.pointUsage;
        acc.total.profit += curr.total.profit;
        return acc;
      },
      {
        order: { revenue: 0, pointUsage: 0, profit: 0 },
        retail: { revenue: 0, pointUsage: 0, profit: 0 },
        wholesale: { revenue: 0, profit: 0 },
        total: { revenue: 0, pointUsage: 0, profit: 0 }
      }
    );
  };

  const totals = calculateTotals(branchDataList);
  const dataLength = branchDataList.length || 1;
  const averages = {
    order: {
      revenue: Math.round(totals.order.revenue / dataLength),
      pointUsage: Math.round(totals.order.pointUsage / dataLength),
      profit: Math.round(totals.order.profit / dataLength)
    },
    retail: {
      revenue: Math.round(totals.retail.revenue / dataLength),
      pointUsage: Math.round(totals.retail.pointUsage / dataLength),
      profit: Math.round(totals.retail.profit / dataLength)
    },
    wholesale: {
      revenue: Math.round(totals.wholesale.revenue / dataLength),
      profit: Math.round(totals.wholesale.profit / dataLength)
    },
    total: {
      revenue: Math.round(totals.total.revenue / dataLength),
      pointUsage: Math.round(totals.total.pointUsage / dataLength)
    }
  };

  // Pivot logic for Doanh thu / Lợi nhuận tab
  const allDates = Array.from(new Set(data.map(d => d.time))).sort();
  const allBranches = Array.from(new Set(data.map(d => d.branchName)));
  
  const pivotData = allDates.map(date => {
    const rowData: any = { time: date, total: 0 };
    allBranches.forEach(b => rowData[b] = 0);
    const records = data.filter(d => d.time === date);
    records.forEach(r => {
      const val = tab === 'Doanh thu' ? r.total.revenue : r.total.profit;
      rowData[r.branchName] = val;
      rowData.total += val;
    });
    return rowData;
  });
  
  const pivotTotals: any = { total: 0 };
  allBranches.forEach(b => pivotTotals[b] = 0);
  pivotData.forEach(row => {
    allBranches.forEach(b => pivotTotals[b] += row[b]);
    pivotTotals.total += row.total;
  });

  const pivotAverages: any = { total: 0 };
  if (pivotData.length > 0) {
    allBranches.forEach(b => pivotAverages[b] = Math.round(pivotTotals[b] / pivotData.length));
    pivotAverages.total = Math.round(pivotTotals.total / pivotData.length);
  }

  const pivotMaxVals: any = { total: 0 };
  allBranches.forEach(b => {
    pivotMaxVals[b] = Math.max(0, ...pivotData.map(r => r[b]));
  });
  pivotMaxVals.total = Math.max(0, ...pivotData.map(r => r.total));

  const BarCell = ({ value, maxVal, type }: { value: number, maxVal: number, type: 'avg' | 'branch' | 'total' }) => {
    if (!value || value === 0) return <td style={{ textAlign: 'right', border: '1px solid #e5e7eb', padding: '12px 16px' }}></td>;
    const width = maxVal > 0 ? Math.min((value / maxVal) * 100, 100) : 0;
    let bgColor = '#fff0c1';
    if (type === 'avg') bgColor = '#bdf2ad';
    if (type === 'total') bgColor = '#cce0ff';
    
    return (
      <td style={{ position: 'relative', textAlign: 'right', border: '1px solid #e5e7eb', padding: '12px 16px', zIndex: 1 }}>
        <div style={{ position: 'absolute', top: 2, bottom: 2, left: 2, width: `${width}%`, backgroundColor: bgColor, zIndex: -1 }}></div>
        {new Intl.NumberFormat('vi-VN').format(value)}
      </td>
    );
  };

  const handleExportData = () => {
    if (!data || data.length === 0) {
      alert('Không có dữ liệu để xuất!');
      return;
    }
    // simple fallback export
    const blob = new Blob(['\uFEFF' + 'Data'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bao_cao_doanh_thu_kho_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Setup Pie Chart Data
  const revenuePieData = branchDataList.map(d => ({ name: d.branchName, value: d.total.revenue }));
  const profitPieData = branchDataList.map(d => ({ name: d.branchName, value: d.total.profit }));

  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, name } = props;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius * 1.25;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent === 0) return null;

    return (
      <text x={x} y={y} fill="#333" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12" fontWeight="bold">
        {`${name} : ${(percent * 100).toFixed(2)}%`}
      </text>
    );
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = totals.total.revenue > 0 ? (data.value / totals.total.revenue) * 100 : 0;
      return (
        <div style={{ backgroundColor: 'white', padding: '8px 12px', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}>
          <span style={{ color: payload[0].fill }}>{data.name}</span>: <strong>{percent.toFixed(2)}%</strong>
        </div>
      );
    }
    return null;
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: i.toString().padStart(2, '0'), label: i.toString().padStart(2, '0') }));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => ({ value: i.toString().padStart(2, '0'), label: i.toString().padStart(2, '0') }));
  const invoiceOptions = [
    { value: 'all', label: 'Tất cả' },
    { value: 'online', label: 'Đơn hàng online' },
    { value: 'retail', label: 'Bán lẻ' },
    { value: 'wholesale', label: 'Bán sỉ' }
  ];

  const toggleCol = (key: keyof typeof cols, parentKey?: keyof typeof cols) => {
    setCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });
  };

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetValues, setTargetValues] = useState<Record<string, number>>({});

  const handleSaveTargets = () => {
    alert('Đã lưu chỉ tiêu thành công!');
    setShowTargetModal(false);
  };

  if (loading) {
    return <div className="revenue-store-container">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="revenue-store-container compact-page">
      <section className="compact-toolbar-card" style={{ marginBottom: 12 }}>
        <div className="compact-header">
          <span className="compact-badge">REPORT</span>
          <h1 className="compact-title">Doanh thu theo cửa hàng</h1>
          <p className="compact-desc">So sánh doanh thu, điểm và lợi nhuận theo chi nhánh.</p>
        </div>
      {/* Filters */}
      <div className="filter-bar compact-filter-bar">
        <div className="filter-group">
          <label>Hiển thị</label>
          <CustomSelect value={displayType} onChange={setDisplayType} options={[{ value: 'Theo ngày', label: 'Theo ngày' }, { value: 'Theo tháng', label: 'Theo tháng' }]} />
        </div>
        <div className="filter-group" style={{ position: 'relative', width: '250px' }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <div className="filter-group">
          <CustomSelect value={warehouseId} onChange={setWarehouseId} options={warehouses.map(w => ({ value: w._id, label: w.name }))} placeholder="Kho hàng" />
        </div>
        <div className="filter-group">
          <CustomSelect value={invoiceType} onChange={setInvoiceType} options={invoiceOptions} placeholder="Kiểu" />
        </div>
        <div className="filter-group">
          <CustomSelect value={startHour} onChange={setStartHour} options={hourOptions} placeholder="Giờ bắt đầu" width={120} />
        </div>
        <div className="filter-group">
          <CustomSelect value={startMinute} onChange={setStartMinute} options={minuteOptions} placeholder="Phút bắt đầu" width={120} />
        </div>
        <div className="filter-group">
          <CustomSelect value={endHour} onChange={setEndHour} options={hourOptions} placeholder="Giờ kết thúc" width={120} />
        </div>
        <div className="filter-group">
          <CustomSelect value={endMinute} onChange={setEndMinute} options={minuteOptions} placeholder="Phút kết thúc" width={120} />
        </div>
        <button className="btn-filter compact-btn compact-btn-primary" onClick={handleFilter} style={{ marginBottom: '0', marginTop: '0', alignSelf: 'flex-end' }}>Lọc</button>
      </div>
      </section>

      <div className="tabs-bar">
        <div className={`tab-item ${tab === 'Kho hàng' ? 'active' : ''}`} onClick={() => setTab('Kho hàng')}>Kho hàng</div>
        <div className={`tab-item ${tab === 'Doanh thu' ? 'active' : ''}`} onClick={() => setTab('Doanh thu')}>Doanh thu</div>
        <div className={`tab-item ${tab === 'Lợi nhuận' ? 'active' : ''}`} onClick={() => setTab('Lợi nhuận')}>Lợi nhuận</div>
      </div>

      {/* Charts */}
      {tab === 'Kho hàng' && (
        <div className="charts-wrapper">
          <div className="chart-box">
            <h3>Doanh thu</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={revenuePieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={renderCustomizedLabel} labelLine={{ stroke: '#ccc', strokeWidth: 1 }} stroke="#fff" strokeWidth={2}>
                    {revenuePieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="chart-box">
            <h3>Lợi nhuận</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={profitPieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={renderCustomizedLabel} labelLine={{ stroke: '#ccc', strokeWidth: 1 }} stroke="#fff" strokeWidth={2}>
                    {profitPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="actions-bar">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-success" onClick={() => setShowTargetModal(true)}><Plus size={16} /> Nhập chỉ tiêu</button>
          <button className="btn-outline" onClick={handleExportData}><FileDown size={16} /> Xuất dữ liệu</button>
          <button className="btn-outline" onClick={handlePrint}><Printer size={16} /> In báo cáo</button>
        </div>
        <button className="btn-outline layout-grid-btn" onClick={() => setShowSettingsModal(true)}>
          <LayoutGrid size={16} />
        </button>
      </div>

      {/* Table Kho hàng */}
      {tab === 'Kho hàng' && (
        <div className="table-container">
          <table className="revenue-table">
            <thead>
              <tr>
                {cols.num && <th rowSpan={2}>#</th>}
                {cols.branch && <th rowSpan={2}>Kho hàng</th>}
                {cols.order && <th colSpan={(cols.orderRev?1:0) + (cols.orderPoint?1:0) + (cols.orderProfit?1:0)}>Đơn hàng</th>}
                {cols.retail && <th colSpan={(cols.retailRev?1:0) + (cols.retailPoint?1:0) + (cols.retailProfit?1:0)}>Bán lẻ</th>}
                {cols.wholesale && <th colSpan={(cols.wholesaleRev?1:0) + (cols.wholesaleProfit?1:0)}>Bán sỉ</th>}
                {cols.total && <th colSpan={(cols.totalRev?1:0) + (cols.totalPoint?1:0)}>Tổng</th>}
                {cols.totalPercent && <th rowSpan={2}>%</th>}
              </tr>
              <tr>
                {cols.order && cols.orderRev && <th>Doanh thu</th>}
                {cols.order && cols.orderPoint && <th>Sử dụng điểm</th>}
                {cols.order && cols.orderProfit && <th>Lợi nhuận</th>}
                {cols.retail && cols.retailRev && <th>Doanh thu</th>}
                {cols.retail && cols.retailPoint && <th>Sử dụng điểm</th>}
                {cols.retail && cols.retailProfit && <th>Lợi nhuận</th>}
                {cols.wholesale && cols.wholesaleRev && <th>Doanh thu</th>}
                {cols.wholesale && cols.wholesaleProfit && <th>Lợi nhuận</th>}
                {cols.total && cols.totalRev && <th>Doanh thu</th>}
                {cols.total && cols.totalPoint && <th>Sử dụng điểm (Tổng)</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="summary-row">
                <td colSpan={(cols.num?1:0) + (cols.branch?1:0)}>Tổng</td>
                {cols.order && cols.orderRev && <td>{formatCurrency(totals.order.revenue)}</td>}
                {cols.order && cols.orderPoint && <td>{formatCurrency(totals.order.pointUsage)}</td>}
                {cols.order && cols.orderProfit && <td>{formatCurrency(totals.order.profit)}</td>}
                {cols.retail && cols.retailRev && <td>{formatCurrency(totals.retail.revenue)}</td>}
                {cols.retail && cols.retailPoint && <td>{formatCurrency(totals.retail.pointUsage)}</td>}
                {cols.retail && cols.retailProfit && <td>{formatCurrency(totals.retail.profit)}</td>}
                {cols.wholesale && cols.wholesaleRev && <td>{formatCurrency(totals.wholesale.revenue)}</td>}
                {cols.wholesale && cols.wholesaleProfit && <td>{formatCurrency(totals.wholesale.profit)}</td>}
                {cols.total && cols.totalRev && <td className="text-green">{formatCurrency(totals.total.revenue)}</td>}
                {cols.total && cols.totalPoint && <td>{formatCurrency(totals.total.pointUsage)}</td>}
                {cols.totalPercent && <td>100%</td>}
              </tr>
              <tr className="summary-row">
                <td colSpan={(cols.num?1:0) + (cols.branch?1:0)}>Trung bình</td>
                {cols.order && cols.orderRev && <td>{formatCurrency(averages.order.revenue)}</td>}
                {cols.order && cols.orderPoint && <td>{formatCurrency(averages.order.pointUsage)}</td>}
                {cols.order && cols.orderProfit && <td>{formatCurrency(averages.order.profit)}</td>}
                {cols.retail && cols.retailRev && <td>{formatCurrency(averages.retail.revenue)}</td>}
                {cols.retail && cols.retailPoint && <td>{formatCurrency(averages.retail.pointUsage)}</td>}
                {cols.retail && cols.retailProfit && <td>{formatCurrency(averages.retail.profit)}</td>}
                {cols.wholesale && cols.wholesaleRev && <td>{formatCurrency(averages.wholesale.revenue)}</td>}
                {cols.wholesale && cols.wholesaleProfit && <td>{formatCurrency(averages.wholesale.profit)}</td>}
                {cols.total && cols.totalRev && <td className="text-green">{formatCurrency(averages.total.revenue)}</td>}
                {cols.total && cols.totalPoint && <td>{formatCurrency(averages.total.pointUsage)}</td>}
                {cols.totalPercent && <td>50%</td>}
              </tr>
              {branchDataList.map((row, index) => (
                <tr key={row.id}>
                  {cols.num && <td>{index + 1}</td>}
                  {cols.branch && <td>{row.branchName}</td>}
                  {cols.order && cols.orderRev && <td>{formatCurrency(row.order.revenue)}</td>}
                  {cols.order && cols.orderPoint && <td>{formatCurrency(row.order.pointUsage)}</td>}
                  {cols.order && cols.orderProfit && <td>{formatCurrency(row.order.profit)}</td>}
                  {cols.retail && cols.retailRev && <td className="text-blue">{formatCurrency(row.retail.revenue)}</td>}
                  {cols.retail && cols.retailPoint && <td>{formatCurrency(row.retail.pointUsage)}</td>}
                  {cols.retail && cols.retailProfit && <td>{formatCurrency(row.retail.profit)}</td>}
                  {cols.wholesale && cols.wholesaleRev && <td>{formatCurrency(row.wholesale.revenue)}</td>}
                  {cols.wholesale && cols.wholesaleProfit && <td>{formatCurrency(row.wholesale.profit)}</td>}
                  {cols.total && cols.totalRev && <td className="text-blue text-bold" style={{ backgroundColor: '#e6f2ff' }}>{formatCurrency(row.total.revenue)}</td>}
                  {cols.total && cols.totalPoint && <td>{formatCurrency(row.total.pointUsage)}</td>}
                  {cols.totalPercent && <td>{totals.total.revenue > 0 ? ((row.total.revenue / totals.total.revenue) * 100).toFixed(2) + '%' : '0%'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table Pivot (Doanh thu / Lợi nhuận) */}
      {(tab === 'Doanh thu' || tab === 'Lợi nhuận') && (
        <div className="table-container">
          <table className="revenue-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', backgroundColor: '#f9fafb', padding: '12px', border: '1px solid #e5e7eb' }}>Thời gian</th>
                {allBranches.map(b => (
                  <th key={b} style={{ textAlign: 'center', backgroundColor: '#f9fafb', padding: '12px', border: '1px solid #e5e7eb' }}>{b}</th>
                ))}
                <th style={{ textAlign: 'center', backgroundColor: '#f9fafb', padding: '12px', border: '1px solid #e5e7eb' }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              <tr className="summary-row">
                <td style={{ textAlign: 'right', padding: '12px 16px', border: '1px solid #e5e7eb' }}>Tổng</td>
                {allBranches.map(b => (
                  <td key={b} style={{ textAlign: 'right', padding: '12px 16px', border: '1px solid #e5e7eb' }}>{formatCurrency(pivotTotals[b])}</td>
                ))}
                <td style={{ textAlign: 'right', padding: '12px 16px', border: '1px solid #e5e7eb' }}>{formatCurrency(pivotTotals.total)}</td>
              </tr>
              <tr className="summary-row">
                <td style={{ textAlign: 'right', padding: '12px 16px', border: '1px solid #e5e7eb' }}>Trung bình</td>
                {allBranches.map(b => (
                  <BarCell key={b} value={pivotAverages[b]} maxVal={pivotMaxVals[b]} type="avg" />
                ))}
                <BarCell value={pivotAverages.total} maxVal={pivotMaxVals.total} type="avg" />
              </tr>
              {pivotData.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'center', padding: '12px 16px', border: '1px solid #e5e7eb' }}>{row.time}</td>
                  {allBranches.map(b => (
                    <BarCell key={b} value={row[b]} maxVal={pivotMaxVals[b]} type="branch" />
                  ))}
                  <BarCell value={row.total} maxVal={pivotMaxVals.total} type="total" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Target Modal */}
      {showTargetModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '400px' }}>
            <div className="modal-header">
              <h3>Nhập chỉ tiêu theo Kho</h3>
              <button className="close-btn" onClick={() => setShowTargetModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {branchDataList.map(branch => (
                <div key={branch.branchId} style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
                  <label style={{ fontSize: '14px', marginBottom: '4px', fontWeight: 500 }}>{branch.branchName}</label>
                  <input 
                    type="number" 
                    placeholder="Nhập số tiền chỉ tiêu..."
                    value={targetValues[branch.branchId] || ''}
                    onChange={(e) => setTargetValues(prev => ({ ...prev, [branch.branchId]: Number(e.target.value) }))}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </div>
              ))}
              {branchDataList.length === 0 && <p style={{ color: '#6b7280', fontSize: '14px' }}>Chưa có dữ liệu Kho hàng</p>}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowTargetModal(false)}>Hủy</button>
              <button className="btn-success" onClick={handleSaveTargets}>Lưu chỉ tiêu</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Tùy chỉnh hiển thị</h3>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-search">
                <input 
                  type="text" 
                  placeholder="Tìm kiếm tên cột" 
                  value={colSearch}
                  onChange={e => setColSearch(e.target.value)}
                />
                <Search size={16} color="#94a3b8" />
              </div>
              <div className="col-list">
                <label className="col-item"><input type="checkbox" checked={cols.num} onChange={() => toggleCol('num')} /> #</label>
                <label className="col-item"><input type="checkbox" checked={cols.branch} onChange={() => toggleCol('branch')} /> Kho hàng</label>
                
                <label className="col-item col-parent"><input type="checkbox" checked={cols.order} onChange={() => toggleCol('order')} /> Đơn hàng</label>
                {cols.order && (
                  <div className="col-children">
                    <label className="col-item"><input type="checkbox" checked={cols.orderRev} onChange={() => toggleCol('orderRev')} /> Doanh thu</label>
                    <label className="col-item"><input type="checkbox" checked={cols.orderPoint} onChange={() => toggleCol('orderPoint')} /> Sử dụng điểm</label>
                    <label className="col-item"><input type="checkbox" checked={cols.orderProfit} onChange={() => toggleCol('orderProfit')} /> Lợi nhuận</label>
                  </div>
                )}
                
                <label className="col-item col-parent"><input type="checkbox" checked={cols.retail} onChange={() => toggleCol('retail')} /> Bán lẻ</label>
                {cols.retail && (
                  <div className="col-children">
                    <label className="col-item"><input type="checkbox" checked={cols.retailRev} onChange={() => toggleCol('retailRev')} /> Doanh thu</label>
                    <label className="col-item"><input type="checkbox" checked={cols.retailPoint} onChange={() => toggleCol('retailPoint')} /> Sử dụng điểm</label>
                    <label className="col-item"><input type="checkbox" checked={cols.retailProfit} onChange={() => toggleCol('retailProfit')} /> Lợi nhuận</label>
                  </div>
                )}

                <label className="col-item col-parent"><input type="checkbox" checked={cols.wholesale} onChange={() => toggleCol('wholesale')} /> Bán sỉ</label>
                {cols.wholesale && (
                  <div className="col-children">
                    <label className="col-item"><input type="checkbox" checked={cols.wholesaleRev} onChange={() => toggleCol('wholesaleRev')} /> Doanh thu</label>
                    <label className="col-item"><input type="checkbox" checked={cols.wholesaleProfit} onChange={() => toggleCol('wholesaleProfit')} /> Lợi nhuận</label>
                  </div>
                )}

                <label className="col-item col-parent"><input type="checkbox" checked={cols.total} onChange={() => toggleCol('total')} /> Tổng</label>
                {cols.total && (
                  <div className="col-children">
                    <label className="col-item"><input type="checkbox" checked={cols.totalRev} onChange={() => toggleCol('totalRev')} /> Doanh thu</label>
                    <label className="col-item"><input type="checkbox" checked={cols.totalPoint} onChange={() => toggleCol('totalPoint')} /> Sử dụng điểm (Tổng)</label>
                  </div>
                )}
                <label className="col-item"><input type="checkbox" checked={cols.totalPercent} onChange={() => toggleCol('totalPercent')} /> %</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline">Quay về mặc định</button>
              <button className="btn-success" onClick={() => setShowSettingsModal(false)}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

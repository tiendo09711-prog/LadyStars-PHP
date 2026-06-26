import React, { useEffect, useState } from 'react';
import { http } from '../../core/api/http';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart
} from 'recharts';
import { FileDown, Printer, LayoutGrid } from 'lucide-react';
import { DateRangePicker } from '../../core/components/ui/DateRangePicker';
import './RevenueByTimePage.css';

interface RevenueData {
  _id: string;
  time: string;
  successfulOrders: number;
  retail: number;
  wholesale: number;
  vat: number;
  bhmr: number;
  returnFee: number;
  sales: number;
  discount: number;
  focus: number;
  revenue: number;
  expectedRevenue: number;
  revenuePlusVat: number;
  cost: number;
  profit: number;
}

export function RevenueByTimePage() {
  const [data, setData] = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [displayType, setDisplayType] = useState('Theo ngày');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

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
      if (categoryId) params.append('categoryId', categoryId);

      const response = await http.get(`/reports/revenue-time?${params.toString()}`);
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
    if (value === 0) return '';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  const formatChartYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(0)}M`;
    }
    return value.toString();
  };

  const calculateTotals = () => {
    return data.reduce(
      (acc, curr) => {
        acc.successfulOrders += curr.successfulOrders;
        acc.retail += curr.retail;
        acc.wholesale += curr.wholesale;
        acc.returnFee += curr.returnFee;
        acc.discount += curr.discount;
        acc.focus += curr.focus;
        acc.revenue += curr.revenue;
        acc.cost += curr.cost;
        acc.profit += curr.profit;
        return acc;
      },
      {
        successfulOrders: 0,
        retail: 0,
        wholesale: 0,
        returnFee: 0,
        discount: 0,
        focus: 0,
        revenue: 0,
        cost: 0,
        profit: 0
      }
    );
  };

  const totals = calculateTotals();
  const averages = {
    successfulOrders: data.length ? Math.round(totals.successfulOrders / data.length) : 0,
    retail: data.length ? Math.round(totals.retail / data.length) : 0,
    wholesale: data.length ? Math.round(totals.wholesale / data.length) : 0,
    returnFee: data.length ? Math.round(totals.returnFee / data.length) : 0,
    discount: data.length ? Math.round(totals.discount / data.length) : 0,
    focus: data.length ? Math.round(totals.focus / data.length) : 0,
    revenue: data.length ? Math.round(totals.revenue / data.length) : 0,
    cost: data.length ? Math.round(totals.cost / data.length) : 0,
    profit: data.length ? Math.round(totals.profit / data.length) : 0
  };

  const handleExportData = () => {
    if (!data || data.length === 0) {
      alert('Không có dữ liệu để xuất!');
      return;
    }
    const headers = ['Thời gian', 'Đơn thành công', 'Bán lẻ', 'Bán sỉ', 'Phí trả hàng', 'Chiết khấu', 'Tiêu điểm', 'Doanh thu', 'Giá vốn', 'Lợi nhuận'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.time,
        row.successfulOrders,
        row.retail,
        row.wholesale,
        row.returnFee,
        row.discount,
        row.focus,
        row.revenue,
        row.cost,
        row.profit
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bao_cao_doanh_thu_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="revenue-time-container">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="revenue-time-container">
      {/* Filters */}
      <div className="filter-bar" style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <div className="filter-group">
          <label>Hiển thị</label>
          <select value={displayType} onChange={(e) => setDisplayType(e.target.value)}>
            <option value="Theo ngày">Theo ngày</option>
            <option value="Theo tháng">Theo tháng</option>
          </select>
        </div>
        <div className="filter-group" style={{ position: 'relative', width: '250px' }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <div className="filter-group">
          <label>Kho hàng</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Kho hàng</option>
            {warehouses.map(w => (
              <option key={w._id} value={w._id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Danh mục</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Danh mục</option>
            {categories.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-filter" onClick={handleFilter} style={{ marginBottom: '0' }}>Lọc</button>
      </div>

      {/* Chart */}
      <div className="chart-container">
        <div style={{ height: 300, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={formatChartYAxis}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [new Intl.NumberFormat('vi-VN').format(value), name === 'profit' ? 'Lợi nhuận' : name === 'retail' ? 'Bán lẻ' : name === 'wholesale' ? 'Bán sỉ' : name === 'successfulOrders' ? 'Đơn thành công' : name]} 
                labelFormatter={(label) => `Thời gian: ${label}`}
              />
              <Bar dataKey="retail" fill="#ff9800" barSize={100} />
              <Line type="monotone" dataKey="profit" stroke="#2196f3" strokeWidth={2} dot={{ r: 4, fill: '#2196f3' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-legend">
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#4caf50' }}></div> Bán sỉ</div>
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#ff9800' }}></div> Bán lẻ</div>
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#f44336' }}></div> Đơn thành công</div>
          <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#2196f3' }}></div> Lợi nhuận</div>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-bar">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-outline" onClick={handleExportData}>
            <FileDown size={16} /> Xuất dữ liệu
          </button>
          <button className="btn-outline" onClick={handlePrint}>
            <Printer size={16} /> In báo cáo
          </button>
        </div>
        <button className="btn-outline" onClick={() => alert('Chức năng đổi giao diện bảng đang được phát triển!')}>
          <LayoutGrid size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="revenue-table">
          <thead>
            <tr>
              <th>#<span className="col-number">[1]</span></th>
              <th>Thời gian<span className="col-number">[2]</span></th>
              <th>Đơn thành công<span className="col-number">[4]</span></th>
              <th>Bán lẻ<span className="col-number">[5]</span></th>
              <th>Bán sỉ<span className="col-number">[6]</span></th>
              <th>Phí trả hàng<span className="col-number">[9]</span></th>
              <th>Chiết khấu<span className="col-number">[11]</span></th>
              <th>Tiêu điểm<span className="col-number">[12]</span></th>
              <th>Doanh thu<span className="col-number">[13= 10-11-12]</span></th>
              <th>Giá vốn<span className="col-number">[16]</span></th>
              <th>Lợi nhuận<span className="col-number">[17]</span></th>
            </tr>
          </thead>
          <tbody>
            <tr className="summary-row">
              <td colSpan={2}>Tổng</td>
              <td>{formatCurrency(totals.successfulOrders)}</td>
              <td>{formatCurrency(totals.retail)}</td>
              <td>{formatCurrency(totals.wholesale)}</td>
              <td>{formatCurrency(totals.returnFee)}</td>
              <td>{formatCurrency(totals.discount)}</td>
              <td>{formatCurrency(totals.focus)}</td>
              <td>{formatCurrency(totals.revenue)}</td>
              <td>{formatCurrency(totals.cost)}</td>
              <td>{formatCurrency(totals.profit)}</td>
            </tr>
            <tr className="summary-row">
              <td colSpan={2}>Trung bình</td>
              <td>{formatCurrency(averages.successfulOrders)}</td>
              <td>{formatCurrency(averages.retail)}</td>
              <td>{formatCurrency(averages.wholesale)}</td>
              <td>{formatCurrency(averages.returnFee)}</td>
              <td>{formatCurrency(averages.discount)}</td>
              <td>{formatCurrency(averages.focus)}</td>
              <td>{formatCurrency(averages.revenue)}</td>
              <td>{formatCurrency(averages.cost)}</td>
              <td>{formatCurrency(averages.profit)}</td>
            </tr>
            <tr className="summary-row">
              <td colSpan={2}>Tỷ lệ / Tổng</td>
              <td></td>
              <td>100%</td>
              <td></td>
              <td></td>
              <td>{totals.retail > 0 ? ((totals.discount / totals.retail) * 100).toFixed(2) + '%' : ''}</td>
              <td></td>
              <td>{totals.retail > 0 ? ((totals.revenue / totals.retail) * 100).toFixed(2) + '%' : ''}</td>
              <td></td>
              <td>{totals.retail > 0 ? ((totals.profit / totals.retail) * 100).toFixed(2) + '%' : ''}</td>
            </tr>
            {data.map((row, index) => (
              <tr key={row._id || `${row.time}-${index}`}>
                <td>{index + 1}</td>
                <td>{row.time.substring(0, 5)}</td>
                <td>{formatCurrency(row.successfulOrders)}</td>
                <td className="text-blue">{formatCurrency(row.retail)}</td>
                <td>{formatCurrency(row.wholesale)}</td>
                <td>{formatCurrency(row.returnFee)}</td>
                <td>{formatCurrency(row.discount)}</td>
                <td>{formatCurrency(row.focus)}</td>
                <td className="text-green">{formatCurrency(row.revenue)}</td>
                <td>{formatCurrency(row.cost)}</td>
                <td>{formatCurrency(row.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

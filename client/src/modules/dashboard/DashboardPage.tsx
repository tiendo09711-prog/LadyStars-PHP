import { useEffect, useState } from 'react';
import { AlertCircle, Boxes, Building2, ClipboardList, Receipt, TrendingUp, Users, Wallet } from 'lucide-react';
import { http } from '../../core/api/http';

type DashboardData = {
  totals: Record<string, number>;
  recentSales: { _id: string; code: string; value: number; status: string; createdAt: string }[];
  recentProducts: { _id: string; code: string; name: string; price: number; qty: number; unit?: string; type: string }[];
};

const money = (value: number) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    http.get('/dashboard').then((response) => setData(response.data));
  }, []);

  const totals = data?.totals ?? {};
  const stats = [
    { label: 'Doanh thu', value: money(totals.revenue), icon: <TrendingUp size={22} />, tone: 'primary' },
    { label: 'Phiếu bán', value: totals.sales ?? 0, icon: <Receipt size={22} />, tone: 'success' },
    { label: 'Hàng hóa', value: totals.products ?? 0, icon: <Boxes size={22} />, tone: 'neutral' },
    { label: 'Sắp hết tồn', value: totals.lowStock ?? 0, icon: <AlertCircle size={22} />, tone: 'warning' },
    { label: 'Khách hàng', value: totals.customers ?? 0, icon: <Users size={22} />, tone: 'primary' },
    { label: 'Nhà cung cấp', value: totals.vendors ?? 0, icon: <Building2 size={22} />, tone: 'neutral' },
    { label: 'Công việc', value: totals.tasks ?? 0, icon: <ClipboardList size={22} />, tone: 'success' },
    { label: 'Lợi nhuận mẫu', value: money(totals.profit), icon: <Wallet size={22} />, tone: 'primary' },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><TrendingUp size={24} /></div>
          <div>
            <h1>Dashboard</h1>
            <p>Tổng quan vận hành theo phong cách Polirium ERP</p>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {stats.map((stat) => (
          <div className={`dashboard-stat ${stat.tone}`} key={stat.label}>
            <div className="dashboard-stat-icon">{stat.icon}</div>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-columns">
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Đơn bán gần đây</h2>
              <span className="record-badge">{data?.recentSales?.length ?? 0} bản ghi</span>
            </div>
          </div>
          <table className="data-table compact">
            <tbody>
              {(data?.recentSales ?? []).map((sale) => (
                <tr key={sale._id}>
                  <td><strong>{sale.code}</strong></td>
                  <td>{money(sale.value)}</td>
                  <td><span className="status-badge warning">{sale.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Hàng hóa mới</h2>
              <span className="record-badge">{data?.recentProducts?.length ?? 0} bản ghi</span>
            </div>
          </div>
          <table className="data-table compact">
            <tbody>
              {(data?.recentProducts ?? []).map((product) => (
                <tr key={product._id}>
                  <td><strong>{product.name}</strong><small>{product.code}</small></td>
                  <td>{money(product.price)}</td>
                  <td>{product.qty} {product.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

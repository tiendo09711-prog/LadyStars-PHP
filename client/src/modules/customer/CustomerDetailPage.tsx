import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, PackageCheck, RefreshCcw, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import './customer-list-page.css';

type CustomerDetail = {
  _id: string;
  code?: string;
  name?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  birthday?: string;
  cardId?: string;
  customerLevel?: string;
  address?: string;
  addressLocation?: string;
  type?: string;
  groups?: Array<{ _id: string; name: string }>;
  groupNames?: string[];
};

type ActivityItem = {
  productId?: string;
  code?: string;
  name?: string;
  quantity?: number;
  price?: number;
  total?: number;
};

type CustomerActivity = {
  _id: string;
  code?: string;
  status?: string;
  type?: string;
  date?: string | null;
  value?: number;
  quantity?: number;
  note?: string;
  items?: ActivityItem[];
};

type DetailResponse = {
  customer: CustomerDetail;
  summary: {
    purchaseCount: number;
    returnCount: number;
    warrantyCount: number;
    totalPurchased: number;
    totalReturned: number;
    productQuantityPurchased: number;
    productQuantityReturned: number;
  };
  purchases: CustomerActivity[];
  returns: CustomerActivity[];
  warranties: CustomerActivity[];
};

function formatMoney(value?: number | null) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return '?';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '?';
  return date.toLocaleDateString('vi-VN');
}

function activityProducts(activity: CustomerActivity) {
  const items = activity.items || [];
  if (!items.length) return '?';
  return items.map((item) => `${item.name || item.code || 'S?n ph?m'} x${item.quantity || 0}`).join(', ');
}

function ActivityTable({ title, rows, emptyText }: { title: string; rows: CustomerActivity[]; emptyText: string }) {
  return (
    <section className="customer-table-card customer-detail-section">
      <div className="customer-table-header">
        <div>
          <h2>{title}</h2>
          <p>Hi?n th? t?i ?a 100 giao d?ch g?n nh?t li?n quan ??n kh?ch h?ng.</p>
        </div>
      </div>
      <div className="customer-table-scroll">
        <table className="customer-table customer-detail-table">
          <thead>
            <tr>
              <th>M? phi?u</th>
              <th>Ng?y</th>
              <th>S?n ph?m</th>
              <th>SL</th>
              <th className="align-right">Gi? tr?</th>
              <th>Tr?ng th?i</th>
              <th>Ghi ch?</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="customer-empty-cell">{emptyText}</td></tr>
            ) : rows.map((row) => (
              <tr key={row._id}>
                <td>{row.code || '?'}</td>
                <td>{formatDate(row.date)}</td>
                <td>{activityProducts(row)}</td>
                <td>{row.quantity || 0}</td>
                <td className="align-right">{formatMoney(row.value)} ?</td>
                <td>{row.status || '?'}</td>
                <td>{row.note || '?'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    const loadDetail = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await http.get<DetailResponse>(`/customers/customers/${id}/detail`);
        if (!ignore) setData(response.data);
      } catch (err: any) {
        if (!ignore) setError(err.response?.data?.message || 'Kh?ng t?i ???c chi ti?t kh?ch h?ng.');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    if (id) void loadDetail();
    return () => { ignore = true; };
  }, [id]);

  const customer = data?.customer;
  const groupText = useMemo(() => {
    if (!customer) return '?';
    if (customer.groupNames?.length) return customer.groupNames.join(', ');
    if (customer.groups?.length) return customer.groups.map((group) => group.name).join(', ');
    return '?';
  }, [customer]);

  if (loading) return <div className="customer-page"><section className="customer-table-card customer-detail-loading">?ang t?i chi ti?t kh?ch h?ng...</section></div>;
  if (error || !data || !customer) return <div className="customer-page"><section className="customer-table-card customer-detail-loading">{error || 'Kh?ng t?m th?y kh?ch h?ng.'}</section></div>;

  return (
    <div className="customer-page customer-detail-page">
      <div className="customer-detail-header">
        <Link className="secondary-button" to="/customers/list"><ArrowLeft size={16} /> Quay l?i danh s?ch</Link>
        <div>
          <h1>{customer.name || 'Kh?ch h?ng'}</h1>
          <p>{customer.code || '?'} ? {customer.phone || 'Ch?a c? S?T'}</p>
        </div>
      </div>

      <section className="customer-detail-hero">
        <div className="customer-detail-profile">
          <span className="customer-detail-avatar"><UserRound size={28} /></span>
          <div>
            <h2>{customer.name || '?'}</h2>
            <p>{customer.type === 'company' ? 'C?ng ty' : 'C? nh?n'} ? {customer.customerLevel || 'Ch?a c? c?p ??'}</p>
          </div>
        </div>
        <div className="customer-detail-info-grid">
          <div><span>S? ?i?n tho?i</span><strong>{customer.phone || '?'}</strong></div>
          <div><span>Email</span><strong>{customer.email || '?'}</strong></div>
          <div><span>M? th?</span><strong>{customer.cardId || '?'}</strong></div>
          <div><span>Nh?m</span><strong>{groupText}</strong></div>
          <div><span>Khu v?c</span><strong>{customer.addressLocation || '?'}</strong></div>
          <div><span>??a ch?</span><strong>{customer.address || '?'}</strong></div>
        </div>
      </section>

      <section className="customer-detail-stats">
        <div><ShoppingBag size={18} /><span>S?n ph?m ?? mua</span><strong>{data.summary.productQuantityPurchased}</strong><small>{formatMoney(data.summary.totalPurchased)} ?</small></div>
        <div><RefreshCcw size={18} /><span>S?n ph?m ?? tr?</span><strong>{data.summary.productQuantityReturned}</strong><small>{formatMoney(data.summary.totalReturned)} ?</small></div>
        <div><PackageCheck size={18} /><span>??n mua</span><strong>{data.summary.purchaseCount}</strong><small>h?a ??n</small></div>
        <div><ShieldCheck size={18} /><span>B?o h?nh</span><strong>{data.summary.warrantyCount}</strong><small>phi?u li?n quan</small></div>
      </section>

      <ActivityTable title="S?n ph?m kh?ch mua" rows={data.purchases} emptyText="Ch?a c? d? li?u mua h?ng cho kh?ch n?y." />
      <ActivityTable title="Kh?ch tr? h?ng" rows={data.returns} emptyText="Ch?a c? d? li?u tr? h?ng cho kh?ch n?y." />
      <ActivityTable title="Kh?ch b?o h?nh" rows={data.warranties} emptyText="Ch?a c? phi?u tr? h?ng/b?o h?nh li?n quan." />
    </div>
  );
}

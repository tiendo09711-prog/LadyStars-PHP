import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, HeartHandshake, PackageCheck, RefreshCcw, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react';
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
  return items.map((item) => `${item.name || item.code || 'Sản phẩm'} x${item.quantity || 0}`).join(', ');
}

function ActivityTable({ title, rows, emptyText }: { title: string; rows: CustomerActivity[]; emptyText: string }) {
  return (
    <div className="data-card customer-activity-card">
      <div className="data-card-header">
        <div>
          <h2>{title}</h2>
          <p className="card-subtitle">Hiển thị tối đa 100 giao dịch gần nhất liên quan đến khách hàng.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table customer-detail-table">
          <thead>
            <tr>
              <th>Mã phiếu</th>
              <th>Ngày</th>
              <th>Sản phẩm</th>
              <th>SL</th>
              <th className="align-right">Giá trị</th>
              <th>Trạng thái</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="empty-cell">{emptyText}</td></tr>
            ) : rows.map((row) => (
              <tr key={row._id}>
                <td>{row.code || '?'}</td>
                <td>{formatDate(row.date)}</td>
                <td>{activityProducts(row)}</td>
                <td>{row.quantity || 0}</td>
                <td className="align-right">{formatMoney(row.value)} đ</td>
                <td>{row.status || '?'}</td>
                <td>{row.note || '?'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
        if (!ignore) setError(err.response?.data?.message || 'Không tải được chi tiết khách hàng.');
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

  if (loading) {
    return (
      <div className="customer-page customer-detail-page">
        <div className="data-card customer-detail-loading">
          Đang tải chi tiết khách hàng...
        </div>
      </div>
    );
  }
  if (error || !data || !customer) {
    return (
      <div className="customer-page customer-detail-page">
        <div className="data-card customer-detail-loading error">
          {error || 'Không tìm thấy khách hàng.'}
        </div>
      </div>
    );
  }

  return (
    <div className="customer-page customer-detail-page">
      {/* Header */}
      <div className="customer-detail-header">
        <Link to="/customers/list" className="btn btn-outline">
          <ArrowLeft size={16} /> Quay lại danh sách
        </Link>
        <Link
          to={`/customers/care?customerId=${encodeURIComponent(customer._id || '')}&customerCode=${encodeURIComponent(customer.code || '')}&customerName=${encodeURIComponent(customer.name || '')}&customerPhone=${encodeURIComponent(customer.phone || '')}`}
          className="btn btn-outline"
        >
          <HeartHandshake size={16} /> Ghi phiếu chăm sóc
        </Link>
        <div className="customer-detail-title">
          <h1>{customer.name || 'Khách hàng'}</h1>
          <p className="subtitle">{customer.code || '?'} • {customer.phone || 'Chưa có SĐT'}</p>
        </div>
      </div>

      {/* Profile + Info Card */}
      <div className="data-card customer-detail-hero">
        <div className="customer-detail-profile">
          <div className="customer-detail-avatar">
            <UserRound size={28} />
          </div>
          <div className="customer-detail-profile-text">
            <h2>{customer.name || '?'}</h2>
            <div className="customer-type-badge">
              <span className="type-pill">{customer.type === 'company' ? 'Công ty' : 'Cá nhân'}</span>
              <span className="level-pill">{customer.customerLevel || 'Chưa có cấp độ'}</span>
            </div>
          </div>
        </div>

        <div className="customer-detail-info-grid">
          <div className="info-item">
            <span className="info-label">Số điện thoại</span>
            <strong>{customer.phone || '?'}</strong>
          </div>
          <div className="info-item">
            <span className="info-label">Email</span>
            <strong>{customer.email || '?'}</strong>
          </div>
          <div className="info-item">
            <span className="info-label">Mã thẻ</span>
            <strong>{customer.cardId || '?'}</strong>
          </div>
          <div className="info-item">
            <span className="info-label">Nhóm</span>
            <strong>{groupText}</strong>
          </div>
          <div className="info-item">
            <span className="info-label">Khu vực</span>
            <strong>{customer.addressLocation || '?'}</strong>
          </div>
          <div className="info-item">
            <span className="info-label">Địa chỉ</span>
            <strong>{customer.address || '?'}</strong>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="customer-detail-stats">
        <div className="stat-card">
          <div className="stat-icon purchase"><ShoppingBag size={18} /></div>
          <div className="stat-body">
            <span className="stat-label">Sản phẩm đã mua</span>
            <strong className="stat-value">{data.summary.productQuantityPurchased}</strong>
            <small className="stat-sub">{formatMoney(data.summary.totalPurchased)} đ</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon return"><RefreshCcw size={18} /></div>
          <div className="stat-body">
            <span className="stat-label">Sản phẩm đã trả</span>
            <strong className="stat-value">{data.summary.productQuantityReturned}</strong>
            <small className="stat-sub">{formatMoney(data.summary.totalReturned)} đ</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon order"><PackageCheck size={18} /></div>
          <div className="stat-body">
            <span className="stat-label">Đơn mua</span>
            <strong className="stat-value">{data.summary.purchaseCount}</strong>
            <small className="stat-sub">hóa đơn</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warranty"><ShieldCheck size={18} /></div>
          <div className="stat-body">
            <span className="stat-label">Bảo hành</span>
            <strong className="stat-value">{data.summary.warrantyCount}</strong>
            <small className="stat-sub">phiếu liên quan</small>
          </div>
        </div>
      </div>

      {/* Activity Tables */}
      <ActivityTable title="Sản phẩm khách mua" rows={data.purchases} emptyText="Chưa có dữ liệu mua hàng cho khách này." />
      <ActivityTable title="Khách trả hàng" rows={data.returns} emptyText="Chưa có dữ liệu trả hàng cho khách này." />
      <ActivityTable title="Khách bảo hành" rows={data.warranties} emptyText="Chưa có phiếu trả hàng/bảo hành liên quan." />
    </div>
  );
}

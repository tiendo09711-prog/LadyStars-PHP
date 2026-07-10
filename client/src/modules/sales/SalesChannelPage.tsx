import { useNavigate, useParams } from 'react-router-dom';
import {
  Search, ShoppingCart, ShoppingBag, RotateCcw,
  Store, Music2, Globe, Facebook, WalletCards, ArrowRight,
} from 'lucide-react';
import './sales-channel-page.css';

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  store:         { label: 'Cửa hàng',            icon: <Store size={28} />,        color: '#10b981', bg: '#ecfdf5' },
  shopee:        { label: 'Shopee',              icon: <ShoppingBag size={28} />,  color: '#ea580c', bg: '#fff7ed' },
  tiktok:        { label: 'TikTok',              icon: <Music2 size={28} />,       color: '#0f172a', bg: '#f8fafc' },
  lazada:        { label: 'Lazada',              icon: <Globe size={28} />,        color: '#10b981', bg: '#ecfdf5' },
  tiki:          { label: 'Tiki',                icon: <ShoppingCart size={28} />, color: '#059669', bg: '#f0f9ff' },
  facebook:      { label: 'Facebook Shop',       icon: <Facebook size={28} />,     color: '#059669', bg: '#ecfdf5' },
  'ecom-finance':{ label: 'Tài chính sàn TMDT',  icon: <WalletCards size={28} />,  color: '#059669', bg: '#ecfdf5' },
};

const ACTIONS = [
  { key: 'find',      label: 'Tìm hóa đơn', desc: 'Tra cứu, tìm kiếm hóa đơn theo nhiều tiêu chí', icon: <Search size={26} />,        color: '#10b981', bg: '#ecfdf5' },
  { key: 'retail',    label: 'Bán lẻ',      desc: 'Tạo đơn bán lẻ trực tiếp cho khách hàng',        icon: <ShoppingCart size={26} />,  color: '#059669', bg: '#ecfdf5' },
  { key: 'wholesale', label: 'Bán sỉ',      desc: 'Tạo đơn bán sỉ với giá đặc biệt theo số lượng', icon: <ShoppingBag size={26} />,   color: '#10b981', bg: '#ecfdf5' },
  { key: 'refund',    label: 'Trả hàng',    desc: 'Xử lý đơn trả hàng, hoàn tiền khách hàng',      icon: <RotateCcw size={26} />,     color: '#dc2626', bg: '#fef2f2' },
];

const METRICS = [
  { label: 'Đơn hôm nay', value: '—', tone: 'primary' as const },
  { label: 'Doanh thu hôm nay', value: '—', tone: 'success' as const },
  { label: 'Đơn chờ xử lý', value: '—', tone: 'warning' as const },
  { label: 'Trả hàng', value: '—', tone: 'danger' as const },
];

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

export function SalesChannelPage() {
  const { channel = 'store' } = useParams<{ channel: string }>();
  const navigate = useNavigate();
  const meta = CHANNEL_META[channel] ?? CHANNEL_META['store'];

  const pageStyle = {
    '--sc-accent': meta.color,
    '--sc-accent-rgb': hexToRgb(meta.color),
    '--sc-accent-soft': meta.bg,
  } as React.CSSProperties;

  return (
    <div className="workspace-page sc-page compact-page" style={pageStyle}>
      {/* Hero */}
      <div className="page-heading sc-hero compact-toolbar-card">
        <div className="page-title-block compact-header">
          <span className="compact-badge sc-eyebrow">Kênh bán</span>
          <div className="page-icon sc-hero-icon">{meta.icon}</div>
          <div className="sc-hero-copy">
            <h1 className="compact-title">{meta.label}</h1>
            <p className="compact-desc">
              Quản lý tất cả hoạt động bán hàng qua kênh <strong>{meta.label}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Channel banner */}
      <div className="sc-channel-banner">
        <div className="sc-channel-banner-icon">{meta.icon}</div>
        <div>
          <strong>{meta.label}</strong>
          <span>Chọn chức năng bên dưới để bắt đầu xử lý đơn hàng</span>
        </div>
      </div>

      {/* Action cards grid */}
      <div className="sc-action-grid">
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            className="sc-action-card"
            onClick={() => navigate(`/sales-channels/${channel}/${action.key}`)}
            style={{
              '--sc-action-accent': action.color,
              '--sc-action-accent-rgb': hexToRgb(action.color),
              '--sc-action-soft': action.bg,
            } as React.CSSProperties}
          >
            <div className="sc-action-icon">{action.icon}</div>
            <div className="sc-action-body">
              <strong>{action.label}</strong>
              <span>{action.desc}</span>
            </div>
            <ArrowRight size={16} className="sc-action-arrow" />
          </button>
        ))}
      </div>

      {/* Quick stats row */}
      <div className="metric-row sc-metric-row">
        {METRICS.map((m) => (
          <div key={m.label} className={`metric-card sc-metric-card ${m.tone}`}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

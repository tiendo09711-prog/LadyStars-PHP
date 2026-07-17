import { CalendarDays, Package, Store } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import './revenue-report-nav.css';

const views = [
  { to: '/reports/revenue/time', label: 'Theo thời gian', icon: CalendarDays },
  { to: '/reports/revenue/store', label: 'Theo cửa hàng', icon: Store },
  { to: '/reports/revenue/products', label: 'Theo sản phẩm', icon: Package },
];

export function RevenueReportNav() {
  return (
    <nav className="revenue-report-nav" aria-label="Chế độ xem báo cáo doanh thu">
      <div className="revenue-report-nav__intro">
        <strong>Báo cáo doanh thu</strong>
        <span>Chọn chiều phân tích</span>
      </div>
      <div className="revenue-report-nav__tabs">
        {views.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `revenue-report-nav__tab${isActive ? ' is-active' : ''}`}>
            <Icon size={16} aria-hidden />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

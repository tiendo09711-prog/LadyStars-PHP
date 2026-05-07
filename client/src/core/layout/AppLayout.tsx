import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Printer,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from 'lucide-react';
import { http } from '../api/http';

const menuGroups = [
  {
    label: 'Tổng quan',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Hàng hóa và bán hàng',
    items: [
      { to: '/products', label: 'Hàng hóa - kho', icon: Boxes },
      { to: '/sales', label: 'Bán hàng - thanh toán', icon: ShoppingCart },
    ],
  },
  {
    label: 'Đối tác',
    items: [
      { to: '/customers', label: 'Khách hàng', icon: Users },
      { to: '/vendors', label: 'Nhà cung cấp', icon: Building2 },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { to: '/accounting', label: 'Kế toán - báo cáo', icon: WalletCards },
      { to: '/tasks', label: 'Dự án - công việc', icon: ClipboardList },
      { to: '/print-forms', label: 'Mẫu in', icon: Printer },
    ],
  },
];

type CurrentUser = {
  name: string;
  email: string;
  role: string;
};

export function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    http.get('/auth/me')
      .then((response) => setUser(response.data))
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <div className="brand-mark">LS</div>
          <div>
            <strong>LadyStars</strong>
            <span>Polirium ERP on MERN</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuGroups.map((group) => (
            <div className="menu-group" key={group.label}>
              <div className="menu-group-title">
                <span>{group.label}</span>
                <ChevronDown size={14} />
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <button className="sidebar-setting" type="button">
          <Settings size={17} />
          <span>Vai trò, quyền, menu</span>
        </button>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div>
            <span className="topbar-eyebrow">Admin Workspace</span>
            <strong>Quản trị vận hành LadyStars</strong>
          </div>
          <div className="user-menu">
            <div className="user-avatar">{user?.name?.slice(0, 1) ?? 'A'}</div>
            <div className="user-info">
              <strong>{user?.name ?? 'Admin'}</strong>
              <span>{user?.email ?? 'admin@myerp.local'}</span>
            </div>
            <button className="icon-button" type="button" onClick={logout} title="Đăng xuất">
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

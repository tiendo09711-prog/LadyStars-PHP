import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileEdit,
  FileText,
  Gift,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Package,
  Printer,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Store,
  CreditCard,
  HeartHandshake,
  Network,
  BriefcaseMedical,
  MessageSquareHeart,
  UserCog,
  Users,
  WalletCards,
  X,
  Truck,
  AlertTriangle,
  List,
} from 'lucide-react';
import { http } from '../api/http';

const baseMenuGroups = [
  {
    label: 'Tổng quan',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Sản phẩm',
    items: [
      { to: '/products', label: 'Sản phẩm', icon: Boxes },
      { to: '/products/batches', label: 'Lô sản phẩm', icon: Layers },
      { to: '/products/storage-duration', label: 'Thời gian lưu kho', icon: Clock },
      { to: '/products/inventory', label: 'Tồn kho', icon: Package },
      { to: '/products/categories', label: 'Danh mục', icon: ClipboardList },
      { to: '/vendors', label: 'Nhà cung cấp', icon: Building2 },
    ],
  },
  {
    label: 'Kho hàng',
    items: [
      { to: '/warehouse/transactions', label: 'Xuất nhập kho', icon: ArrowLeftRight },
      { to: '/warehouse/transfers', label: 'Chuyển kho', icon: Shuffle },
      { to: '/warehouse/audit', label: 'Kiểm kho', icon: ClipboardCheck },
      { to: '/warehouse/drafts', label: 'Phiếu nháp', icon: FileEdit },
      { to: '/warehouse/history', label: 'Lịch sử sửa xóa', icon: History },
    ],
  },

  {
    label: 'Kênh bán - Cửa hàng',
    items: [
      { to: '/sales-channels/store/find',      label: 'Tìm hóa đơn',          icon: Search },
      { to: '/sales-channels/store/retail',    label: 'Bán lẻ',                icon: ShoppingCart },
      { to: '/sales-channels/store/wholesale', label: 'Bán sỉ',                icon: ShoppingBag },
      { to: '/sales-channels/store/refund',    label: 'Trả hàng',              icon: RotateCcw },
    ],
  },
  {
    label: 'Đơn hàng',
    items: [
      { to: '/orders/manage', label: 'Đơn hàng', icon: ShoppingCart },
      { to: '/orders/packing', label: 'Đóng gói', icon: Package },
      { to: '/orders/handover', label: 'Biên bản bàn giao', icon: FileText },
      { to: '/orders/shipping-pending', label: 'Chờ gửi vận chuyển', icon: Truck },
      { to: '/orders/disputes', label: 'Khiếu nại', icon: AlertTriangle },
      { to: '/orders/cod-control', label: 'Đối soát COD', icon: ClipboardCheck },
      { to: '/orders/sources', label: 'Nguồn đơn hàng', icon: List },
      { to: '/orders/history', label: 'Lịch sử sửa xóa', icon: History },
    ],
  },
  {
    label: 'Khách hàng',
    items: [
      { to: '/customers/list', label: 'Danh sách khách hàng', icon: List },
      { to: '/customers/cards', label: 'Thẻ khách hàng', icon: CreditCard },
      { to: '/customers/care', label: 'Chăm sóc khách hàng', icon: HeartHandshake },
      { to: '/customers/levels', label: 'Cấp độ', icon: Layers },
      { to: '/customers/groups', label: 'Nhóm khách hàng', icon: Network },
      { to: '/customers/care-types', label: 'Hình thức chăm sóc', icon: BriefcaseMedical },
      { to: '/customers/care-reasons', label: 'Lý do chăm sóc', icon: MessageSquareHeart },
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

const defaultMenuGroupState = Object.fromEntries(
  baseMenuGroups.map((group) => [group.label, false]),
) as Record<string, boolean>;

type CurrentUser = {
  name: string;
  email: string;
  role: string;
  status?: string;
};

type StoreSettings = {
  shopName: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  taxCode?: string;
};

export function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({ shopName: 'LadyStars' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenuGroups, setOpenMenuGroups] = useState<Record<string, boolean>>(() => defaultMenuGroupState);
  const isOwner = user?.role === 'owner';
  const shopName = storeSettings.shopName || 'LadyStars';
  const menuGroups = isOwner
    ? [
      ...baseMenuGroups,
      {
        label: 'Quản lý nhân viên',
        items: [
          { to: '/staff/create', label: 'Tạo tài khoản', icon: UserCog },
          { to: '/staff/accounts', label: 'Danh sách tài khoản', icon: Users },
          { to: '/staff/stats', label: 'Thống kê nhân viên', icon: WalletCards },
        ],
      },
    ]
    : baseMenuGroups;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    Promise.all([
      http.get('/auth/me'),
      http.get('/settings/store').catch(() => null),
    ])
      .then(([userResponse, settingResponse]) => {
        setUser(userResponse.data);
        if (settingResponse?.data) setStoreSettings(settingResponse.data);
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  useEffect(() => {
    const updateStoreSettings = (event: Event) => {
      setStoreSettings((event as CustomEvent<StoreSettings>).detail);
    };
    window.addEventListener('store-settings-updated', updateStoreSettings);
    return () => window.removeEventListener('store-settings-updated', updateStoreSettings);
  }, []);

  useEffect(() => {
    const updateOwnerAccount = (event: Event) => {
      setUser((event as CustomEvent<CurrentUser>).detail);
    };
    window.addEventListener('owner-account-updated', updateOwnerAccount);
    return () => window.removeEventListener('owner-account-updated', updateOwnerAccount);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const toggleMenuGroup = (label: string) => {
    setOpenMenuGroups((current) => ({
      ...current,
      [label]: !(current[label] ?? false),
    }));
  };

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className="app-sidebar">
        <div className="brand">
          <div className="brand-mark">LS</div>
          <div>
            <strong>{shopName}</strong>
            
          </div>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close menu"
            title="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuGroups.map((group) => {
            const isGroupOpen = openMenuGroups[group.label] ?? false;

            return (
              <div className="menu-group" key={group.label}>
                <button
                  className="menu-group-title"
                  type="button"
                  aria-expanded={isGroupOpen}
                  onClick={() => toggleMenuGroup(group.label)}
                >
                  <span>{group.label}</span>
                  <ChevronDown className="menu-group-chevron" size={14} />
                </button>
                {isGroupOpen && group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setSidebarOpen(false)}>
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {isOwner && (
          <NavLink className="sidebar-setting" to="/settings" onClick={() => setSidebarOpen(false)}>
            <Settings size={17} />
            <span>Thiết lập cài đặt</span>
          </NavLink>
        )}
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="menu-toggle"
              type="button"
              aria-label="Open menu"
              title="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <span className="topbar-eyebrow">Admin Workspace</span>
              <strong>Quản trị vận hành {shopName}</strong>
            </div>
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

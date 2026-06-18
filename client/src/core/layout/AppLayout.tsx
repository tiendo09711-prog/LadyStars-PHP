import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Package,
  Printer,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  CreditCard,
  HeartHandshake,
  UserCog,
  Users,
  WalletCards,
  X,
  Truck,
  AlertTriangle,
  List,
} from 'lucide-react';
import { http } from '../api/http';

type MenuLeaf = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type MenuItem = MenuLeaf | {
  label: string;
  icon: typeof LayoutDashboard;
  subItems: MenuLeaf[];
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const baseMenuGroups: MenuGroup[] = [
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
      { to: '/customers/care', label: 'Chăm sóc khách hàng', icon: HeartHandshake },
    ],
  },
  {
    label: 'Kế toán',
    items: [
      { to: '/accounting/cash', label: 'Thu chi tiền mặt', icon: WalletCards },
      { to: '/accounting/bank', label: 'Thu chi ngân hàng', icon: Building2 },
      { to: '/accounting/summary', label: 'Tổng hợp thu chi', icon: ClipboardList },
      { 
        label: 'Công nợ', 
        icon: Users,
        subItems: [
          { to: '/accounting/debt/customers', label: 'Khách hàng', icon: Users },
          { to: '/accounting/debt/staff', label: 'Nhân viên bán hàng', icon: Users },
          { to: '/accounting/debt/vendors', label: 'Nhà cung cấp', icon: Users },
          { to: '/accounting/debt/initial', label: 'Nhập công nợ đầu kì', icon: Users },
        ]
      },
      { 
        label: 'Bút toán', 
        icon: FileEdit,
        subItems: [
          { to: '/accounting/entries', label: 'Bút toán', icon: List },
          { to: '/accounting/journal', label: 'Nhật ký chung', icon: List },
          { to: '/accounting/installment-collection', label: 'Thu hộ trả góp', icon: List },
          { to: '/accounting/history', label: 'Lịch sử', icon: History },
        ]
      },
      { to: '/accounting/accounts', label: 'Tài khoản kế toán', icon: FileText },
      { to: '/accounting/installment', label: 'Dịch vụ trả góp', icon: CreditCard },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { to: '/tasks', label: 'Dự án - công việc', icon: ClipboardList },
      { to: '/print-forms', label: 'Mẫu in', icon: Printer },
    ],
  },
  {
    label: 'Báo Cáo',
    items: [
      {
        label: 'Doanh thu',
        icon: FileText,
        subItems: [
          { to: '/reports/revenue/time', label: 'Theo thời gian', icon: List },
          { to: '/reports/revenue/store', label: 'Theo cửa hàng', icon: List },
          { to: '/reports/revenue/brand', label: 'Theo thương hiệu', icon: List },
          { to: '/reports/revenue/staff', label: 'Theo nhân viên', icon: List },
          { to: '/reports/revenue/department', label: 'Theo phòng ban', icon: List },
          { to: '/reports/revenue/category', label: 'Theo danh mục sản phẩm', icon: List },
          { to: '/reports/revenue/internal-category', label: 'Theo danh mục nội bộ', icon: List },
          { to: '/reports/revenue/product', label: 'Theo sản phẩm', icon: List },
          { to: '/reports/revenue/vendor', label: 'Theo nhà cung cấp', icon: List },
          { to: '/reports/revenue/customer', label: 'Theo khách hàng', icon: List },
          { to: '/reports/revenue/inventory-ratio', label: 'Tỷ suất doanh thu / tồn kho', icon: List }
        ]
      },
      {
        label: 'Đơn hàng',
        icon: ShoppingCart,
        subItems: [
          { to: '/reports/orders/channel', label: 'Theo kênh bán', icon: List },
          { to: '/reports/orders/created', label: 'Đơn tạo', icon: List },
          { to: '/reports/orders/success', label: 'Đơn thành công', icon: List },
          { to: '/reports/orders/value', label: 'Theo giá trị đơn hàng', icon: List },
          { to: '/reports/orders/category', label: 'Theo danh mục sản phẩm', icon: List },
          { to: '/reports/orders/product', label: 'Theo sản phẩm', icon: List },
          { to: '/reports/orders/status', label: 'Theo trạng thái', icon: List },
          { to: '/reports/orders/address', label: 'Theo địa chỉ', icon: List },
          { to: '/reports/orders/reason', label: 'Lý do xử lý đơn hàng', icon: List },
          { to: '/reports/orders/staff', label: 'Nhân viên xử lý', icon: List },
          { to: '/reports/orders/ads', label: 'Theo quảng cáo', icon: List },
          { to: '/reports/orders/cod-reconciliation', label: 'Tiền đối soát', icon: List },
          { to: '/reports/orders/carrier', label: 'Theo hãng vận chuyển', icon: List }
        ]
      },
      {
        label: 'Bán lẻ',
        icon: ShoppingBag,
        subItems: [
          { to: '/reports/retail/overview', label: 'Tổng quan', icon: List },
          { to: '/reports/retail/customer-source', label: 'Theo nguồn khách hàng', icon: List },
          { to: '/reports/retail/staff', label: 'Theo nhân viên', icon: List },
          { to: '/reports/retail/store', label: 'Theo cửa hàng', icon: List },
          { to: '/reports/retail/card-swipe', label: 'Chi tiết quẹt thẻ', icon: List },
          { to: '/reports/retail/invoice-value', label: 'Theo giá trị hóa đơn', icon: List },
          { to: '/reports/retail/invoice-visitor-ratio', label: 'Báo cáo tỷ lệ hóa đơn/ khách vào cửa hàng', icon: List },
          { to: '/reports/retail/shift-end', label: 'Báo cáo kết ca', icon: List }
        ]
      },
      {
        label: 'Bán sỉ',
        icon: ShoppingBag,
        subItems: [
          { to: '/reports/wholesale/overview', label: 'Tổng quan', icon: List },
          { to: '/reports/wholesale/staff', label: 'Theo nhân viên bán hàng', icon: List }
        ]
      },
      {
        label: 'Kho hàng',
        icon: Package,
        subItems: [
          { to: '/reports/inventory/inout-product', label: 'Xuất nhập tồn theo sản phẩm', icon: List },
          { to: '/reports/inventory/inout-details', label: 'Chi tiết sản phẩm XNK', icon: List },
          { to: '/reports/inventory/inout-total', label: 'Tổng XNK', icon: List },
          { to: '/reports/inventory/inout-store', label: 'Tổng XNK theo cửa hàng', icon: List },
          { to: '/reports/inventory/vendor', label: 'Theo nhà cung cấp', icon: List },
          { to: '/reports/inventory/product-category', label: 'Danh mục sản phẩm', icon: List },
          { to: '/reports/inventory/stock-quantity', label: 'Số lượng hàng tồn kho', icon: List },
          { to: '/reports/inventory/unconfirmed-transfers', label: 'Chuyển kho chưa xác nhận', icon: List },
          { to: '/reports/inventory/store-status', label: 'Theo trạng thái từng cửa hàng', icon: List },
          { to: '/reports/inventory/product-status', label: 'Theo trạng thái từng sản phẩm', icon: List },
          { to: '/reports/inventory/batch', label: 'Theo lô hàng', icon: List },
          { to: '/reports/inventory/transfers-product', label: 'Chuyển kho theo sản phẩm', icon: List }
        ]
      },
      {
        label: 'Sản phẩm',
        icon: Boxes,
        subItems: [
          { to: '/reports/products/best-selling', label: 'Bán chạy nhất', icon: List },
          { to: '/reports/products/best-selling-store', label: 'Bán chạy theo cửa hàng', icon: List },
          { to: '/reports/products/sales-speed', label: 'Tốc độ bán hàng', icon: List },
          { to: '/reports/products/channel', label: 'Theo kênh bán', icon: List },
          { to: '/reports/products/category-store', label: 'Theo danh mục và cửa hàng', icon: List },
          { to: '/reports/products/price-range', label: 'Theo khoảng giá', icon: List },
          { to: '/reports/products/date', label: 'Theo ngày', icon: List },
          { to: '/reports/products/imei', label: 'Bán hàng theo IMEI', icon: List },
          { to: '/reports/products/attribute', label: 'Theo thuộc tính', icon: List }
        ]
      },
      {
        label: 'Kế toán',
        icon: WalletCards,
        subItems: [
          { to: '/reports/accounting/summary-store', label: 'Tổng hợp thu chi theo cửa hàng', icon: List },
          { to: '/reports/accounting/summary-account', label: 'Tổng hợp theo tài khoản', icon: List },
          { to: '/reports/accounting/retail-daily-store', label: 'Tổng hợp tiền bán lẻ hàng ngày theo cửa hàng', icon: List },
          { to: '/reports/accounting/summary-date', label: 'Tổng hợp thu chi theo ngày', icon: List },
          { to: '/reports/accounting/business-results', label: 'Tổng hợp kết quả kinh doanh', icon: List },
          { to: '/reports/accounting/balance-sheet', label: 'Bảng cân đối kế toán', icon: List }
        ]
      },
      {
        label: 'Sổ kế toán',
        icon: ClipboardList,
        subItems: [
          { to: '/reports/ledger/s1a-hkd', label: 'Mẫu số S1a-HKD (Doanh thu từ 1 tỷ trở xuống)', icon: List },
          { to: '/reports/ledger/s2a-hkd', label: 'Mẫu số S2a-HKD (Doanh thu trên 1 tỷ đến 3 tỷ)', icon: List },
          { to: '/reports/ledger/s2b-hkd', label: 'Mẫu số S2b-HKD (Doanh thu trên 3 tỷ)', icon: List },
          { to: '/reports/ledger/s2c-hkd', label: 'Mẫu số S2c-HKD (Sổ chi tiết doanh thu, chi phí)', icon: List },
          { to: '/reports/ledger/s2d-hkd', label: 'Mẫu số S2d-HKD (Sổ chi tiết vật liệu, dụng cụ, sản phẩm, hàng hóa)', icon: List }
        ]
      },
      {
        label: 'Khách hàng',
        icon: Users,
        subItems: [
          { to: '/reports/customers/overview', label: 'Tổng quan', icon: List },
          { to: '/reports/customers/product', label: 'Theo sản phẩm', icon: List },
          { to: '/reports/customers/return-rate', label: 'Tỷ lệ khách quay lại', icon: List },
          { to: '/reports/customers/level', label: 'Cấp độ khách hàng', icon: List },
          { to: '/reports/customers/group', label: 'Nhóm khách hàng', icon: List },
          { to: '/reports/customers/new-store', label: 'Khách hàng tạo mới theo cửa hàng', icon: List },
          { to: '/reports/customers/purchase-cycle', label: 'Chu kỳ mua hàng', icon: List },
          { to: '/reports/customers/birthday', label: 'Sinh nhật khách hàng', icon: List }
        ]
      }
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
  const location = useLocation();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({ shopName: 'LadyStars' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenuGroups, setOpenMenuGroups] = useState<Record<string, boolean>>(() => defaultMenuGroupState);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const isOwner = user?.role === 'owner';

  const isDesktopNav = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 981px)').matches;
  const closeAllMenus = () => {
    setOpenMenuGroups(defaultMenuGroupState);
    setReportSearch('');
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.user-dropdown-container')) {
        setUserMenuOpen(false);
      }
      if (!target.closest('.app-sidebar')) {
        closeAllMenus();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  const menuGroups = useMemo<MenuGroup[]>(() => isOwner
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
    : baseMenuGroups, [isOwner]);

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

  const openDesktopMenuGroup = (label: string) => {
    if (!isDesktopNav()) return;
    setOpenMenuGroups({ ...defaultMenuGroupState, [label]: true });
  };

  const toggleMenuGroup = (label: string, parentLabel?: string) => {
    setOpenMenuGroups((current) => ({
      ...(isDesktopNav()
        ? { ...defaultMenuGroupState, ...(parentLabel ? { [parentLabel]: true } : {}) }
        : current),
      [label]: !(current[label] ?? false),
    }));
  };

  const routeMatches = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  const itemActive = (item: MenuItem) => 'to' in item ? routeMatches(item.to) : item.subItems.some((subItem) => routeMatches(subItem.to));
  const groupActive = (group: MenuGroup) => group.items.some(itemActive);
  const closeSidebar = () => {
    setSidebarOpen(false);
    closeAllMenus();
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const activeUpdates: Record<string, boolean> = {};
    menuGroups.forEach((group) => {
      if (groupActive(group)) activeUpdates[group.label] = true;
      group.items.forEach((item) => {
        if (!('to' in item) && itemActive(item)) activeUpdates[item.label] = true;
      });
    });
    if (Object.keys(activeUpdates).length) {
      setOpenMenuGroups((current) => ({ ...current, ...activeUpdates }));
    }
  }, [location.pathname, menuGroups, sidebarOpen]);

  const renderMenuLink = (item: MenuLeaf) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={closeSidebar}>
        <Icon size={16} className="menu-icon" />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const renderReportPanel = (group: MenuGroup, isGroupOpen: boolean) => {
    const searchTerm = reportSearch.trim().toLowerCase();
    return (
      <div className={`menu-panel reports-panel ${isGroupOpen ? 'open mobile-open' : ''}`}>
        <label className="report-search">
          <Search size={15} />
          <input
            value={reportSearch}
            onChange={(event) => setReportSearch(event.target.value)}
            placeholder="Tìm báo cáo..."
            aria-label="Tìm báo cáo"
          />
        </label>
        <div className="report-menu-list">
          {group.items.map((item) => {
            if ('to' in item) return renderMenuLink(item);
            const filtered = item.subItems.filter((subItem) => {
              const text = `${item.label} ${subItem.label}`.toLowerCase();
              return !searchTerm || text.includes(searchTerm);
            });
            if (!filtered.length) return null;
            const Icon = item.icon;
            const isSubGroupOpen = openMenuGroups[item.label] ?? false;
            const isSubActive = itemActive(item);
            return (
              <div className="submenu-group report-menu-category" key={item.label}>
                <button
                  className={`submenu-trigger ${isSubActive ? 'active' : ''}`}
                  type="button"
                  aria-expanded={isSubGroupOpen}
                  onClick={(event) => {
                    event.preventDefault();
                    toggleMenuGroup(item.label, group.label);
                  }}
                >
                  <Icon size={16} className="menu-icon" />
                  <span>{item.label}</span>
                  <ChevronDown className="submenu-chevron" size={14} />
                </button>
                <div className={`submenu-panel report-submenu-panel ${isSubGroupOpen ? 'open mobile-open' : ''}`}>
                  {filtered.map(renderMenuLink)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className="app-sidebar" onMouseLeave={() => { if (isDesktopNav()) closeAllMenus(); }}>
        <div className="brand user-dropdown-container" onClick={() => setUserMenuOpen(!userMenuOpen)}>
          <div className="brand-mark brand-avatar">
            {user?.name?.slice(0, 1) ?? 'A'}
          </div>
          <div>
            <strong>{user?.name ?? 'Admin'}</strong>
            <span>{user?.email ?? 'admin@gmail.com'}</span>
          </div>
          <ChevronDown size={14} className="brand-chevron" />
          
          {userMenuOpen && (
            <div className="user-dropdown-menu">
              <div className="user-dropdown-summary">
                <strong>{user?.name ?? 'Admin'}</strong>
                <span>Vai trò: {user?.role === 'owner' ? 'Chủ cửa hàng' : 'Nhân viên'}</span>
              </div>
              <button 
                onClick={logout}
                className="user-dropdown-action danger"
              >
                <LogOut size={16} /> Đăng xuất
              </button>
            </div>
          )}

          <button
            className="sidebar-close"
            type="button"
            aria-label="Close menu"
            title="Close menu"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(false);
            }}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuGroups.map((group) => {
            const isGroupOpen = openMenuGroups[group.label] ?? false;
            const isActive = groupActive(group);

            return (
              <div
                className={`menu-group ${isActive ? 'active' : ''}`}
                key={group.label}
                onMouseEnter={() => openDesktopMenuGroup(group.label)}
              >
                <button
                  className={`menu-group-title ${isActive ? 'active' : ''}`}
                  type="button"
                  aria-expanded={isGroupOpen}
                  onClick={() => toggleMenuGroup(group.label)}
                >
                  <span>{group.label}</span>
                  <ChevronDown className="menu-group-chevron" size={14} />
                </button>
                {group.label === 'Báo Cáo' ? renderReportPanel(group, isGroupOpen) : (
                <div className={`menu-panel ${isGroupOpen ? 'open mobile-open' : ''}`}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    if (!('to' in item) && item.subItems) {
                      const isSubGroupOpen = openMenuGroups[item.label] ?? false;
                      const isSubActive = itemActive(item);
                      return (
                        <div className="submenu-group" key={item.label}>
                          <button
                            className={`submenu-trigger ${isSubActive ? 'active' : ''}`}
                            type="button"
                            aria-expanded={isSubGroupOpen}
                            onClick={(e) => {
                              e.preventDefault();
                              toggleMenuGroup(item.label, group.label);
                            }}
                          >
                            <Icon size={16} className="menu-icon" />
                            <span>{item.label}</span>
                            <ChevronDown className="submenu-chevron" size={14} />
                          </button>
                          <div className={`submenu-panel ${isSubGroupOpen ? 'open mobile-open' : ''}`}>
                            {item.subItems.map(renderMenuLink)}
                          </div>
                        </div>
                      );
                    }
                    
                    return renderMenuLink(item as MenuLeaf);
                  })}
                </div>
                )}
              </div>
            );
          })}
          {isOwner && (
            <div className="menu-group owner-setting-group" onMouseEnter={() => { if (isDesktopNav()) closeAllMenus(); }}>
              <NavLink className="sidebar-setting" to="/settings" onClick={() => setSidebarOpen(false)}>
                <Settings size={16} className="menu-icon" />
                <span>Cài đặt</span>
              </NavLink>
            </div>
          )}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button className="menu-toggle" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <List size={20} />
          </button>
          <div className="app-header-title">
            <strong>{storeSettings.shopName || 'LadyStars'}</strong>
            <span>{location.pathname === '/' ? 'Dashboard' : location.pathname}</span>
          </div>
          <div className="app-header-user">{user?.role === 'owner' ? 'Chủ cửa hàng' : 'Nhân viên'}</div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

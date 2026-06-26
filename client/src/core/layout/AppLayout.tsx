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
  HeartHandshake,
  UserCog,
  Users,
  WalletCards,
  X,
  List,
} from 'lucide-react';
import { http } from '../api/http';
import { canAccessPath, isAdminRole, normalizeRole, roleLabel } from '../auth/access';
import { useProductScannerBridge } from '../hooks/productScanner';

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
  id: string;
  label: string;
  items: MenuItem[];
};

const baseMenuGroups: MenuGroup[] = [
  {
    id: 'overview',
    label: 'Tổng quan',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'product',
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
    id: 'warehouse',
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
    id: 'sales-channel',
    label: 'Kênh bán - Cửa hàng',
    items: [
      { to: '/sales-channels/store/retail',    label: 'Bán lẻ',                icon: ShoppingCart },
      { to: '/sales-channels/store/wholesale', label: 'Bán sỉ',                icon: ShoppingBag },
      { to: '/sales-channels/store/refund',    label: 'Trả hàng',              icon: RotateCcw },
    ],
  },
  {
    id: 'customer',
    label: 'Khách hàng',
    items: [
      { to: '/customers/list', label: 'Danh sách khách hàng', icon: List },
      { to: '/customers/care', label: 'Chăm sóc khách hàng', icon: HeartHandshake },
    ],
  },
  {
    id: 'operations',
    label: 'Vận hành',
    items: [
      { to: '/tasks', label: 'Dự án - công việc', icon: ClipboardList },
      { to: '/print-forms', label: 'Mẫu in', icon: Printer },
    ],
  },
  {
    id: 'report',
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
  baseMenuGroups.map((group) => [group.id, false]),
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
  useProductScannerBridge();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({ shopName: 'LadyStars' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenuGroups, setOpenMenuGroups] = useState<Record<string, boolean>>(() => defaultMenuGroupState);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const isAdmin = isAdminRole(user?.role);

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
  const menuGroups = useMemo<MenuGroup[]>(() => isAdmin
    ? [
      ...baseMenuGroups,
      {
        id: 'staff',
        label: 'Quản lý nhân viên',
        items: [
          { to: '/staff/create', label: 'Tạo tài khoản', icon: UserCog },
          { to: '/staff/accounts', label: 'Danh sách tài khoản', icon: Users },
          { to: '/staff/stats', label: 'Thống kê nhân viên', icon: WalletCards },
        ],
      },
    ]
    : baseMenuGroups.filter((group) => !['operations', 'report'].includes(group.id)), [isAdmin]);
  const visibleMenuGroups = useMemo<MenuGroup[]>(() => menuGroups.map((group) => {
    if (group.id !== 'warehouse' || !isAdmin) return group;
    return {
      ...group,
      items: [...group.items, { to: '/warehouse/branches', label: 'Cấu hình kho hàng', icon: Building2 }],
    };
  }), [isAdmin, menuGroups]);

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
        setUser({ ...userResponse.data, role: normalizeRole(userResponse.data?.role) });
        if (settingResponse?.data) setStoreSettings(settingResponse.data);
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    if (!canAccessPath(user.role, location.pathname)) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate, user]);

  useEffect(() => {
    const updateStoreSettings = (event: Event) => {
      setStoreSettings((event as CustomEvent<StoreSettings>).detail);
    };
    window.addEventListener('store-settings-updated', updateStoreSettings);
    return () => window.removeEventListener('store-settings-updated', updateStoreSettings);
  }, []);

  useEffect(() => {
    const updateOwnerAccount = (event: Event) => {
      const detail = (event as CustomEvent<CurrentUser>).detail;
      setUser({ ...detail, role: normalizeRole(detail?.role) });
    };
    window.addEventListener('owner-account-updated', updateOwnerAccount);
    return () => window.removeEventListener('owner-account-updated', updateOwnerAccount);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const openDesktopMenuGroup = (key: string) => {
    if (!isDesktopNav()) return;
    setOpenMenuGroups({ ...defaultMenuGroupState, [key]: true });
  };

  const toggleMenuGroup = (key: string, parentKey?: string) => {
    setOpenMenuGroups((current) => ({
      ...(isDesktopNav()
        ? { ...defaultMenuGroupState, ...(parentKey ? { [parentKey]: true } : {}) }
        : current),
      [key]: !(current[key] ?? false),
    }));
  };

  const exactMenuPaths = new Set(['/products']);
  const routeMatches = (to: string) => {
    if (to === '/' || exactMenuPaths.has(to)) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };
  const itemActive = (item: MenuItem) => 'to' in item ? routeMatches(item.to) : item.subItems.some((subItem) => routeMatches(subItem.to));
  const groupActive = (group: MenuGroup) => group.items.some(itemActive);
  const closeSidebar = () => {
    setSidebarOpen(false);
    closeAllMenus();
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const activeUpdates: Record<string, boolean> = {};
    visibleMenuGroups.forEach((group) => {
      if (groupActive(group)) activeUpdates[group.id] = true;
      group.items.forEach((item) => {
        if (!('to' in item) && itemActive(item)) activeUpdates[item.label] = true;
      });
    });
    if (Object.keys(activeUpdates).length) {
      setOpenMenuGroups((current) => ({ ...current, ...activeUpdates }));
    }
  }, [location.pathname, sidebarOpen, visibleMenuGroups]);

  const renderMenuLink = (item: MenuLeaf) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.to} to={item.to} end={item.to === '/' || exactMenuPaths.has(item.to)} onClick={closeSidebar}>
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
                    toggleMenuGroup(item.label, group.id);
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
                <span>Vai trò: {roleLabel(user?.role)}</span>
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
          {visibleMenuGroups.map((group) => {
            const isGroupOpen = openMenuGroups[group.id] ?? false;
            const isActive = groupActive(group);

            return (
              <div
                className={`menu-group menu-group-${group.id} ${isActive ? 'active' : ''}`}
                key={group.id}
                onMouseEnter={() => openDesktopMenuGroup(group.id)}
              >
                <button
                  className={`menu-group-title ${isActive ? 'active' : ''}`}
                  type="button"
                  aria-expanded={isGroupOpen}
                  onClick={() => toggleMenuGroup(group.id)}
                >
                  <span>{group.label}</span>
                  <ChevronDown className="menu-group-chevron" size={14} />
                </button>
                {group.id === 'report' ? renderReportPanel(group, isGroupOpen) : (
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
                              toggleMenuGroup(item.label, group.id);
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
          {user && (
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
          <div className="app-header-user">{roleLabel(user?.role)}</div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

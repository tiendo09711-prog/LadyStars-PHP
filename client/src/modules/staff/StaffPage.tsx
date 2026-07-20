import { FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CreditCard,
  DollarSign,
  Edit3,
  KeyRound,
  Lock,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trash2,
  Unlock,
  UserCheck,
  UserCog,
  Users,
  UserX,
  WalletCards,
  X,
} from 'lucide-react';
import { http } from '../../core/api/http';
import { isAdminRole } from '../../core/auth/access';
import './staff-page.css';

type Status = 'ACTIVE' | 'LOCKED';

type WarehouseOption = {
  _id: string;
  name: string;
  code?: string;
  isActive?: boolean;
};

type StaffAccount = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: Status | string;
  assignedWarehouseIds?: WarehouseOption[];
  warehouseNames?: string[];
  defaultWarehouseId?: WarehouseOption | string | null;
  createdById?: { _id?: string; name?: string; email?: string } | string | null;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type StaffForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  status: Status;
  assignedWarehouseIds: string[];
  defaultWarehouseId: string;
};

type AccountFilters = {
  keyword: string;
  warehouseId: string;
  status: '' | Status;
};

const emptyForm: StaffForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  status: 'ACTIVE',
  assignedWarehouseIds: [],
  defaultWarehouseId: '',
};

const tabs = [
  { key: 'create', path: '/staff/create', label: 'Tạo tài khoản', icon: UserCog },
  { key: 'accounts', path: '/staff/accounts', label: 'Danh sách tài khoản', icon: Users },
  { key: 'stats', path: '/staff/stats', label: 'Thống kê nhân viên', icon: WalletCards },
];

function getId(item: StaffAccount | WarehouseOption | null | undefined) {
  return String(item?._id || (item as StaffAccount | undefined)?.id || '');
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN');
}

function formatDateParts(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: date.toLocaleDateString('vi-VN'),
    time: date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function statusLabel(value?: string) {
  return value === 'LOCKED' ? 'Đã khóa' : 'Đang hoạt động';
}

function staffInitials(name?: string, email?: string) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function warehouseNameList(item: StaffAccount) {
  if (item.warehouseNames?.length) {
    return item.warehouseNames.filter(Boolean);
  }
  const arr = item.assignedWarehouseIds || [];
  return arr.map((w: any) => {
    if (!w) return '';
    if (typeof w === 'string' || typeof w === 'number') return String(w);
    return warehouseLabel(w);
  }).filter(Boolean);
}

function isSuccessMessage(text: string) {
  return /^Đã\s/i.test(text.trim()) || /thành công/i.test(text);
}

function warehouseLabel(warehouse: WarehouseOption) {
  return warehouse.code ? `${warehouse.name} (${warehouse.code})` : warehouse.name;
}

function assignedWarehouseIds(item: StaffAccount) {
  const arr = item.assignedWarehouseIds || [];
  return arr.map((w: any) => {
    if (!w) return '';
    if (typeof w === 'string' || typeof w === 'number') return String(w);
    return String(w._id || w.id || '');
  }).filter(Boolean);
}

function assignedWarehouseText(item: StaffAccount) {
  if (item.warehouseNames?.length) {
    return item.warehouseNames.filter(Boolean).join(', ') || '-';
  }
  const arr = item.assignedWarehouseIds || [];
  const names = arr.map((w: any) => {
    if (!w) return '';
    if (typeof w === 'string' || typeof w === 'number') return String(w);
    return warehouseLabel(w);
  });
  return names.filter(Boolean).join(', ') || '-';
}

function createdByText(item: StaffAccount) {
  if (!item.createdById) return '-';
  if (typeof item.createdById === 'string') return item.createdById;
  return item.createdById.name || item.createdById.email || '-';
}

function apiMessage(error: unknown, fallback: string) {
  const err = error as { response?: { data?: { message?: string } } };
  return err.response?.data?.message || fallback;
}

export function StaffPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => {
    if (location.pathname.endsWith('/create')) return 'create';
    if (location.pathname.endsWith('/stats')) return 'stats';
    return 'accounts';
  }, [location.pathname]);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(() => searchParams.get('staff') || '');
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [filters, setFilters] = useState<AccountFilters>({ keyword: '', warehouseId: '', status: '' });
  const [statsFilters, setStatsFilters] = useState(() => ({
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  }));
  const [editing, setEditing] = useState<StaffAccount | null>(null);
  const [editForm, setEditForm] = useState<Omit<StaffForm, 'password' | 'confirmPassword'>>(emptyForm);
  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuPanelRef = useRef<HTMLDivElement | null>(null);

  const selectedStaff = useMemo(
    () => staff.find((item) => getId(item) === selectedStaffId),
    [selectedStaffId, staff],
  );

  const filteredStaff = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return staff.filter((item) => {
      const text = `${item.name || ''} ${item.email || ''} ${item.phone || ''}`.toLowerCase();
      const matchesKeyword = !keyword || text.includes(keyword);
      const matchesStatus = !filters.status || item.status === filters.status;
      const matchesWarehouse = !filters.warehouseId || assignedWarehouseIds(item).includes(filters.warehouseId);
      return matchesKeyword && matchesStatus && matchesWarehouse;
    });
  }, [filters, staff]);

  const summary = useMemo(() => ({
    total: staff.length,
    active: staff.filter((item) => item.status !== 'LOCKED').length,
    locked: staff.filter((item) => item.status === 'LOCKED').length,
  }), [staff]);

  const hasActiveFilters = Boolean(filters.keyword.trim() || filters.warehouseId || filters.status);

  const clearFilters = () => {
    setFilters({ keyword: '', warehouseId: '', status: '' });
  };

  const loadStaff = async () => {
    const response = await http.get('/staff');
    const items = response.data.items || [];
    setStaff(items);
    setSelectedStaffId((current) => current || getId(items[0]) || '');
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [me, , branchRes] = await Promise.all([
        http.get('/auth/me'),
        loadStaff(),
        http.get('/system/branches', { params: { limit: 5000 } }),
      ]);
      if (!isAdminRole(me.data?.role)) {
        navigate('/', { replace: true });
        return;
      }
      const activeWarehouses = (branchRes.data.items || []).filter((item: WarehouseOption) => item.isActive !== false);
      setWarehouses(activeWarehouses);
      const firstWh = activeWarehouses[0]?._id || '';
      setForm((current) => ({
        ...current,
        assignedWarehouseIds: current.assignedWarehouseIds.length ? current.assignedWarehouseIds : (firstWh ? [firstWh] : []),
        defaultWarehouseId: current.defaultWarehouseId || firstWh,
      }));
      setReady(true);
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể tải dữ liệu quản lý nhân viên.'));
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setFilters({ keyword: '', warehouseId: '', status: '' });
    void loadInitialData();
  };

  useEffect(() => {
    void loadInitialData();
  }, [navigate]);

  const toggleRowMenu = (item: StaffAccount, event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 184;
    const gap = 6;
    const viewportPadding = 8;
    const left = Math.max(viewportPadding, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding));
    const opensBelow = rect.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;
    const top = opensBelow ? rect.bottom + gap : Math.max(viewportPadding, rect.top - menuHeight - gap);
    setRowMenuPos({ top, left });
    setRowMenuOpen((current) => (current === getId(item) ? null : getId(item)));
  };

  useEffect(() => {
    if (!rowMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && (rowMenuRef.current?.contains(target) || rowMenuPanelRef.current?.contains(target))) return;
      setRowMenuOpen(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRowMenuOpen(null);
    };
    const closeOnScroll = () => setRowMenuOpen(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [rowMenuOpen]);

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (form.password !== form.confirmPassword) {
      setMessage('Mật khẩu xác nhận không khớp.');
      return;
    }
    // Relaxed: warehouse optional (fix "cần kho trước" risk). Only enforce if warehouses exist.
    if (warehouses.length > 0 && form.assignedWarehouseIds.length === 0) {
      setMessage('Phải chọn ít nhất một kho active cho nhân viên (hoặc tạo kho trước).');
      return;
    }
    setSaving(true);
    try {
      await http.post('/staff', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        status: form.status,
        assignedWarehouseIds: form.assignedWarehouseIds,
        defaultWarehouseId: form.defaultWarehouseId || (form.assignedWarehouseIds[0] ?? null),
      });
      setMessage('Đã tạo tài khoản nhân viên.');
      setForm({ ...emptyForm, assignedWarehouseIds: form.assignedWarehouseIds, defaultWarehouseId: form.defaultWarehouseId });
      await loadStaff();
      navigate('/staff/accounts');
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể tạo tài khoản nhân viên.'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: StaffAccount) => {
    const ids = assignedWarehouseIds(item);
    const defaultId = typeof item.defaultWarehouseId === 'string'
      ? item.defaultWarehouseId
      : String(item.defaultWarehouseId?._id || ids[0] || '');
    setEditing(item);
    setEditForm({
      name: item.name || '',
      email: item.email || '',
      phone: item.phone || '',
      status: item.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
      assignedWarehouseIds: ids.length ? ids : (defaultId ? [defaultId] : []),
      defaultWarehouseId: defaultId,
    });
  };

  const updateStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || saving) return;
    // Relaxed for no-warehouse case
    if (warehouses.length > 0 && editForm.assignedWarehouseIds.length === 0) {
      setMessage('Phải chọn ít nhất một kho active cho nhân viên (hoặc tạo kho trước).');
      return;
    }
    setSaving(true);
    try {
      await http.patch(`/staff/${getId(editing)}`, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        status: editForm.status,
        assignedWarehouseIds: editForm.assignedWarehouseIds,
        defaultWarehouseId: editForm.defaultWarehouseId || (editForm.assignedWarehouseIds[0] ?? null),
      });
      setMessage('Đã cập nhật tài khoản nhân viên.');
      setEditing(null);
      await loadStaff();
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể cập nhật nhân viên.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: StaffAccount) => {
    const action = item.status === 'LOCKED' ? 'open' : 'lock';
    const confirmText = action === 'lock'
      ? `Khóa tài khoản ${item.name || item.email}? Nhân viên sẽ không đăng nhập/gọi API nghiệp vụ nữa.`
      : `Mở khóa tài khoản ${item.name || item.email}?`;
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    try {
      await http.patch(`/staff/${getId(item)}/${action}`);
      setMessage(action === 'lock' ? 'Đã khóa tài khoản nhân viên.' : 'Đã mở khóa tài khoản nhân viên.');
      await loadStaff();
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể cập nhật trạng thái nhân viên.'));
    } finally {
      setSaving(false);
    }
  };

  const submitResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget || saving) return;
    if (resetPassword.length < 6) {
      setMessage('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    setSaving(true);
    try {
      await http.post(`/staff/${getId(resetTarget)}/reset-password`, { password: resetPassword });
      setMessage('Đã reset mật khẩu nhân viên. Mật khẩu không được trả về từ API.');
      setResetPassword('');
      setResetTarget(null);
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể reset mật khẩu nhân viên.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleteTarget || saving) return;
    if (deleteTarget.status !== 'LOCKED') {
      setMessage('Phải khóa tài khoản trước khi xóa.');
      return;
    }
    setSaving(true);
    try {
      await http.delete(`/staff/${getId(deleteTarget)}`);
      setMessage('Đã xóa tài khoản nhân viên khỏi hệ thống. Dữ liệu nghiệp vụ được giữ nguyên.');
      setDeleteTarget(null);
      await loadStaff();
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể xóa nhân viên.'));
    } finally {
      setSaving(false);
    }
  };

  const lockForDelete = async () => {
    if (!deleteTarget || saving) return;
    setSaving(true);
    try {
      await http.patch(`/staff/${getId(deleteTarget)}/lock`);
      setDeleteTarget((current) => (current ? { ...current, status: 'LOCKED' } : current));
      await loadStaff();
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể khóa tài khoản.'));
    } finally {
      setSaving(false);
    }
  };

  const loadStats = async () => {
    if (!selectedStaffId) {
      setStats(null);
      setActivity([]);
      return;
    }
    setStats(null);
    setActivity([]);
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(statsFilters).filter(([, value]) => value));
      const [statsRes, activityRes] = await Promise.all([
        http.get(`/staff/${selectedStaffId}/stats`, { params }),
        http.get(`/staff/${selectedStaffId}/activity`, { params }),
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data.items || []);
    } catch (error) {
      setMessage(apiMessage(error, 'Không thể tải thống kê nhân viên.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && tab === 'stats') void loadStats();
  }, [ready, tab, selectedStaffId]);

  // URL sync for stats tab: persist selected + date filters so hard refresh keeps state
  useEffect(() => {
    if (tab !== 'stats') return;
    const next = new URLSearchParams(searchParams);
    if (selectedStaffId) {
      next.set('staff', selectedStaffId);
    } else {
      next.delete('staff');
    }
    if (statsFilters.from) next.set('from', statsFilters.from); else next.delete('from');
    if (statsFilters.to) next.set('to', statsFilters.to); else next.delete('to');
    // Only update if different to avoid loops
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [tab, selectedStaffId, statsFilters.from, statsFilters.to]);

  // When staff list loads in stats tab and no selection from URL, pick first (avoid loop by length)
  useEffect(() => {
    if (tab === 'stats' && ready && staff.length > 0 && !selectedStaffId) {
      const first = getId(staff[0]);
      if (first) setSelectedStaffId(first);
    }
  }, [tab, ready, staff.length]);

  if (!ready) return <div className="workspace-page staff-page">Đang tải quản lý nhân viên...</div>;

  return (
    <div className="workspace-page compact-page staff-page">
      <div className="workspace-tabs" role="tablist" aria-label="Quản lý nhân viên">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={tab === item.key ? 'active' : ''} type="button" onClick={() => navigate(item.path)}>
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </div>

      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><ShieldCheck size={24} /></div>
          <div>
            <h1>Quản lý nhân viên</h1>
            <p>ADMIN tạo và quản lý EMPLOYEE, gán kho active và theo dõi thống kê từ dữ liệu thật.</p>
          </div>
        </div>
        <div className="page-actions">
          {tab === 'accounts' && (
            <button className="btn btn-primary" type="button" onClick={() => navigate('/staff/create')}>
              <Plus size={15} /> Tạo tài khoản
            </button>
          )}
          {tab === 'stats' && (
            <button className="btn btn-light" type="button" disabled={loading} onClick={() => void loadStats()}>
              <RefreshCw size={15} /> Tải thống kê
            </button>
          )}
          <button className="btn btn-light" type="button" disabled={loading} onClick={handleRefresh}>
            <RefreshCw size={15} /> Làm mới
          </button>
        </div>
      </div>

      {message && (
        <div className={`staff-alert ${isSuccessMessage(message) ? 'is-success' : 'is-error'}`} role="status">
          <span>{message}</span>
          <button className="staff-alert-dismiss" type="button" aria-label="Đóng thông báo" onClick={() => setMessage('')}>
            <X size={15} />
          </button>
        </div>
      )}

      <div className="metric-row staff-metric-row">
        <div className="metric-card staff-metric-card">
          <div className="staff-metric-icon" aria-hidden="true"><Users size={20} /></div>
          <div className="staff-metric-body">
            <span>Tổng nhân viên</span>
            <strong>{summary.total}</strong>
          </div>
        </div>
        <div className="metric-card staff-metric-card success">
          <div className="staff-metric-icon" aria-hidden="true"><UserCheck size={20} /></div>
          <div className="staff-metric-body">
            <span>Đang hoạt động</span>
            <strong>{summary.active}</strong>
          </div>
        </div>
        <div className="metric-card staff-metric-card danger">
          <div className="staff-metric-icon" aria-hidden="true"><UserX size={20} /></div>
          <div className="staff-metric-body">
            <span>Đã khóa</span>
            <strong>{summary.locked}</strong>
          </div>
        </div>
      </div>

      {tab === 'create' && (
        <form className="data-card staff-create-card" onSubmit={createStaff}>
          <div className="data-card-header">
            <div className="staff-section-title">
              <h2>Tạo tài khoản EMPLOYEE</h2>
              <p className="staff-section-desc">Tạo tài khoản nhân viên mới, gán kho làm việc và mật khẩu khởi tạo. Role luôn là EMPLOYEE.</p>
              <div className="staff-accounts-meta">
                <span className="record-badge">Role: EMPLOYEE</span>
                <span className="record-badge">{warehouses.length} kho active</span>
              </div>
            </div>
            <button className="btn btn-light" type="button" onClick={() => navigate('/staff/accounts')}>
              <Users size={14} /> Xem danh sách
            </button>
          </div>

          <div className="staff-create-body">
            <section className="staff-form-section">
              <div className="staff-form-section-head">
                <span className="staff-form-section-icon" aria-hidden="true"><UserCog size={14} /></span>
                <div>
                  <h3>Thông tin cơ bản</h3>
                  <p>Tên hiển thị, email đăng nhập và số điện thoại liên hệ.</p>
                </div>
              </div>
              <div className="staff-form-grid">
                <label className="staff-field">
                  <span>Tên nhân viên *</span>
                  <input required value={form.name} placeholder="VD: Nguyễn Văn A" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="staff-field">
                  <span>Email *</span>
                  <input required type="email" value={form.email} placeholder="email@example.com" onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label className="staff-field">
                  <span>Số điện thoại</span>
                  <input value={form.phone} placeholder="09xx xxx xxx" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label className="staff-field">
                  <span>Trạng thái ban đầu</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Status }))}>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="LOCKED">Đã khóa</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="staff-form-section">
              <div className="staff-form-section-head">
                <span className="staff-form-section-icon" aria-hidden="true"><KeyRound size={14} /></span>
                <div>
                  <h3>Mật khẩu khởi tạo</h3>
                  <p>Tối thiểu 6 ký tự. Nhân viên có thể đổi sau khi đăng nhập.</p>
                </div>
              </div>
              <div className="staff-form-grid">
                <label className="staff-field">
                  <span>Mật khẩu *</span>
                  <input required minLength={6} type="password" autoComplete="new-password" value={form.password} placeholder="Ít nhất 6 ký tự" onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
                </label>
                <label className="staff-field">
                  <span>Xác nhận mật khẩu *</span>
                  <input required minLength={6} type="password" autoComplete="new-password" value={form.confirmPassword} placeholder="Nhập lại mật khẩu" onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                </label>
              </div>
            </section>

            <section className="staff-form-section">
              <div className="staff-form-section-head">
                <span className="staff-form-section-icon" aria-hidden="true"><Building2 size={14} /></span>
                <div>
                  <h3>Phân công kho</h3>
                  <p>Gán kho làm việc và chọn kho chính (mặc định khi đăng nhập).</p>
                </div>
              </div>
              <WarehousePicker
                warehouses={warehouses}
                selectedIds={form.assignedWarehouseIds}
                defaultId={form.defaultWarehouseId}
                onChange={(ids, def) => setForm((current) => ({ ...current, assignedWarehouseIds: ids, defaultWarehouseId: def }))}
              />
            </section>
          </div>

          <div className="staff-form-footer">
            <button
              className="btn btn-light"
              type="button"
              onClick={() => setForm({
                ...emptyForm,
                assignedWarehouseIds: warehouses[0]?._id ? [warehouses[0]._id] : [],
                defaultWarehouseId: warehouses[0]?._id || '',
              })}
            >
              <RotateCcw size={14} /> Xóa form
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving || warehouses.length === 0}>
              <Plus size={14} />
              {saving ? 'Đang tạo...' : 'Tạo nhân viên'}
            </button>
          </div>
        </form>
      )}

      {tab === 'accounts' && (
        <section className="data-card staff-accounts-card">
          <div className="data-card-header">
            <div className="staff-accounts-title">
              <h2>Danh sách tài khoản EMPLOYEE</h2>
              <div className="staff-accounts-meta">
                <span className="record-badge">{filteredStaff.length} / {staff.length} tài khoản</span>
                {hasActiveFilters && <span className="record-badge">Đang lọc</span>}
              </div>
            </div>
            <div className="staff-accounts-actions">
              <button className="btn btn-light" type="button" onClick={() => navigate('/staff/create')}>
                <Plus size={15} /> Thêm nhân viên
              </button>
            </div>
          </div>

          <div className="staff-filter-bar">
            <label className="staff-filter-field">
              <span>Từ khóa</span>
              <div className="staff-search">
                <Search size={16} aria-hidden="true" />
                <input
                  value={filters.keyword}
                  placeholder="Tên, email, số điện thoại"
                  onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                  aria-label="Tìm kiếm nhân viên"
                />
              </div>
            </label>
            <label className="staff-filter-field">
              <span>Kho được gán</span>
              <select
                value={filters.warehouseId}
                onChange={(event) => setFilters((current) => ({ ...current, warehouseId: event.target.value }))}
                aria-label="Lọc theo kho"
              >
                <option value="">Tất cả kho</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse._id} value={warehouse._id}>{warehouseLabel(warehouse)}</option>
                ))}
              </select>
            </label>
            <label className="staff-filter-field">
              <span>Trạng thái</span>
              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as AccountFilters['status'] }))}
                aria-label="Lọc theo trạng thái"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="LOCKED">Đã khóa</option>
              </select>
            </label>
            <div className="staff-filter-actions">
              <button
                className="btn btn-light staff-filter-clear"
                type="button"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                <X size={15} /> Xóa lọc
              </button>
            </div>
          </div>

          <div className="staff-status-chips" role="group" aria-label="Lọc nhanh trạng thái">
            <button
              type="button"
              className={`staff-status-chip${!filters.status ? ' is-active' : ''}`}
              onClick={() => setFilters((current) => ({ ...current, status: '' }))}
            >
              <span className="staff-chip-dot all" aria-hidden="true" />
              Tất cả ({summary.total})
            </button>
            <button
              type="button"
              className={`staff-status-chip${filters.status === 'ACTIVE' ? ' is-active' : ''}`}
              onClick={() => setFilters((current) => ({ ...current, status: 'ACTIVE' }))}
            >
              <span className="staff-chip-dot active" aria-hidden="true" />
              Đang hoạt động ({summary.active})
            </button>
            <button
              type="button"
              className={`staff-status-chip${filters.status === 'LOCKED' ? ' is-active' : ''}`}
              onClick={() => setFilters((current) => ({ ...current, status: 'LOCKED' }))}
            >
              <span className="staff-chip-dot locked" aria-hidden="true" />
              Đã khóa ({summary.locked})
            </button>
          </div>

          <div className="table-scroll">
            <table className="data-table compact staff-accounts-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Email / Phone</th>
                  <th>Vai trò</th>
                  <th>Kho được gán</th>
                  <th>Trạng thái</th>
                  <th>Đăng nhập gần nhất</th>
                  <th>Ngày tạo</th>
                  <th>Người tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((item) => {
                  const id = getId(item);
                  const locked = item.status === 'LOCKED';
                  const lastLogin = formatDateParts(item.lastLoginAt);
                  const created = formatDateParts(item.createdAt);
                  const warehousesForRow = warehouseNameList(item);
                  return (
                    <tr key={id}>
                      <td>
                        <div className="staff-person">
                          <div className={`staff-avatar${locked ? ' is-locked' : ''}`} aria-hidden="true">
                            {staffInitials(item.name, item.email)}
                          </div>
                          <div className="staff-person-text">
                            <strong>{item.name || 'Chưa đặt tên'}</strong>
                            <small title={id}>{id || '—'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="staff-contact">
                          <span className={`staff-contact-line${item.email ? '' : ' is-empty'}`}>
                            <Mail size={13} aria-hidden="true" />
                            {item.email || 'Chưa có email'}
                          </span>
                          <span className={`staff-contact-line${item.phone ? '' : ' is-empty'}`}>
                            <Phone size={13} aria-hidden="true" />
                            {item.phone || 'Chưa có SĐT'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="staff-role-badge">
                          <UserCog size={13} aria-hidden="true" />
                          Nhân viên
                        </span>
                      </td>
                      <td>
                        {warehousesForRow.length > 0 ? (
                          <div className="staff-warehouse-list">
                            {warehousesForRow.map((name) => (
                              <span key={`${id}-${name}`} className="staff-warehouse-chip">
                                <Building2 size={12} aria-hidden="true" />
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="staff-warehouse-empty">Chưa gán kho</span>
                        )}
                      </td>
                      <td>
                        <span className={`staff-status ${locked ? 'is-locked' : 'is-active'}`}>
                          <span className="staff-status-dot" aria-hidden="true" />
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        {lastLogin ? (
                          <div className="staff-datetime">
                            <strong>{lastLogin.date}</strong>
                            <span>{lastLogin.time}</span>
                          </div>
                        ) : (
                          <span className="staff-datetime is-empty">Chưa đăng nhập</span>
                        )}
                      </td>
                      <td>
                        {created ? (
                          <div className="staff-datetime">
                            <strong>{created.date}</strong>
                            <span>{created.time}</span>
                          </div>
                        ) : (
                          <span className="staff-datetime is-empty">—</span>
                        )}
                      </td>
                      <td>{createdByText(item)}</td>
                      <td className="action-cell">
                        <div className="staff-row-menu" ref={rowMenuOpen === id ? rowMenuRef : null}>
                          <button
                            className={`icon-button${rowMenuOpen === id ? ' is-open' : ''}`}
                            type="button"
                            aria-label={`Thao tác nhân viên ${item.name || item.email || ''}`}
                            aria-expanded={rowMenuOpen === id}
                            onClick={(event) => { event.stopPropagation(); toggleRowMenu(item, event); }}
                          >
                            <MoreHorizontal size={17} />
                          </button>
                          {rowMenuOpen === id && rowMenuPos && createPortal(
                            <div
                              ref={rowMenuPanelRef}
                              className="dropdown-menu staff-row-menu-panel"
                              style={{ position: 'fixed', top: rowMenuPos.top, left: rowMenuPos.left, right: 'auto', zIndex: 240 }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button className="dropdown-item" type="button" onClick={() => { setRowMenuOpen(null); openEdit(item); }}><Edit3 size={15} /> Sửa thông tin</button>
                              <button className="dropdown-item" type="button" onClick={() => { setRowMenuOpen(null); void toggleStatus(item); }}>{locked ? <Unlock size={15} /> : <Lock size={15} />} {locked ? 'Mở khóa' : 'Khóa'}</button>
                              <button className="dropdown-item" type="button" onClick={() => { setRowMenuOpen(null); setResetTarget(item); }}><KeyRound size={15} /> Reset mật khẩu</button>
                              <button className="dropdown-item danger" type="button" onClick={() => { setRowMenuOpen(null); setDeleteTarget(item); }}><Trash2 size={15} /> Xóa</button>
                            </div>,
                            document.body,
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td className="empty-cell staff-empty" colSpan={9}>
                      <div className="staff-empty-icon" aria-hidden="true">
                        <Users size={24} />
                      </div>
                      <strong>{loading ? 'Đang tải danh sách…' : hasActiveFilters ? 'Không tìm thấy nhân viên phù hợp' : 'Chưa có tài khoản nhân viên'}</strong>
                      <span>
                        {loading
                          ? 'Vui lòng chờ trong giây lát.'
                          : hasActiveFilters
                            ? 'Thử đổi từ khóa, kho hoặc trạng thái, hoặc xóa bộ lọc.'
                            : 'Tạo tài khoản EMPLOYEE đầu tiên để bắt đầu quản lý.'}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'stats' && (
        <section className="data-card staff-stats-card">
          <div className="data-card-header">
            <div className="staff-section-title">
              <h2>Thống kê nhân viên</h2>
              <p className="staff-section-desc">Theo dõi doanh số, thu chi và hoạt động gần đây theo từng nhân viên từ dữ liệu thật.</p>
              <div className="staff-accounts-meta">
                <span className="record-badge">Dữ liệu database</span>
                {selectedStaff && <span className="record-badge">{selectedStaff.name || selectedStaff.email}</span>}
              </div>
            </div>
            <button className="btn btn-light" type="button" disabled={loading || !selectedStaffId} onClick={() => void loadStats()}>
              <RefreshCw size={14} /> Tải thống kê
            </button>
          </div>

          <div className="staff-filter-bar staff-stats-filter-bar">
            <label className="staff-filter-field">
              <span>Nhân viên</span>
              <select
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
                aria-label="Chọn nhân viên"
              >
                {staff.length === 0 && <option value="">Chưa có nhân viên</option>}
                {staff.map((item) => (
                  <option key={getId(item)} value={getId(item)}>
                    {item.name || 'Chưa đặt tên'} — {item.email || 'không email'}
                  </option>
                ))}
              </select>
            </label>
            <label className="staff-filter-field">
              <span>Từ ngày</span>
              <div className="staff-date-field">
                <Calendar size={14} aria-hidden="true" />
                <input
                  type="date"
                  value={statsFilters.from}
                  onChange={(event) => setStatsFilters((current) => ({ ...current, from: event.target.value }))}
                  aria-label="Từ ngày"
                />
              </div>
            </label>
            <label className="staff-filter-field">
              <span>Đến ngày</span>
              <div className="staff-date-field">
                <Calendar size={14} aria-hidden="true" />
                <input
                  type="date"
                  value={statsFilters.to}
                  onChange={(event) => setStatsFilters((current) => ({ ...current, to: event.target.value }))}
                  aria-label="Đến ngày"
                />
              </div>
            </label>
            <div className="staff-filter-actions">
              <button
                className="btn btn-light staff-filter-clear"
                type="button"
                disabled={!statsFilters.from && !statsFilters.to}
                onClick={() => setStatsFilters({ from: '', to: '' })}
              >
                <X size={14} /> Xóa ngày
              </button>
              <button className="btn btn-primary" type="button" disabled={loading || !selectedStaffId} onClick={() => void loadStats()}>
                <BarChart3 size={14} /> Lọc thống kê
              </button>
            </div>
          </div>

          {selectedStaff && (
            <div className="staff-profile-strip">
              <div className="staff-person">
                <div className={`staff-avatar${selectedStaff.status === 'LOCKED' ? ' is-locked' : ''}`} aria-hidden="true">
                  {staffInitials(selectedStaff.name, selectedStaff.email)}
                </div>
                <div className="staff-person-text">
                  <strong>{selectedStaff.name || 'Chưa đặt tên'}</strong>
                  <small title={selectedStaff.email || ''}>{selectedStaff.email || 'Chưa có email'}</small>
                </div>
              </div>
              <div className="staff-profile-meta">
                <span className="staff-profile-item">
                  <Building2 size={13} aria-hidden="true" />
                  <span>Kho: <strong>{assignedWarehouseText(selectedStaff)}</strong></span>
                </span>
                <span className="staff-profile-item">
                  <span className={`staff-status ${selectedStaff.status === 'LOCKED' ? 'is-locked' : 'is-active'}`}>
                    <span className="staff-status-dot" aria-hidden="true" />
                    {statusLabel(selectedStaff.status)}
                  </span>
                </span>
                <span className="staff-profile-item">
                  <Activity size={13} aria-hidden="true" />
                  <span>Đăng nhập: <strong>{formatDate(selectedStaff.lastLoginAt)}</strong></span>
                </span>
              </div>
            </div>
          )}

          {stats ? (
            <div className="metric-row staff-metric-row staff-stats-metrics">
              <div className="metric-card staff-metric-card">
                <div className="staff-metric-icon" aria-hidden="true"><ShoppingBag size={16} /></div>
                <div className="staff-metric-body">
                  <span>Hóa đơn bán lẻ</span>
                  <strong>{formatMoney(stats.summary?.salesCount)}</strong>
                </div>
              </div>
              <div className="metric-card staff-metric-card success">
                <div className="staff-metric-icon" aria-hidden="true"><DollarSign size={16} /></div>
                <div className="staff-metric-body">
                  <span>Doanh thu</span>
                  <strong>{formatMoney(stats.summary?.revenue)}</strong>
                </div>
              </div>
              <div className="metric-card staff-metric-card">
                <div className="staff-metric-icon" aria-hidden="true"><CreditCard size={16} /></div>
                <div className="staff-metric-body">
                  <span>Đã thu</span>
                  <strong>{formatMoney(stats.summary?.paid)}</strong>
                </div>
              </div>
              <div className="metric-card staff-metric-card warning">
                <div className="staff-metric-icon" aria-hidden="true"><Receipt size={16} /></div>
                <div className="staff-metric-body">
                  <span>Công nợ</span>
                  <strong>{formatMoney(stats.summary?.debt)}</strong>
                </div>
              </div>
              <div className="metric-card staff-metric-card danger">
                <div className="staff-metric-icon" aria-hidden="true"><RotateCcw size={16} /></div>
                <div className="staff-metric-body">
                  <span>Trả hàng</span>
                  <strong>{formatMoney(stats.summary?.refundCount)}</strong>
                </div>
              </div>
            </div>
          ) : (
            !loading && selectedStaffId && (
              <div className="staff-stats-placeholder">
                <div className="staff-empty-icon" aria-hidden="true"><BarChart3 size={22} /></div>
                <strong>Chưa tải thống kê</strong>
                <span>Chọn khoảng thời gian (nếu cần) rồi bấm “Lọc thống kê” để xem số liệu.</span>
              </div>
            )
          )}

          <div className="staff-activity-head">
            <div>
              <h3>Hoạt động gần đây</h3>
              <p>Nhật ký thao tác của nhân viên trong hệ thống.</p>
            </div>
            <span className="record-badge">{activity.length} bản ghi</span>
          </div>

          <div className="table-scroll">
            <table className="data-table compact staff-accounts-table staff-activity-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Hành động</th>
                  <th>Module</th>
                  <th>Tài nguyên</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item) => {
                  const when = formatDateParts(item.createdAt);
                  return (
                    <tr key={item._id}>
                      <td>
                        {when ? (
                          <div className="staff-datetime">
                            <strong>{when.date}</strong>
                            <span>{when.time}</span>
                          </div>
                        ) : (
                          <span className="staff-datetime is-empty">—</span>
                        )}
                      </td>
                      <td>
                        <span className="staff-activity-action">{item.action || '—'}</span>
                      </td>
                      <td>
                        <span className="staff-activity-module">{item.module || '—'}</span>
                      </td>
                      <td className="staff-activity-resource">{item.resource || item.resourceId || '—'}</td>
                    </tr>
                  );
                })}
                {activity.length === 0 && (
                  <tr>
                    <td className="empty-cell staff-empty" colSpan={4}>
                      <div className="staff-empty-icon" aria-hidden="true">
                        <Activity size={22} />
                      </div>
                      <strong>{loading ? 'Đang tải hoạt động…' : 'Chưa có hoạt động gần đây'}</strong>
                      <span>
                        {loading
                          ? 'Vui lòng chờ trong giây lát.'
                          : 'Khi nhân viên thao tác trên hệ thống, nhật ký sẽ hiển thị tại đây.'}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card modal-card-wide" onSubmit={updateStaff}>
            <div className="modal-header"><div><h2>Sửa nhân viên</h2><p>Cập nhật thông tin cơ bản, trạng thái và kho được phân công.</p></div></div>
            <div className="form-grid">
              <label className="form-field"><span>Tên nhân viên *</span><input required value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="form-field"><span>Email *</span><input required type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label className="form-field"><span>Số điện thoại</span><input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label className="form-field"><span>Trạng thái</span><select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as Status }))}><option value="ACTIVE">ACTIVE</option><option value="LOCKED">LOCKED</option></select></label>
              <WarehousePicker
                warehouses={warehouses}
                selectedIds={editForm.assignedWarehouseIds}
                defaultId={editForm.defaultWarehouseId}
                onChange={(ids, def) => setEditForm((current) => ({ ...current, assignedWarehouseIds: ids, defaultWarehouseId: def }))}
              />
            </div>
            <div className="modal-footer"><button className="btn btn-light" type="button" onClick={() => setEditing(null)}>Hủy</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
          </form>
        </div>
      )}

      {resetTarget && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitResetPassword}>
            <div className="modal-header"><div><h2>Reset mật khẩu</h2><p>{resetTarget.name} - {resetTarget.email}</p></div></div>
            <div className="form-grid"><label className="form-field wide"><span>Mật khẩu mới *</span><input required minLength={6} type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label></div>
            <div className="modal-footer"><button className="btn btn-light" type="button" onClick={() => { setResetTarget(null); setResetPassword(''); }}>Hủy</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Đang reset...' : 'Reset mật khẩu'}</button></div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={deleteStaff}>
            <div className="modal-header"><div><h2>Xóa nhân viên</h2><p>{deleteTarget.name} - {deleteTarget.email}</p></div></div>
            <div className="form-grid">
              <div className="form-field wide">
                {deleteTarget.status === 'LOCKED' ? (
                  <>
                    <span style={{ color: 'var(--danger)' }}>Cảnh báo xóa tài khoản</span>
                    <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 700, lineHeight: 1.5 }}>Hành động này sẽ gỡ tài khoản nhân viên khỏi hệ thống và không thể hoàn tác. Dữ liệu nghiệp vụ (sản phẩm, đơn bán lẻ, bán sỉ, hoàn trả hàng...) được GIỮ NGUYÊN để bảo toàn lịch sử.</p>
                  </>
                ) : (
                  <>
                    <span style={{ color: '#b45309' }}>Chưa khóa tài khoản</span>
                    <p style={{ margin: 0, color: '#b45309', fontWeight: 700, lineHeight: 1.5 }}>Để xóa, bạn phải khóa tài khoản này trước. Khóa sẽ ngăn nhân viên đăng nhập và gọi API; dữ liệu nghiệp vụ vẫn được giữ lại.</p>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setDeleteTarget(null)}>Hủy</button>
              {deleteTarget.status === 'LOCKED'
                ? <button className="btn btn-danger" type="submit" disabled={saving}>{saving ? 'Đang xóa...' : 'Xóa tài khoản'}</button>
                : <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void lockForDelete()}>{saving ? 'Đang khóa...' : 'Khóa tài khoản'}</button>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function WarehousePicker({ warehouses, selectedIds, defaultId, onChange }: {
  warehouses: WarehouseOption[];
  selectedIds: string[];
  defaultId: string;
  onChange: (ids: string[], def: string) => void;
}) {
  const ids = selectedIds || [];
  const currentDefault = defaultId || ids[0] || '';
  const defaultWarehouse = warehouses.find((warehouse) => warehouse._id === currentDefault && ids.includes(warehouse._id));
  const defaultLabel = defaultWarehouse ? warehouseLabel(defaultWarehouse) : '';

  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    let nextDef = currentDefault;
    if (!next.includes(nextDef)) {
      nextDef = next[0] || '';
    }
    onChange(next, nextDef);
  };

  const setDefault = (id: string) => {
    const next = ids.includes(id) ? ids : [...ids, id];
    onChange(next, id);
  };

  return (
    <div className="form-field wide staff-wh-picker">
      <span>Kho được gán</span>
      <p className="staff-wh-subtitle">Không bắt buộc · có thể gán nhiều kho. Kho chính là kho mặc định khi nhân viên đăng nhập.</p>

      <div className={`staff-wh-summary ${ids.length ? 'has-selection' : ''}`} role="status">
        {ids.length === 0 ? (
          <span className="staff-wh-summary-text">Chưa gán kho nào</span>
        ) : (
          <span className="staff-wh-summary-text">
            Đã gán <strong>{ids.length}</strong> kho
            {defaultLabel ? <> · Kho chính: <strong>{defaultLabel}</strong></> : null}
          </span>
        )}
      </div>

      <div className="staff-wh-grid">
        {warehouses.map((warehouse) => {
          const isAssigned = ids.includes(warehouse._id);
          const isDefault = isAssigned && currentDefault === warehouse._id;
          return (
            <div
              key={warehouse._id}
              className={`staff-wh-card${isAssigned ? ' is-assigned' : ''}${isDefault ? ' is-default' : ''}`}
            >
              <button
                type="button"
                className="staff-wh-toggle"
                aria-pressed={isAssigned}
                onClick={() => toggle(warehouse._id)}
              >
                <span className={`staff-wh-check${isAssigned ? ' on' : ''}`} aria-hidden="true">
                  {isAssigned ? <Check size={14} strokeWidth={3} /> : null}
                </span>
                <span className="staff-wh-meta">
                  <span className="staff-wh-name">{warehouseLabel(warehouse)}</span>
                  <span className="staff-wh-state">{isAssigned ? 'Đã gán' : 'Bấm để gán'}</span>
                </span>
              </button>

              {isAssigned ? (
                <div className="staff-wh-default-row">
                  {isDefault ? (
                    <span className="staff-wh-default-badge">
                      <Star size={13} fill="currentColor" aria-hidden="true" />
                      Kho chính
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="staff-wh-default-btn"
                      onClick={() => setDefault(warehouse._id)}
                    >
                      <Star size={13} aria-hidden="true" />
                      Đặt làm kho chính
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        {warehouses.length === 0 && <p className="muted-copy">Không có kho active để gán cho nhân viên.</p>}
      </div>

      <p className="staff-wh-hint">
        <strong>Cách dùng:</strong> bấm thẻ kho để gán/bỏ gán → với kho đã gán, bấm “Đặt làm kho chính” nếu muốn đổi kho mặc định.
      </p>
    </div>
  );
}

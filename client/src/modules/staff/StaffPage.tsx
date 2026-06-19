import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Edit3, KeyRound, Lock, RefreshCw, ShieldCheck, Unlock, UserCog, Users, WalletCards } from 'lucide-react';
import { http } from '../../core/api/http';
import { isAdminRole } from '../../core/auth/access';

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
  { key: 'create', path: '/staff/create', label: 'Tao tai khoan', icon: UserCog },
  { key: 'accounts', path: '/staff/accounts', label: 'Danh sach tai khoan', icon: Users },
  { key: 'stats', path: '/staff/stats', label: 'Thong ke nhan vien', icon: WalletCards },
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

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function statusLabel(value?: string) {
  return value === 'LOCKED' ? 'Da khoa' : 'Dang hoat dong';
}

function warehouseLabel(warehouse: WarehouseOption) {
  return warehouse.code ? `${warehouse.name} (${warehouse.code})` : warehouse.name;
}

function assignedWarehouseIds(item: StaffAccount) {
  return (item.assignedWarehouseIds || []).map((warehouse) => String(warehouse._id || '')).filter(Boolean);
}

function assignedWarehouseText(item: StaffAccount) {
  const names = item.warehouseNames?.length
    ? item.warehouseNames
    : (item.assignedWarehouseIds || []).map((warehouse) => warehouseLabel(warehouse));
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
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [filters, setFilters] = useState<AccountFilters>({ keyword: '', warehouseId: '', status: '' });
  const [statsFilters, setStatsFilters] = useState({ from: '', to: '' });
  const [editing, setEditing] = useState<StaffAccount | null>(null);
  const [editForm, setEditForm] = useState<Omit<StaffForm, 'password' | 'confirmPassword'>>(emptyForm);
  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');

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
      setForm((current) => ({
        ...current,
        assignedWarehouseIds: current.assignedWarehouseIds.length ? current.assignedWarehouseIds : activeWarehouses[0]?._id ? [activeWarehouses[0]._id] : [],
        defaultWarehouseId: current.defaultWarehouseId || activeWarehouses[0]?._id || '',
      }));
      setReady(true);
    } catch (error) {
      setMessage(apiMessage(error, 'Khong the tai du lieu quan ly nhan vien.'));
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialData();
  }, [navigate]);

  const updateWarehouseSelection = (warehouseId: string, checked: boolean, target: 'create' | 'edit') => {
    const applySelection = (current: StaffForm | Omit<StaffForm, 'password' | 'confirmPassword'>) => {
      const nextIds = checked
        ? [...new Set([...current.assignedWarehouseIds, warehouseId])]
        : current.assignedWarehouseIds.filter((id) => id !== warehouseId);
      return {
        ...current,
        assignedWarehouseIds: nextIds,
        defaultWarehouseId: nextIds.includes(current.defaultWarehouseId) ? current.defaultWarehouseId : nextIds[0] || '',
      };
    };
    if (target === 'create') {
      setForm((current) => applySelection(current) as StaffForm);
    } else {
      setEditForm((current) => applySelection(current));
    }
  };

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (form.password !== form.confirmPassword) {
      setMessage('Mat khau xac nhan khong khop.');
      return;
    }
    if (form.assignedWarehouseIds.length === 0) {
      setMessage('Phai chon it nhat mot kho active cho nhan vien.');
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
        defaultWarehouseId: form.defaultWarehouseId || form.assignedWarehouseIds[0],
      });
      setMessage('Da tao tai khoan nhan vien.');
      setForm({ ...emptyForm, assignedWarehouseIds: form.assignedWarehouseIds, defaultWarehouseId: form.defaultWarehouseId });
      await loadStaff();
      navigate('/staff/accounts');
    } catch (error) {
      setMessage(apiMessage(error, 'Khong the tao tai khoan nhan vien.'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: StaffAccount) => {
    const ids = assignedWarehouseIds(item);
    setEditing(item);
    setEditForm({
      name: item.name || '',
      email: item.email || '',
      phone: item.phone || '',
      status: item.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
      assignedWarehouseIds: ids,
      defaultWarehouseId: typeof item.defaultWarehouseId === 'string'
        ? item.defaultWarehouseId
        : String(item.defaultWarehouseId?._id || ids[0] || ''),
    });
  };

  const updateStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || saving) return;
    if (editForm.assignedWarehouseIds.length === 0) {
      setMessage('Phai chon it nhat mot kho active cho nhan vien.');
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
        defaultWarehouseId: editForm.defaultWarehouseId || editForm.assignedWarehouseIds[0],
      });
      setMessage('Da cap nhat tai khoan nhan vien.');
      setEditing(null);
      await loadStaff();
    } catch (error) {
      setMessage(apiMessage(error, 'Khong the cap nhat nhan vien.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: StaffAccount) => {
    const action = item.status === 'LOCKED' ? 'open' : 'lock';
    const confirmText = action === 'lock'
      ? `Khoa tai khoan ${item.name || item.email}? Nhan vien se khong dang nhap/gọi API nghiep vu nua.`
      : `Mo khoa tai khoan ${item.name || item.email}?`;
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    try {
      await http.patch(`/staff/${getId(item)}/${action}`);
      setMessage(action === 'lock' ? 'Da khoa tai khoan nhan vien.' : 'Da mo khoa tai khoan nhan vien.');
      await loadStaff();
    } catch (error) {
      setMessage(apiMessage(error, 'Khong the cap nhat trang thai nhan vien.'));
    } finally {
      setSaving(false);
    }
  };

  const submitResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget || saving) return;
    if (resetPassword.length < 6) {
      setMessage('Mat khau moi phai co it nhat 6 ky tu.');
      return;
    }
    setSaving(true);
    try {
      await http.post(`/staff/${getId(resetTarget)}/reset-password`, { password: resetPassword });
      setMessage('Da reset mat khau nhan vien. Mat khau khong duoc tra ve tu API.');
      setResetPassword('');
      setResetTarget(null);
    } catch (error) {
      setMessage(apiMessage(error, 'Khong the reset mat khau nhan vien.'));
    } finally {
      setSaving(false);
    }
  };

  const loadStats = async () => {
    if (!selectedStaffId) return;
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
      setMessage(apiMessage(error, 'Khong the tai thong ke nhan vien.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && tab === 'stats') void loadStats();
  }, [ready, tab, selectedStaffId]);

  if (!ready) return <div className="workspace-page">Dang tai quan ly nhan vien...</div>;

  return (
    <div className="workspace-page">
      <div className="workspace-tabs" role="tablist" aria-label="Quan ly nhan vien">
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
            <h1>Quan ly nhan vien</h1>
            <p>ADMIN tao va quan ly EMPLOYEE, gan kho active va theo doi thong ke tu du lieu that.</p>
          </div>
        </div>
        <button className="btn btn-light" type="button" disabled={loading} onClick={() => void loadInitialData()}>
          <RefreshCw size={16} /> Lam moi
        </button>
      </div>

      {message && <div className="error-chip">{message}</div>}

      <div className="metric-row">
        <div className="metric-card"><span>Tong nhan vien</span><strong>{summary.total}</strong></div>
        <div className="metric-card success"><span>Dang hoat dong</span><strong>{summary.active}</strong></div>
        <div className="metric-card danger"><span>Da khoa</span><strong>{summary.locked}</strong></div>
      </div>

      {tab === 'create' && (
        <form className="data-card" onSubmit={createStaff}>
          <div className="data-card-header">
            <div>
              <h2>Tao tai khoan EMPLOYEE</h2>
              <span className="record-badge">Backend force role = EMPLOYEE</span>
            </div>
          </div>
          <div className="form-grid">
            <label className="form-field"><span>Ten nhan vien *</span><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="form-field"><span>Email *</span><input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="form-field"><span>Mat khau khoi tao *</span><input required minLength={6} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></label>
            <label className="form-field"><span>Xac nhan mat khau *</span><input required minLength={6} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
            <label className="form-field"><span>So dien thoai</span><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label className="form-field"><span>Trang thai</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Status }))}><option value="ACTIVE">ACTIVE</option><option value="LOCKED">LOCKED</option></select></label>
            <WarehousePicker warehouses={warehouses} selectedIds={form.assignedWarehouseIds} defaultId={form.defaultWarehouseId} onToggle={(id, checked) => updateWarehouseSelection(id, checked, 'create')} onDefault={(id) => setForm((current) => ({ ...current, defaultWarehouseId: id }))} />
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" type="button" onClick={() => setForm(emptyForm)}>Xoa form</button>
            <button className="btn btn-primary" type="submit" disabled={saving || warehouses.length === 0}>{saving ? 'Dang tao...' : 'Tao nhan vien'}</button>
          </div>
        </form>
      )}

      {tab === 'accounts' && (
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Danh sach tai khoan EMPLOYEE</h2>
              <span className="record-badge">{filteredStaff.length} / {staff.length} tai khoan</span>
            </div>
          </div>
          <div className="form-grid" style={{ paddingBottom: 0 }}>
            <label className="form-field"><span>Tu khoa</span><input value={filters.keyword} placeholder="Ten, email, so dien thoai" onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} /></label>
            <label className="form-field"><span>Kho duoc gan</span><select value={filters.warehouseId} onChange={(event) => setFilters((current) => ({ ...current, warehouseId: event.target.value }))}><option value="">Tat ca kho</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouseLabel(warehouse)}</option>)}</select></label>
            <label className="form-field"><span>Trang thai</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as AccountFilters['status'] }))}><option value="">Tat ca trang thai</option><option value="ACTIVE">ACTIVE</option><option value="LOCKED">LOCKED</option></select></label>
          </div>
          <div className="table-scroll">
            <table className="data-table compact">
              <thead><tr><th>Nhan vien</th><th>Email / phone</th><th>Role</th><th>Kho duoc gan</th><th>Trang thai</th><th>Dang nhap gan nhat</th><th>Ngay tao</th><th>Nguoi tao</th><th>Thao tac</th></tr></thead>
              <tbody>
                {filteredStaff.map((item) => (
                  <tr key={getId(item)}>
                    <td><strong>{item.name || '-'}</strong><small>{getId(item)}</small></td>
                    <td>{item.email || '-'}<small>{item.phone || '-'}</small></td>
                    <td><span className="record-badge">EMPLOYEE / Nhan vien</span></td>
                    <td>{assignedWarehouseText(item)}</td>
                    <td><span className={`status-badge ${item.status === 'LOCKED' ? 'danger' : 'success'}`}>{statusLabel(item.status)}</span></td>
                    <td>{formatDate(item.lastLoginAt)}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{createdByText(item)}</td>
                    <td className="action-cell">
                      <button className="mini-action" type="button" onClick={() => openEdit(item)}><Edit3 size={13} /> Sua</button>
                      <button className="mini-action" type="button" onClick={() => void toggleStatus(item)}>{item.status === 'LOCKED' ? <Unlock size={13} /> : <Lock size={13} />} {item.status === 'LOCKED' ? 'Mo' : 'Khoa'}</button>
                      <button className="mini-action" type="button" onClick={() => setResetTarget(item)}><KeyRound size={13} /> Reset</button>
                    </td>
                  </tr>
                ))}
                {filteredStaff.length === 0 && <tr><td className="empty-cell" colSpan={9}>{loading ? 'Dang tai...' : 'Khong co nhan vien phu hop.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'stats' && (
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Thong ke nhan vien</h2>
              <span className="record-badge">Du lieu tu database</span>
            </div>
            <button className="btn btn-light" type="button" onClick={() => void loadStats()}><RefreshCw size={16} /> Tai thong ke</button>
          </div>
          <div className="form-grid">
            <label className="form-field"><span>Nhan vien</span><select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)}>{staff.map((item) => <option key={getId(item)} value={getId(item)}>{item.name} - {item.email}</option>)}</select></label>
            <label className="form-field"><span>Tu ngay</span><input type="date" value={statsFilters.from} onChange={(event) => setStatsFilters((current) => ({ ...current, from: event.target.value }))} /></label>
            <label className="form-field"><span>Den ngay</span><input type="date" value={statsFilters.to} onChange={(event) => setStatsFilters((current) => ({ ...current, to: event.target.value }))} /></label>
            <div className="form-field"><span>&nbsp;</span><button className="btn btn-primary" type="button" onClick={() => void loadStats()}>Loc thong ke</button></div>
          </div>
          {selectedStaff && <div className="summary-strip"><span>Nhan vien: <strong>{selectedStaff.name}</strong></span><span>Kho: <strong>{assignedWarehouseText(selectedStaff)}</strong></span><span>Last login: <strong>{formatDate(selectedStaff.lastLoginAt)}</strong></span></div>}
          {stats && <div className="metric-row" style={{ padding: '0 18px 18px' }}>
            <div className="metric-card"><span>Hoa don ban le</span><strong>{formatMoney(stats.summary?.salesCount)}</strong></div>
            <div className="metric-card success"><span>Doanh thu</span><strong>{formatMoney(stats.summary?.revenue)}</strong></div>
            <div className="metric-card"><span>Da thu</span><strong>{formatMoney(stats.summary?.paid)}</strong></div>
            <div className="metric-card warning"><span>Cong no</span><strong>{formatMoney(stats.summary?.debt)}</strong></div>
            <div className="metric-card danger"><span>Tra hang</span><strong>{formatMoney(stats.summary?.refundCount)}</strong></div>
            <div className="metric-card"><span>Thu / chi</span><strong>{formatMoney(stats.summary?.receiptsValue)} / {formatMoney(stats.summary?.expensesValue)}</strong></div>
          </div>}
          <div className="table-scroll">
            <table className="data-table compact">
              <thead><tr><th>Thoi gian</th><th>Action</th><th>Module</th><th>Resource</th></tr></thead>
              <tbody>
                {activity.map((item) => <tr key={item._id}><td>{formatDate(item.createdAt)}</td><td>{item.action || '-'}</td><td>{item.module || '-'}</td><td>{item.resource || item.resourceId || '-'}</td></tr>)}
                {activity.length === 0 && <tr><td className="empty-cell" colSpan={4}>{loading ? 'Dang tai...' : 'Chua co hoat dong gan day.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card modal-card-wide" onSubmit={updateStaff}>
            <div className="modal-header"><div><h2>Sua nhan vien</h2><p>Cap nhat thong tin co ban, trang thai va kho duoc phan cong.</p></div></div>
            <div className="form-grid">
              <label className="form-field"><span>Ten nhan vien *</span><input required value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="form-field"><span>Email *</span><input required type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label className="form-field"><span>So dien thoai</span><input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label className="form-field"><span>Trang thai</span><select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as Status }))}><option value="ACTIVE">ACTIVE</option><option value="LOCKED">LOCKED</option></select></label>
              <WarehousePicker warehouses={warehouses} selectedIds={editForm.assignedWarehouseIds} defaultId={editForm.defaultWarehouseId} onToggle={(id, checked) => updateWarehouseSelection(id, checked, 'edit')} onDefault={(id) => setEditForm((current) => ({ ...current, defaultWarehouseId: id }))} />
            </div>
            <div className="modal-footer"><button className="btn btn-light" type="button" onClick={() => setEditing(null)}>Huy</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Dang luu...' : 'Luu thay doi'}</button></div>
          </form>
        </div>
      )}

      {resetTarget && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitResetPassword}>
            <div className="modal-header"><div><h2>Reset mat khau</h2><p>{resetTarget.name} - {resetTarget.email}</p></div></div>
            <div className="form-grid"><label className="form-field wide"><span>Mat khau moi *</span><input required minLength={6} type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label></div>
            <div className="modal-footer"><button className="btn btn-light" type="button" onClick={() => { setResetTarget(null); setResetPassword(''); }}>Huy</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Dang reset...' : 'Reset mat khau'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function WarehousePicker({ warehouses, selectedIds, defaultId, onToggle, onDefault }: {
  warehouses: WarehouseOption[];
  selectedIds: string[];
  defaultId: string;
  onToggle: (id: string, checked: boolean) => void;
  onDefault: (id: string) => void;
}) {
  return (
    <div className="form-field wide">
      <span>Kho duoc phan cong *</span>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {warehouses.map((warehouse) => {
          const checked = selectedIds.includes(warehouse._id);
          return (
            <label key={warehouse._id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={checked} onChange={(event) => onToggle(warehouse._id, event.target.checked)} />
              <span style={{ flex: 1, color: '#1e293b' }}>{warehouseLabel(warehouse)}</span>
              <input type="radio" name="defaultWarehouse" checked={defaultId === warehouse._id} disabled={!checked} onChange={() => onDefault(warehouse._id)} title="Kho mac dinh" />
            </label>
          );
        })}
        {warehouses.length === 0 && <p className="muted-copy">Khong co kho active de gan cho nhan vien.</p>}
      </div>
    </div>
  );
}

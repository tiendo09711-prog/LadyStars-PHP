import { type FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, History, Mail, RefreshCw, Save, Settings, Shield, Store } from 'lucide-react';
import { http } from '../../core/api/http';
import { isAdminRole } from '../../core/auth/access';

type StaffAccount = {
  _id: string;
  name: string;
  email: string;
  status: 'open' | 'lock';
};

type StoreForm = {
  shopName: string;
  logoUrl: string;
  address: string;
  phone: string;
  taxCode: string;
};

type OwnerAccountForm = {
  currentPassword: string;
  newEmail: string;
  newPassword: string;
};

const tabs = [
  { key: 'store', label: 'Cửa hàng', icon: Store },
  { key: 'security', label: 'Bảo mật', icon: Shield },
  { key: 'system', label: 'Quyền & menu', icon: Settings },
  { key: 'audit', label: 'Audit log', icon: History },
  { key: 'danger', label: 'Nguy hiểm', icon: AlertTriangle },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('store');
  const [message, setMessage] = useState('');
  const [storeForm, setStoreForm] = useState<StoreForm>({ shopName: 'LadyStars', logoUrl: '', address: '', phone: '', taxCode: '' });
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerAccountForm, setOwnerAccountForm] = useState<OwnerAccountForm>({ currentPassword: '', newEmail: '', newPassword: '' });
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [permissions, setPermissions] = useState<Record<string, any>[]>([]);
  const [roles, setRoles] = useState<Record<string, any>[]>([]);
  const [menus, setMenus] = useState<Record<string, any>[]>([]);
  const [auditLogs, setAuditLogs] = useState<Record<string, any>[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const visibleTabs = isAdmin ? tabs : tabs.filter((tab) => tab.key === 'store');

  const loadStore = async () => {
    const response = await http.get('/settings/store');
    setStoreForm({
      shopName: response.data.shopName ?? 'LadyStars',
      logoUrl: response.data.logoUrl ?? '',
      address: response.data.address ?? '',
      phone: response.data.phone ?? '',
      taxCode: response.data.taxCode ?? '',
    });
  };

  const loadStaff = async () => {
    const response = await http.get('/staff');
    const items = response.data.items ?? [];
    setStaff(items);
    if (!selectedStaffId && items[0]?._id) setSelectedStaffId(items[0]._id);
  };

  const loadOwnerAccount = async () => {
    const response = await http.get('/auth/me');
    setOwnerEmail(response.data.email ?? '');
  };

  const loadSystem = async () => {
    const [permissionResponse, roleResponse, menuResponse] = await Promise.all([
      http.get('/system/permissions'),
      http.get('/system/roles'),
      http.get('/system/menus'),
    ]);
    setPermissions(permissionResponse.data.items ?? []);
    setRoles(roleResponse.data.items ?? []);
    setMenus(menuResponse.data.items ?? []);
  };

  const loadAudit = async () => {
    const response = await http.get('/audit-logs', { params: { limit: 100 } });
    setAuditLogs(response.data.items ?? []);
  };

  useEffect(() => {
    loadStore();
    http.get('/auth/me').then((response) => {
      const admin = isAdminRole(response.data?.role);
      setIsAdmin(admin);
      if (admin) {
        setOwnerEmail(response.data.email ?? '');
        loadStaff();
      }
    });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'system') loadSystem();
    if (activeTab === 'audit' || activeTab === 'danger') loadAudit();
  }, [activeTab, isAdmin]);

  const saveStore = async (event: FormEvent) => {
    event.preventDefault();
    const response = await http.patch('/settings/store', storeForm);
    window.dispatchEvent(new CustomEvent('store-settings-updated', { detail: response.data }));
    setMessage('Đã lưu cấu hình cửa hàng.');
  };

  const changeOwnerAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!ownerAccountForm.newEmail && !ownerAccountForm.newPassword) {
      setMessage('Nhập email mới hoặc mật khẩu mới để cập nhật tài khoản Owner.');
      return;
    }
    try {
      const response = await http.post('/settings/security/change-owner-account', ownerAccountForm);
      if (response.data.token) localStorage.setItem('token', response.data.token);
      if (response.data.user) {
        setOwnerEmail(response.data.user.email ?? '');
        localStorage.setItem('lastLoginEmail', response.data.user.email ?? '');
        window.dispatchEvent(new CustomEvent('owner-account-updated', { detail: response.data.user }));
      }
      setOwnerAccountForm({ currentPassword: '', newEmail: '', newPassword: '' });
      setMessage('Đã cập nhật tài khoản Owner. Lần đăng nhập sau hãy dùng email mới.');
    } catch (err: any) {
      const apiMessage = err.response?.data?.message;
      if (apiMessage === 'Current password is incorrect') {
        setMessage('Mật khẩu hiện tại không đúng.');
      } else if (apiMessage === 'Email already exists') {
        setMessage('Email này đã được sử dụng bởi tài khoản khác.');
      } else {
        setMessage(apiMessage ?? 'Không thể cập nhật tài khoản Owner.');
      }
    }
  };

  const resetStaffPassword = async () => {
    if (!selectedStaffId || staffPassword.length < 6) {
      setMessage('Chọn nhân viên và nhập mật khẩu mới ít nhất 6 ký tự.');
      return;
    }
    await http.post('/settings/security/change-password', { userId: selectedStaffId, newPassword: staffPassword });
    setStaffPassword('');
    setMessage('Đã đặt lại mật khẩu nhân viên.');
  };

  const logoutStaffSessions = async () => {
    if (!selectedStaffId) return;
    await http.post('/settings/security/logout-user-sessions', { userId: selectedStaffId });
    setMessage('Đã khóa toàn bộ phiên đăng nhập hiện tại của nhân viên đã chọn.');
  };

  return (
    <div className="workspace-page compact-page">
      <div className="workspace-tabs" role="tablist" aria-label="Settings tabs">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button className={activeTab === tab.key ? 'active' : ''} key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}>
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="page-stack">
        <div className="page-heading">
          <div className="page-title-block">
            <div className="page-icon"><Settings size={24} /></div>
            <div>
              <h1>Thiết lập cài đặt</h1>
              <p>Khu vực Owner-only cho cấu hình cửa hàng, bảo mật, quyền, menu và nhật ký hệ thống.</p>
            </div>
          </div>
          <button className="btn btn-light" type="button" onClick={() => { loadStore(); if (isAdmin) { loadOwnerAccount(); loadStaff(); } }}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>

        {message && <div className="error-chip">{message}</div>}

        {activeTab === 'store' && (
          <form className="data-card" onSubmit={saveStore}>
            <div className="data-card-header">
              <div>
                <h2>Cấu hình cửa hàng</h2>
                <span className="record-badge">Áp dụng cho toàn bộ role</span>
              </div>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Tên shop *</span>
                <input required value={storeForm.shopName} onChange={(event) => setStoreForm((current) => ({ ...current, shopName: event.target.value }))} />
              </label>
              <label className="form-field">
                <span>Logo URL</span>
                <input value={storeForm.logoUrl} onChange={(event) => setStoreForm((current) => ({ ...current, logoUrl: event.target.value }))} />
              </label>
              <label className="form-field">
                <span>Số điện thoại</span>
                <input value={storeForm.phone} onChange={(event) => setStoreForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label className="form-field">
                <span>Mã số thuế</span>
                <input value={storeForm.taxCode} onChange={(event) => setStoreForm((current) => ({ ...current, taxCode: event.target.value }))} />
              </label>
              <label className="form-field wide">
                <span>Địa chỉ</span>
                <textarea rows={3} value={storeForm.address} onChange={(event) => setStoreForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" type="submit"><Save size={16} /> Lưu cấu hình</button>
            </div>
          </form>
        )}

        {isAdmin && activeTab === 'security' && (
          <div className="dashboard-columns">
            <form className="data-card" onSubmit={changeOwnerAccount}>
              <div className="data-card-header">
                <div>
                  <h2>Đổi email & mật khẩu Owner</h2>
                  <span className="record-badge">{ownerEmail || 'Owner'}</span>
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field wide">
                  <span>Mật khẩu hiện tại</span>
                  <input type="password" required value={ownerAccountForm.currentPassword} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, currentPassword: event.target.value }))} />
                </label>
                <label className="form-field wide">
                  <span>Email Owner mới</span>
                  <input type="email" placeholder={ownerEmail || 'admin@myerp.local'} value={ownerAccountForm.newEmail} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, newEmail: event.target.value }))} />
                </label>
                <label className="form-field wide">
                  <span>Mật khẩu mới</span>
                  <input type="password" minLength={6} value={ownerAccountForm.newPassword} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, newPassword: event.target.value }))} />
                </label>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" type="submit"><Mail size={16} /> Lưu tài khoản Owner</button>
              </div>
            </form>

            <section className="data-card">
              <div className="data-card-header"><h2>Nhân viên</h2></div>
              <div className="form-grid">
                <label className="form-field wide">
                  <span>Chọn nhân viên</span>
                  <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)}>
                    {staff.map((item) => <option key={item._id} value={item._id}>{item.name} - {item.email}</option>)}
                  </select>
                </label>
                <label className="form-field wide">
                  <span>Mật khẩu mới</span>
                  <input type="password" minLength={6} value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} />
                </label>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light" type="button" onClick={logoutStaffSessions}>Khóa phiên</button>
                <button className="btn btn-primary" type="button" onClick={resetStaffPassword}>Reset mật khẩu</button>
              </div>
            </section>
          </div>
        )}

        {isAdmin && activeTab === 'system' && (
          <div className="dashboard-columns">
            <SystemList title="Quyền" items={permissions} fields={['key', 'label', 'module']} />
            <SystemList title="Vai trò" items={roles} fields={['name', 'description', 'isSystem']} />
            <SystemList title="Menu" items={menus} fields={['label', 'path', 'permission']} />
          </div>
        )}

        {isAdmin && activeTab === 'audit' && <AuditTable items={auditLogs} />}

        {isAdmin && activeTab === 'danger' && (
          <section className="data-card">
            <div className="data-card-header">
              <div>
                <h2>Thao tác nguy hiểm</h2>
                <span className="record-badge">Owner only</span>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-field wide">
                <span>Nguyên tắc bảo vệ dữ liệu</span>
                <p className="muted-copy">Các thao tác xóa hoặc ảnh hưởng lớn sẽ bị ghi audit log. Tài khoản Staff chỉ được xóa mềm khi đang Lock, dữ liệu nghiệp vụ vẫn giữ lại để bảo toàn lịch sử.</p>
              </div>
              <label className="form-field">
                <span>Khóa phiên nhân viên</span>
                <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)}>
                  {staff.map((item) => <option key={item._id} value={item._id}>{item.name} - {item.email}</option>)}
                </select>
              </label>
              <div className="form-field">
                <span>&nbsp;</span>
                <button className="btn btn-primary" type="button" onClick={logoutStaffSessions}>Thực hiện</button>
              </div>
            </div>
            <AuditTable items={auditLogs.slice(0, 10)} />
          </section>
        )}
      </div>
    </div>
  );
}

function SystemList({ title, items, fields }: { title: string; items: Record<string, any>[]; fields: string[] }) {
  return (
    <section className="data-card">
      <div className="data-card-header">
        <div>
          <h2>{title}</h2>
          <span className="record-badge">{items.length} bản ghi</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table compact">
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>
                {fields.map((field) => <td key={field}>{String(item[field] ?? '-')}</td>)}
              </tr>
            ))}
            {items.length === 0 && <tr><td className="empty-cell">Chưa có dữ liệu.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditTable({ items }: { items: Record<string, any>[] }) {
  return (
    <section className="data-card">
      <div className="data-card-header">
        <div>
          <h2>Audit log</h2>
          <span className="record-badge">{items.length} bản ghi</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>
                <td><strong>{item.action}</strong><small>{item.module}</small></td>
                <td>{item.userName || item.userEmail || '-'}</td>
                <td>{item.resource || '-'}</td>
                <td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td className="empty-cell">Chưa có audit log.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

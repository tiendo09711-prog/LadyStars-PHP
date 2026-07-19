import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, History, Mail, RefreshCw, Save, Settings, Shield, Store } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import { isAdminRole } from '../../core/auth/access';
import './settings-page.css';

type TabKey = 'store' | 'security' | 'system' | 'audit' | 'danger';
type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

type StaffAccount = {
  _id: string;
  name: string;
  email: string;
  status: string;
  isActive?: boolean;
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
  confirmPassword: string;
};

type SystemRecord = {
  _id: string;
  [key: string]: unknown;
};

type AuditLog = {
  _id: string;
  action: string;
  module: string;
  userName?: string | null;
  userEmail?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  createdAt?: string | null;
};

type AuditFilters = {
  q: string;
  module: string;
  action: string;
  from: string;
  to: string;
};

const emptyStore: StoreForm = { shopName: 'LadyStars', logoUrl: '', address: '', phone: '', taxCode: '' };
const emptyOwnerForm: OwnerAccountForm = {
  currentPassword: '',
  newEmail: '',
  newPassword: '',
  confirmPassword: '',
};
const emptyAuditFilters: AuditFilters = { q: '', module: '', action: '', from: '', to: '' };

const tabs: Array<{ key: TabKey; label: string; icon: typeof Store }> = [
  { key: 'store', label: 'Cửa hàng', icon: Store },
  { key: 'security', label: 'Bảo mật', icon: Shield },
  { key: 'system', label: 'Quyền & menu', icon: Settings },
  { key: 'audit', label: 'Audit log', icon: History },
  { key: 'danger', label: 'Nguy hiểm', icon: AlertTriangle },
];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabs.some((tab) => tab.key === initialTab) ? initialTab as TabKey : 'store',
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRootOwner, setIsRootOwner] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');

  const [storeForm, setStoreForm] = useState<StoreForm>(emptyStore);
  const [savedStore, setSavedStore] = useState<StoreForm>(emptyStore);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeSaving, setStoreSaving] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState(false);

  const [ownerAccountForm, setOwnerAccountForm] = useState<OwnerAccountForm>(emptyOwnerForm);
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffPasswordConfirm, setStaffPasswordConfirm] = useState('');
  const [staffAction, setStaffAction] = useState<'password' | 'sessions' | null>(null);

  const [permissions, setPermissions] = useState<SystemRecord[]>([]);
  const [roles, setRoles] = useState<SystemRecord[]>([]);
  const [menus, setMenus] = useState<SystemRecord[]>([]);
  const [systemLoading, setSystemLoading] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditDraft, setAuditDraft] = useState<AuditFilters>(emptyAuditFilters);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(emptyAuditFilters);

  const storeDirty = useMemo(
    () => JSON.stringify(storeForm) !== JSON.stringify(savedStore),
    [savedStore, storeForm],
  );

  const loadStore = async () => {
    setStoreLoading(true);
    try {
      const response = await http.get<StoreForm>('/settings/store');
      const nextStore = {
        shopName: response.data.shopName ?? 'LadyStars',
        logoUrl: response.data.logoUrl ?? '',
        address: response.data.address ?? '',
        phone: response.data.phone ?? '',
        taxCode: response.data.taxCode ?? '',
      };
      setStoreForm(nextStore);
      setSavedStore(nextStore);
      setLogoPreviewError(false);
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể tải cấu hình cửa hàng.') });
    } finally {
      setStoreLoading(false);
    }
  };

  const loadIdentity = async () => {
    setIdentityLoading(true);
    try {
      const response = await http.get('/auth/me');
      setIsAdmin(isAdminRole(response.data?.role));
      setIsRootOwner(Boolean(response.data?.isRootOwner));
      setOwnerEmail(response.data?.email ?? '');
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể xác minh tài khoản hiện tại.') });
    } finally {
      setIdentityLoading(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const response = await http.get<{ items?: StaffAccount[] }>('/settings/security/staff');
      const items = response.data.items ?? [];
      setStaff(items);
      setSelectedStaffId((current) => items.some((item) => item._id === current) ? current : items[0]?._id ?? '');
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể tải danh sách nhân viên.') });
    } finally {
      setStaffLoading(false);
    }
  };

  const loadSystem = async () => {
    setSystemLoading(true);
    try {
      const [permissionResponse, roleResponse, menuResponse] = await Promise.all([
        http.get<{ items?: SystemRecord[] }>('/system/permissions'),
        http.get<{ items?: SystemRecord[] }>('/system/roles'),
        http.get<{ items?: SystemRecord[] }>('/system/menus'),
      ]);
      setPermissions(permissionResponse.data.items ?? []);
      setRoles(roleResponse.data.items ?? []);
      setMenus(menuResponse.data.items ?? []);
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể tải dữ liệu quyền, vai trò và menu.') });
    } finally {
      setSystemLoading(false);
    }
  };

  const loadAudit = async (page = auditPage, filters = auditFilters) => {
    setAuditLoading(true);
    try {
      const response = await http.get<{
        items?: AuditLog[];
        total?: number;
        totalPages?: number;
      }>('/audit-logs', {
        params: { page, limit: 50, ...filters },
      });
      setAuditLogs(response.data.items ?? []);
      setAuditTotal(response.data.total ?? 0);
      setAuditTotalPages(response.data.totalPages ?? 1);
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể tải audit log.') });
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadIdentity(), loadStore()]);
  }, []);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabs.some((tab) => tab.key === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl as TabKey);
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'security' || activeTab === 'danger') void loadStaff();
    if (activeTab === 'system') void loadSystem();
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (!isAdmin || (activeTab !== 'audit' && activeTab !== 'danger')) return;
    void loadAudit(auditPage, auditFilters);
  }, [activeTab, auditFilters, auditPage, isAdmin]);

  const selectTab = (key: TabKey, focus = false) => {
    setActiveTab(key);
    setSearchParams({ tab: key }, { replace: true });
    setNotice(null);
    if (focus) {
      const index = tabs.findIndex((tab) => tab.key === key);
      window.requestAnimationFrame(() => tabRefs.current[index]?.focus());
    }
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[nextIndex].key, true);
  };

  const refreshActiveTab = async () => {
    setNotice(null);
    await loadIdentity();
    if (activeTab === 'store') await loadStore();
    if (activeTab === 'security' || activeTab === 'danger') await loadStaff();
    if (activeTab === 'system') await loadSystem();
    if (activeTab === 'audit' || activeTab === 'danger') await loadAudit();
  };

  const saveStore = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setStoreSaving(true);
    try {
      const response = await http.patch<StoreForm>('/settings/store', storeForm);
      setStoreForm(response.data);
      setSavedStore(response.data);
      window.dispatchEvent(new CustomEvent('store-settings-updated', { detail: response.data }));
      setNotice({ tone: 'success', text: 'Đã lưu cấu hình cửa hàng và ghi audit log.' });
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể lưu cấu hình cửa hàng.') });
    } finally {
      setStoreSaving(false);
    }
  };

  const changeOwnerAccount = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (!ownerAccountForm.newEmail && !ownerAccountForm.newPassword) {
      setNotice({ tone: 'error', text: 'Nhập email mới hoặc mật khẩu mới.' });
      return;
    }
    if (ownerAccountForm.newPassword !== ownerAccountForm.confirmPassword) {
      setNotice({ tone: 'error', text: 'Xác nhận mật khẩu mới không khớp.' });
      return;
    }
    if (!window.confirm('Cập nhật tài khoản Root Owner và thu hồi phiên đăng nhập cũ?')) return;

    setOwnerSaving(true);
    try {
      const response = await http.post('/settings/security/change-owner-account', {
        currentPassword: ownerAccountForm.currentPassword,
        newEmail: ownerAccountForm.newEmail,
        newPassword: ownerAccountForm.newPassword,
      });
      if (response.data.token) localStorage.setItem('token', response.data.token);
      if (response.data.user) {
        setOwnerEmail(response.data.user.email ?? '');
        localStorage.setItem('lastLoginEmail', response.data.user.email ?? '');
        localStorage.setItem('authUser', JSON.stringify(response.data.user));
        window.dispatchEvent(new CustomEvent('owner-account-updated', { detail: response.data.user }));
      }
      setOwnerAccountForm(emptyOwnerForm);
      setNotice({ tone: 'success', text: 'Đã cập nhật Root Owner và thu hồi toàn bộ phiên cũ.' });
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể cập nhật tài khoản Root Owner.') });
    } finally {
      setOwnerSaving(false);
    }
  };

  const resetStaffPassword = async () => {
    setNotice(null);
    if (!selectedStaffId || staffPassword.length < 8) {
      setNotice({ tone: 'error', text: 'Chọn nhân viên và nhập mật khẩu mới ít nhất 8 ký tự.' });
      return;
    }
    if (staffPassword !== staffPasswordConfirm) {
      setNotice({ tone: 'error', text: 'Xác nhận mật khẩu nhân viên không khớp.' });
      return;
    }
    if (!window.confirm('Đặt lại mật khẩu và thu hồi toàn bộ phiên hiện tại của nhân viên này?')) return;

    setStaffAction('password');
    try {
      await http.post('/settings/security/change-password', { userId: selectedStaffId, newPassword: staffPassword });
      setStaffPassword('');
      setStaffPasswordConfirm('');
      setNotice({ tone: 'success', text: 'Đã đặt lại mật khẩu và thu hồi phiên cũ của nhân viên.' });
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể đặt lại mật khẩu nhân viên.') });
    } finally {
      setStaffAction(null);
    }
  };

  const logoutStaffSessions = async () => {
    setNotice(null);
    if (!selectedStaffId) {
      setNotice({ tone: 'error', text: 'Chưa có nhân viên được chọn.' });
      return;
    }
    if (!window.confirm('Thu hồi toàn bộ phiên đăng nhập của nhân viên đã chọn?')) return;

    setStaffAction('sessions');
    try {
      await http.post('/settings/security/logout-user-sessions', { userId: selectedStaffId });
      setNotice({ tone: 'success', text: 'Đã thu hồi toàn bộ phiên đăng nhập của nhân viên.' });
      if (activeTab === 'danger') await loadAudit(1, auditFilters);
    } catch (error) {
      setNotice({ tone: 'error', text: apiError(error, 'Không thể thu hồi phiên nhân viên.') });
    } finally {
      setStaffAction(null);
    }
  };

  const applyAuditFilters = (event: FormEvent) => {
    event.preventDefault();
    setAuditPage(1);
    setAuditFilters(auditDraft);
  };

  const resetAuditFilters = () => {
    setAuditDraft(emptyAuditFilters);
    setAuditPage(1);
    setAuditFilters(emptyAuditFilters);
  };

  if (identityLoading) {
    return <div className="settings-page settings-loading" role="status">Đang xác minh quyền truy cập cài đặt...</div>;
  }

  if (!isAdmin) {
    return <div className="settings-page settings-notice error" role="alert">Bạn không có quyền truy cập khu vực cài đặt.</div>;
  }

  return (
    <div className="workspace-page compact-page settings-page">
      <div className="workspace-tabs" role="tablist" aria-label="Settings tabs">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.key;
          return (
            <button
              ref={(element) => { tabRefs.current[index] = element; }}
              className={selected ? 'active' : ''}
              id={`settings-tab-${tab.key}`}
              aria-controls={`settings-panel-${tab.key}`}
              aria-selected={selected}
              role="tab"
              tabIndex={selected ? 0 : -1}
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
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
              <p>Quản lý cấu hình cửa hàng, bảo mật tài khoản, quyền hệ thống và lịch sử thao tác.</p>
            </div>
          </div>
          <button className="btn btn-light" type="button" onClick={() => void refreshActiveTab()} disabled={storeSaving || ownerSaving || staffAction !== null}>
            <RefreshCw size={16} /> Làm mới tab
          </button>
        </div>

        {notice && (
          <div className={`settings-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
            {notice.text}
          </div>
        )}

        {activeTab === 'store' && (
          <div role="tabpanel" id="settings-panel-store" aria-labelledby="settings-tab-store">
            <form className="data-card" onSubmit={saveStore} aria-busy={storeLoading || storeSaving}>
              <div className="data-card-header">
                <div>
                  <h2>Cấu hình cửa hàng</h2>
                  <span className="record-badge">Áp dụng toàn hệ thống</span>
                </div>
                {storeDirty && <span className="settings-dirty-badge">Chưa lưu</span>}
              </div>
              {storeLoading ? <LoadingBlock text="Đang tải cấu hình cửa hàng..." /> : (
                <>
                  <div className="form-grid">
                    <label className="form-field">
                      <span>Tên shop *</span>
                      <input required maxLength={150} value={storeForm.shopName} onChange={(event) => setStoreForm((current) => ({ ...current, shopName: event.target.value }))} />
                    </label>
                    <label className="form-field">
                      <span>Logo URL</span>
                      <input type="url" maxLength={2048} placeholder="https://..." value={storeForm.logoUrl} onChange={(event) => { setLogoPreviewError(false); setStoreForm((current) => ({ ...current, logoUrl: event.target.value })); }} />
                    </label>
                    <label className="form-field">
                      <span>Số điện thoại</span>
                      <input type="tel" maxLength={30} value={storeForm.phone} onChange={(event) => setStoreForm((current) => ({ ...current, phone: event.target.value }))} />
                    </label>
                    <label className="form-field">
                      <span>Mã số thuế</span>
                      <input maxLength={30} value={storeForm.taxCode} onChange={(event) => setStoreForm((current) => ({ ...current, taxCode: event.target.value }))} />
                    </label>
                    <label className="form-field wide">
                      <span>Địa chỉ</span>
                      <textarea rows={3} maxLength={1000} value={storeForm.address} onChange={(event) => setStoreForm((current) => ({ ...current, address: event.target.value }))} />
                    </label>
                    {storeForm.logoUrl && (
                      <div className="form-field wide settings-logo-preview">
                        <span>Xem trước logo</span>
                        {logoPreviewError
                          ? <p className="muted-copy">Không thể tải logo từ URL hiện tại.</p>
                          : <img src={storeForm.logoUrl} alt="Xem trước logo cửa hàng" onError={() => setLogoPreviewError(true)} />}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-light" type="button" disabled={!storeDirty || storeSaving} onClick={() => { setStoreForm(savedStore); setLogoPreviewError(false); }}>Hoàn tác</button>
                    <button className="btn btn-primary" type="submit" disabled={!storeDirty || storeSaving}>
                      <Save size={16} /> {storeSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="dashboard-columns" role="tabpanel" id="settings-panel-security" aria-labelledby="settings-tab-security">
            {isRootOwner ? (
              <form className="data-card" onSubmit={changeOwnerAccount} aria-busy={ownerSaving}>
                <div className="data-card-header">
                  <div>
                    <h2>Đổi email & mật khẩu Root Owner</h2>
                    <span className="record-badge">{ownerEmail || 'Root Owner'}</span>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="form-field wide">
                    <span>Mật khẩu hiện tại *</span>
                    <input type="password" required autoComplete="current-password" value={ownerAccountForm.currentPassword} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, currentPassword: event.target.value }))} />
                  </label>
                  <label className="form-field wide">
                    <span>Email Root Owner mới</span>
                    <input type="email" autoComplete="email" placeholder={ownerEmail} value={ownerAccountForm.newEmail} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, newEmail: event.target.value }))} />
                  </label>
                  <label className="form-field wide">
                    <span>Mật khẩu mới</span>
                    <input type="password" minLength={8} autoComplete="new-password" value={ownerAccountForm.newPassword} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, newPassword: event.target.value }))} />
                  </label>
                  <label className="form-field wide">
                    <span>Xác nhận mật khẩu mới</span>
                    <input type="password" minLength={8} autoComplete="new-password" value={ownerAccountForm.confirmPassword} onChange={(event) => setOwnerAccountForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                  </label>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-primary" type="submit" disabled={ownerSaving}>
                    <Mail size={16} /> {ownerSaving ? 'Đang cập nhật...' : 'Lưu tài khoản Root Owner'}
                  </button>
                </div>
              </form>
            ) : (
              <section className="data-card settings-restricted-card">
                <div className="data-card-header"><h2>Tài khoản Root Owner</h2></div>
                <div className="settings-card-copy">
                  <Shield size={28} />
                  <p>Chỉ Root Owner được đổi email hoặc mật khẩu Owner. Admin vẫn có thể quản lý phiên và mật khẩu nhân viên.</p>
                </div>
              </section>
            )}

            <StaffSecurityCard
              staff={staff}
              loading={staffLoading}
              selectedStaffId={selectedStaffId}
              staffPassword={staffPassword}
              staffPasswordConfirm={staffPasswordConfirm}
              action={staffAction}
              onSelect={setSelectedStaffId}
              onPassword={setStaffPassword}
              onPasswordConfirm={setStaffPasswordConfirm}
              onResetPassword={() => void resetStaffPassword()}
              onRevokeSessions={() => void logoutStaffSessions()}
            />
          </div>
        )}

        {activeTab === 'system' && (
          <div role="tabpanel" id="settings-panel-system" aria-labelledby="settings-tab-system">
            {systemLoading ? <LoadingBlock text="Đang tải quyền, vai trò và menu..." /> : (
              <div className="settings-system-grid">
                <SystemList title="Quyền" items={permissions} fields={[['key', 'Mã quyền'], ['label', 'Tên quyền'], ['module', 'Module']]} />
                <SystemList title="Vai trò" items={roles} fields={[['name', 'Vai trò'], ['description', 'Mô tả'], ['isSystem', 'Hệ thống']]} />
                <SystemList title="Menu" items={menus} fields={[['label', 'Nhãn'], ['path', 'Đường dẫn'], ['permission', 'Quyền yêu cầu']]} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div role="tabpanel" id="settings-panel-audit" aria-labelledby="settings-tab-audit" className="settings-audit-stack">
            <AuditFiltersForm draft={auditDraft} onChange={setAuditDraft} onSubmit={applyAuditFilters} onReset={resetAuditFilters} loading={auditLoading} />
            <AuditTable items={auditLogs} total={auditTotal} loading={auditLoading} />
            <Pagination page={auditPage} totalPages={auditTotalPages} disabled={auditLoading} onChange={setAuditPage} />
          </div>
        )}

        {activeTab === 'danger' && (
          <section className="data-card settings-danger-card" role="tabpanel" id="settings-panel-danger" aria-labelledby="settings-tab-danger">
            <div className="data-card-header">
              <div>
                <h2>Thao tác nhạy cảm</h2>
                <span className="record-badge">Admin / Root Owner</span>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-field wide settings-danger-note">
                <AlertTriangle size={24} />
                <div>
                  <strong>Thu hồi phiên có hiệu lực ngay</strong>
                  <p className="muted-copy">Token hiện tại của nhân viên sẽ hết hiệu lực. Thao tác được ghi audit log và không xóa dữ liệu nghiệp vụ.</p>
                </div>
              </div>
              <label className="form-field">
                <span>Nhân viên</span>
                <select disabled={staffLoading || staff.length === 0 || staffAction !== null} value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)}>
                  {staff.length === 0 && <option value="">Chưa có nhân viên</option>}
                  {staff.map((item) => <option key={item._id} value={item._id}>{item.name} — {item.email}</option>)}
                </select>
              </label>
              <div className="form-field settings-action-field">
                <span>Thao tác</span>
                <button className="btn btn-primary" type="button" disabled={!selectedStaffId || staffAction !== null} onClick={() => void logoutStaffSessions()}>
                  {staffAction === 'sessions' ? 'Đang thu hồi...' : 'Thu hồi toàn bộ phiên'}
                </button>
              </div>
            </div>
            <AuditTable items={auditLogs.slice(0, 10)} total={Math.min(auditTotal, 10)} loading={auditLoading} compact />
          </section>
        )}
      </div>
    </div>
  );
}

function StaffSecurityCard(props: {
  staff: StaffAccount[];
  loading: boolean;
  selectedStaffId: string;
  staffPassword: string;
  staffPasswordConfirm: string;
  action: 'password' | 'sessions' | null;
  onSelect: (value: string) => void;
  onPassword: (value: string) => void;
  onPasswordConfirm: (value: string) => void;
  onResetPassword: () => void;
  onRevokeSessions: () => void;
}) {
  const disabled = props.loading || props.staff.length === 0 || props.action !== null;
  return (
    <section className="data-card" aria-busy={props.loading || props.action !== null}>
      <div className="data-card-header"><h2>Bảo mật nhân viên</h2></div>
      {props.loading ? <LoadingBlock text="Đang tải nhân viên..." /> : (
        <>
          <div className="form-grid">
            <label className="form-field wide">
              <span>Chọn nhân viên</span>
              <select disabled={disabled} value={props.selectedStaffId} onChange={(event) => props.onSelect(event.target.value)}>
                {props.staff.length === 0 && <option value="">Chưa có nhân viên</option>}
                {props.staff.map((item) => <option key={item._id} value={item._id}>{item.name} — {item.email} ({item.status})</option>)}
              </select>
            </label>
            <label className="form-field wide">
              <span>Mật khẩu mới</span>
              <input type="password" minLength={8} autoComplete="new-password" disabled={disabled} value={props.staffPassword} onChange={(event) => props.onPassword(event.target.value)} />
            </label>
            <label className="form-field wide">
              <span>Xác nhận mật khẩu mới</span>
              <input type="password" minLength={8} autoComplete="new-password" disabled={disabled} value={props.staffPasswordConfirm} onChange={(event) => props.onPasswordConfirm(event.target.value)} />
            </label>
          </div>
          <div className="modal-footer">
            <button className="btn btn-light" type="button" disabled={disabled || !props.selectedStaffId} onClick={props.onRevokeSessions}>
              {props.action === 'sessions' ? 'Đang thu hồi...' : 'Thu hồi phiên'}
            </button>
            <button className="btn btn-primary" type="button" disabled={disabled || !props.selectedStaffId} onClick={props.onResetPassword}>
              {props.action === 'password' ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SystemList({ title, items, fields }: { title: string; items: SystemRecord[]; fields: Array<[string, string]> }) {
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
          <thead><tr>{fields.map(([field, label]) => <th key={field} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>{fields.map(([field]) => <td key={field}>{formatValue(item[field])}</td>)}</tr>
            ))}
            {items.length === 0 && <tr><td colSpan={fields.length} className="empty-cell">Chưa có dữ liệu.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditFiltersForm(props: {
  draft: AuditFilters;
  onChange: (filters: AuditFilters) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  loading: boolean;
}) {
  return (
    <form className="data-card settings-audit-filter" onSubmit={props.onSubmit}>
      <div className="data-card-header"><h2>Lọc audit log</h2></div>
      <div className="form-grid">
        <label className="form-field wide">
          <span>Từ khóa</span>
          <input maxLength={120} placeholder="Thao tác, người dùng, tài nguyên..." value={props.draft.q} onChange={(event) => props.onChange({ ...props.draft, q: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Module</span>
          <input maxLength={100} placeholder="settings, security..." value={props.draft.module} onChange={(event) => props.onChange({ ...props.draft, module: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Hành động</span>
          <input maxLength={100} placeholder="UPDATE_STORE_SETTINGS..." value={props.draft.action} onChange={(event) => props.onChange({ ...props.draft, action: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Từ ngày</span>
          <input type="date" value={props.draft.from} onChange={(event) => props.onChange({ ...props.draft, from: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Đến ngày</span>
          <input type="date" value={props.draft.to} onChange={(event) => props.onChange({ ...props.draft, to: event.target.value })} />
        </label>
      </div>
      <div className="modal-footer">
        <button className="btn btn-light" type="button" disabled={props.loading} onClick={props.onReset}>Đặt lại</button>
        <button className="btn btn-primary" type="submit" disabled={props.loading}>{props.loading ? 'Đang tải...' : 'Áp dụng'}</button>
      </div>
    </form>
  );
}

function AuditTable({ items, total, loading, compact = false }: { items: AuditLog[]; total: number; loading: boolean; compact?: boolean }) {
  return (
    <section className="data-card">
      <div className="data-card-header">
        <div>
          <h2>Audit log</h2>
          <span className="record-badge">{total} bản ghi</span>
        </div>
      </div>
      {loading ? <LoadingBlock text="Đang tải audit log..." /> : (
        <div className="table-scroll">
          <table className={`data-table ${compact ? 'compact' : ''}`}>
            <thead>
              <tr>
                <th scope="col">Hành động</th>
                <th scope="col">Người thực hiện</th>
                <th scope="col">Tài nguyên</th>
                <th scope="col">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  <td><strong>{item.action}</strong><small>{item.module}</small></td>
                  <td>{item.userName || item.userEmail || '-'}</td>
                  <td>{item.resource || '-'}{item.resourceId && <small>{item.resourceId}</small>}</td>
                  <td>{formatDate(item.createdAt)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={4} className="empty-cell">Chưa có audit log phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Pagination(props: { page: number; totalPages: number; disabled: boolean; onChange: (page: number) => void }) {
  return (
    <div className="settings-pagination" aria-label="Phân trang audit log">
      <button className="btn btn-light" type="button" disabled={props.disabled || props.page <= 1} onClick={() => props.onChange(props.page - 1)}>Trang trước</button>
      <span>Trang {props.page} / {props.totalPages}</span>
      <button className="btn btn-light" type="button" disabled={props.disabled || props.page >= props.totalPages} onClick={() => props.onChange(props.page + 1)}>Trang sau</button>
    </div>
  );
}

function LoadingBlock({ text }: { text: string }) {
  return <div className="settings-loading" role="status">{text}</div>;
}

function apiError(error: unknown, fallback: string): string {
  const value = error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
  const data = value.response?.data;
  const firstValidationError = data?.errors ? Object.values(data.errors).flat()[0] : undefined;
  return firstValidationError || data?.message || fallback;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('vi-VN');
}

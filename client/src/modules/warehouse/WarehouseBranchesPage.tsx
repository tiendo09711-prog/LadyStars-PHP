import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleOff,
  Info,
  KeyRound,
  LoaderCircle,
  MapPin,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Star,
  Store,
  Trash2,
  Warehouse,
} from 'lucide-react';
import {
  activateBranch,
  BranchRecord,
  buildInvoiceProfile,
  createBranch,
  deactivateBranch,
  deleteBranch,
  getBranch,
  getBranchUsage,
  getStoreSetting,
  listBranches,
  setDefaultBranch,
  StoreSettingRecord,
  updateBranch,
} from '../../core/api/branch.api';
import './warehouseBranchesPage.css';

type BranchFormState = {
  name: string;
  code: string;
  address: string;
  phone: string;
  invoiceProfile: {
    displayName: string;
    templateId: 'retail-a4-classic';
    footerText: string;
    showBranchName: boolean;
    showCashier: boolean;
    showProductCode: boolean;
    showLogo: boolean;
  };
};

type UsageSummary = Awaited<ReturnType<typeof getBranchUsage>>;
type ConfirmAction = 'create' | 'save' | 'set-default' | 'activate' | 'deactivate' | 'delete';

const DEFAULT_FOOTER = 'Cảm ơn quý khách đã mua hàng!';

const USAGE_LABELS: Record<string, string> = {
  productBranchStocks: 'Tồn kho theo chi nhánh',
  salePayments: 'Hóa đơn bán',
  productRefunds: 'Hóa đơn trả',
  inventoryVouchers: 'Phiếu nhập/xuất kho',
  inventoryProducts: 'Dòng XNK',
  warehouseTransferSource: 'Chuyển kho nguồn',
  warehouseTransferDestination: 'Chuyển kho đích',
  inventoryAudits: 'Kiểm kho',
  inventoryChecks: 'Biên bản kiểm kho cũ',
  inventoryCheckProducts: 'Dòng kiểm kho cũ',
  stockAdjustments: 'Điều chỉnh tồn kho',
  batches: 'Lô hàng',
  usersBranchId: 'Nhân viên có branchId',
  usersDefaultWarehouseId: 'Nhân viên có kho mặc định',
  usersAssignedWarehouseIds: 'Nhân viên được gán kho',
};

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function createEmptyForm(): BranchFormState {
  return {
    name: '',
    code: '',
    address: '',
    phone: '',
    invoiceProfile: {
      displayName: '',
      templateId: 'retail-a4-classic',
      footerText: DEFAULT_FOOTER,
      showBranchName: false,
      showCashier: true,
      showProductCode: false,
      showLogo: false,
    },
  };
}

function mapBranchToForm(branch?: BranchRecord | null): BranchFormState {
  const form = createEmptyForm();
  if (!branch) return form;
  return {
    name: branch.name || '',
    code: branch.code || '',
    address: branch.address || '',
    phone: branch.phone || '',
    invoiceProfile: {
      ...form.invoiceProfile,
      ...(branch.invoiceProfile || {}),
      displayName: branch.invoiceProfile?.displayName || '',
      footerText: trim(branch.invoiceProfile?.footerText) || DEFAULT_FOOTER,
      templateId: 'retail-a4-classic',
      showBranchName: Boolean(branch.invoiceProfile?.showBranchName),
      showCashier: branch.invoiceProfile?.showCashier !== false,
      showProductCode: Boolean(branch.invoiceProfile?.showProductCode),
      showLogo: Boolean(branch.invoiceProfile?.showLogo),
    },
  };
}

function actionTitle(action: ConfirmAction) {
  if (action === 'create') return 'Tạo kho hàng';
  if (action === 'save') return 'Lưu thay đổi';
  if (action === 'set-default') return 'Đặt làm kho mặc định';
  if (action === 'activate') return 'Kích hoạt lại kho';
  if (action === 'deactivate') return 'Ngừng hoạt động kho';
  return 'Xóa vĩnh viễn kho';
}

function actionWarning(action: ConfirmAction, branchName: string) {
  if (action === 'create') return `Bạn sắp tạo kho mới ${branchName || 'chưa đặt tên'}. Hệ thống sẽ không tự tạo tồn kho giả.`;
  if (action === 'save') return `Tên, địa chỉ, hotline và cấu hình in hóa đơn của ${branchName} sẽ được cập nhật cho chứng từ mới và bản in mới.`;
  if (action === 'set-default') return `${branchName} sẽ trở thành kho mặc định duy nhất cho các luồng tạo mới.`;
  if (action === 'activate') return `${branchName} sẽ xuất hiện trở lại trong các form tạo mới.`;
  if (action === 'deactivate') return `${branchName} sẽ bị ẩn khỏi các form tạo mới nhưng vẫn giữ nguyên lịch sử và chứng từ cũ.`;
  return `${branchName} chỉ được xóa khi không còn dữ liệu liên kết và không phải kho mặc định.`;
}

function previewHtml(branch: BranchRecord | null, form: BranchFormState, storeSetting: StoreSettingRecord) {
  const profile = buildInvoiceProfile(
    {
      _id: branch?._id || 'preview',
      name: form.name,
      code: form.code,
      address: form.address,
      phone: form.phone,
      invoiceProfile: form.invoiceProfile,
    },
    storeSetting,
  );

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>In thử mẫu hóa đơn</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #111827; }
      .page { display: flex; flex-direction: column; gap: 12px; }
      .meta { display: flex; justify-content: space-between; font-size: 12px; }
      .center { text-align: center; }
      h1 { margin: 0; font-size: 28px; }
      .sub { margin: 4px 0; }
      .dash { border-top: 1px dashed #94a3b8; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
      th:last-child, td:last-child { text-align: right; }
      .totals td { border: none; padding: 5px 0; }
      .footer { margin-top: 12px; text-align: center; }
      .small { font-size: 12px; color: #475569; }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="meta"><span>${new Date().toLocaleString('vi-VN')}</span><strong>Hóa đơn bán lẻ</strong></div>
      <div class="center">
        <h1>${profile.brandName}</h1>
        <div class="sub">${profile.address || '&nbsp;'}</div>
        <div class="sub">${profile.phone || '&nbsp;'}</div>
        ${profile.showBranchName && profile.branchName ? `<div class="small">Kho: ${profile.branchName}</div>` : ''}
      </div>
      <div class="dash"></div>
      <div class="center"><strong>HÓA ĐƠN BÁN HÀNG</strong></div>
      <div>Mã hóa đơn: HD-MAU-001</div>
      <div>Khách hàng: Khách lẻ</div>
      ${profile.showCashier ? '<div>Người lập phiếu: Thu ngân mẫu</div>' : ''}
      <table>
        <thead>
          <tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Đầm midi xếp ly${profile.showProductCode ? '<div class="small">SP-001</div>' : ''}</td>
            <td>1</td>
            <td>450.000</td>
            <td>450.000</td>
          </tr>
          <tr>
            <td>Áo sơ mi tay phồng${profile.showProductCode ? '<div class="small">SP-002</div>' : ''}</td>
            <td>2</td>
            <td>320.000</td>
            <td>640.000</td>
          </tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Tổng cộng</td><td>1.090.000</td></tr>
        <tr><td>Giảm giá</td><td>50.000</td></tr>
        <tr><td>Đã thanh toán</td><td>1.100.000</td></tr>
        <tr><td>Tiền trả lại</td><td>10.000</td></tr>
      </table>
      <div class="dash"></div>
      <div class="footer">${profile.footerText}</div>
    </main>
  </body>
</html>`;
}

export function WarehouseBranchesPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [storeSetting, setStoreSetting] = useState<StoreSettingRecord>({ shopName: 'LadyStars' });
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [form, setForm] = useState<BranchFormState>(createEmptyForm);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [usageByBranchId, setUsageByBranchId] = useState<Record<string, UsageSummary>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [adminPassword, setAdminPassword] = useState('');

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch._id === selectedBranchId) || null,
    [branches, selectedBranchId],
  );
  const selectedUsage = selectedBranchId ? usageByBranchId[selectedBranchId] : null;

  const previewProfile = buildInvoiceProfile(
    {
      _id: selectedBranch?._id || 'preview',
      name: form.name,
      code: form.code,
      address: form.address,
      phone: form.phone,
      invoiceProfile: form.invoiceProfile,
    },
    storeSetting,
  );

  const filteredBranches = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return branches.filter((branch) => {
      if (statusFilter === 'active' && branch.isActive === false) return false;
      if (statusFilter === 'inactive' && branch.isActive !== false) return false;
      if (!keyword) return true;
      return [branch.name, branch.code, branch.address, branch.phone]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(keyword));
    });
  }, [branches, searchQuery, statusFilter]);

  const loadStoreSetting = async () => {
    try {
      const data = await getStoreSetting();
      setStoreSetting(data || { shopName: 'LadyStars' });
    } catch {
      setStoreSetting({ shopName: 'LadyStars' });
    }
  };

  const loadBranchesData = async (nextSelectedId?: string) => {
    const data = await listBranches({ page: 1, limit: 200, includeInactive: true });
    setBranches(data.items || []);
    const preferredId = nextSelectedId
      || selectedBranchId
      || data.items?.find((branch) => branch.isDefault)?._id
      || data.items?.[0]?._id
      || '';
    setSelectedBranchId(preferredId);
    if (!isCreateMode && preferredId) {
      const selected = data.items.find((branch) => branch._id === preferredId) || null;
      setForm(mapBranchToForm(selected));
    }
    return data.items || [];
  };

  const loadBranchDetail = async (branchId: string) => {
    if (!branchId) return;
    setLoadingDetail(true);
    try {
      const detail = await getBranch(branchId, { includeInactive: true });
      setBranches((current) => current.map((branch) => (branch._id === branchId ? detail : branch)));
      if (!isCreateMode) setForm(mapBranchToForm(detail));
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadUsage = async (branchId = selectedBranchId) => {
    if (!branchId) return;
    setLoadingUsage(true);
    setError('');
    try {
      const usage = await getBranchUsage(branchId);
      setUsageByBranchId((current) => ({ ...current, [branchId]: usage }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được dữ liệu liên kết của kho hàng.');
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([loadStoreSetting(), loadBranchesData()])
      .catch((err: any) => {
        if (!mounted) return;
        setError(err.response?.data?.message || 'Không tải được cấu hình kho hàng.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      setAdminPassword('');
      setConfirmAction(null);
    };
  }, []);

  useEffect(() => {
    if (!selectedBranchId || isCreateMode) return;
    void loadBranchDetail(selectedBranchId);
  }, [selectedBranchId, isCreateMode]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openCreateMode = () => {
    setIsCreateMode(true);
    setSelectedBranchId('');
    setForm(createEmptyForm());
    setError('');
    setNotice('');
  };

  const selectBranch = (branchId: string) => {
    setIsCreateMode(false);
    setSelectedBranchId(branchId);
    const branch = branches.find((item) => item._id === branchId) || null;
    setForm(mapBranchToForm(branch));
  };

  const closeConfirmModal = () => {
    setConfirmAction(null);
    setAdminPassword('');
  };

  const submitAction = async () => {
    if (!confirmAction || !adminPassword.trim()) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (confirmAction === 'create') {
        const created = await createBranch({
          name: form.name,
          code: form.code,
          address: form.address,
          phone: form.phone,
          invoiceProfile: form.invoiceProfile,
          adminPassword,
        });
        setIsCreateMode(false);
        await loadBranchesData(created._id);
        setNotice('Đã tạo kho hàng mới.');
      } else if (confirmAction === 'save' && selectedBranchId) {
        const updated = await updateBranch(selectedBranchId, {
          name: form.name,
          address: form.address,
          phone: form.phone,
          invoiceProfile: form.invoiceProfile,
          adminPassword,
        });
        await loadBranchesData(updated._id);
        setNotice('Đã lưu thay đổi kho hàng.');
      } else if (confirmAction === 'set-default' && selectedBranchId) {
        const updated = await setDefaultBranch(selectedBranchId, adminPassword);
        await loadBranchesData(updated._id);
        setNotice('Đã cập nhật kho mặc định.');
      } else if (confirmAction === 'activate' && selectedBranchId) {
        const updated = await activateBranch(selectedBranchId, adminPassword);
        await loadBranchesData(updated._id);
        setNotice('Kho hàng đã được kích hoạt lại.');
      } else if (confirmAction === 'deactivate' && selectedBranchId) {
        const updated = await deactivateBranch(selectedBranchId, adminPassword);
        await loadBranchesData(updated._id);
        setNotice('Kho hàng đã được chuyển sang ngừng hoạt động.');
      } else if (confirmAction === 'delete' && selectedBranchId) {
        await deleteBranch(selectedBranchId, adminPassword);
        const remaining = await loadBranchesData('');
        const nextId = remaining.find((branch) => branch.isDefault)?._id || remaining[0]?._id || '';
        setSelectedBranchId(nextId);
        setIsCreateMode(false);
        if (nextId) {
          const branch = remaining.find((item) => item._id === nextId) || null;
          setForm(mapBranchToForm(branch));
        } else {
          setForm(createEmptyForm());
        }
        setNotice('Đã xóa kho hàng trống.');
      }
    } catch (err: any) {
      const responseMessage = err.response?.data?.message || 'Không thể thực hiện thao tác kho hàng.';
      const usage = err.response?.data?.usage;
      if (usage && selectedBranchId) {
        setUsageByBranchId((current) => ({ ...current, [selectedBranchId]: usage }));
      }
      setError(responseMessage);
    } finally {
      setSubmitting(false);
      closeConfirmModal();
    }
  };

  const printPreview = () => {
    const popup = window.open('about:blank', 'branch-invoice-preview', 'popup=yes,width=900,height=1200');
    if (!popup) return;
    popup.document.open();
    popup.document.write(previewHtml(selectedBranch, form, storeSetting));
    popup.document.close();
    popup.focus();
    popup.print();
  };

  if (loading) {
    return (
      <div className="warehouse-branches-page warehouse-branches-loading">
        <LoaderCircle className="spin" size={20} />
        <span>Đang tải cấu hình kho hàng...</span>
      </div>
    );
  }

  return (
    <div className="warehouse-branches-page">
      <div className="warehouse-branches-header card-shell">
        <div>
          <h1>Cấu hình kho hàng</h1>
          <p>Quản lý kho vận hành, dữ liệu chi nhánh và thông tin in hóa đơn.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreateMode}>
          <Plus size={16} /> Thêm kho hàng
        </button>
      </div>

      {error ? <div className="data-alert" role="alert">{error}</div> : null}
      {notice ? <div className="warehouse-branches-notice">{notice}</div> : null}

      <div className="warehouse-branches-layout">
        <aside className="card-shell warehouse-branch-list-panel">
          <div className="warehouse-branch-search">
            <Search size={16} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo tên, mã, địa chỉ hoặc hotline"
            />
          </div>
          <div className="warehouse-branch-filters">
            <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Tất cả</button>
            <button type="button" className={statusFilter === 'active' ? 'active' : ''} onClick={() => setStatusFilter('active')}>Hoạt động</button>
            <button type="button" className={statusFilter === 'inactive' ? 'active' : ''} onClick={() => setStatusFilter('inactive')}>Ngừng hoạt động</button>
          </div>
          <div className="warehouse-branch-list">
            {filteredBranches.map((branch) => {
              const usage = usageByBranchId[branch._id];
              return (
                <button
                  key={branch._id}
                  type="button"
                  className={`warehouse-branch-card ${!isCreateMode && selectedBranchId === branch._id ? 'selected' : ''}`}
                  onClick={() => selectBranch(branch._id)}
                >
                  <div className="warehouse-branch-card-top">
                    <div>
                      <strong>{branch.name}</strong>
                      <div className="warehouse-branch-code">{branch.code}</div>
                    </div>
                    <Warehouse size={18} />
                  </div>
                  <div className="warehouse-branch-meta"><MapPin size={14} /> {branch.address || 'Chưa có địa chỉ'}</div>
                  <div className="warehouse-branch-meta"><Phone size={14} /> {branch.phone || 'Chưa có hotline'}</div>
                  <div className="warehouse-branch-badges">
                    {branch.isDefault ? <span className="status-badge default"><Star size={12} /> Mặc định</span> : null}
                    <span className={`status-badge ${branch.isActive === false ? 'inactive' : 'active'}`}>
                      {branch.isActive === false ? <CircleOff size={12} /> : <CheckCircle2 size={12} />}
                      {branch.isActive === false ? 'Ngừng hoạt động' : 'Đang hoạt động'}
                    </span>
                    {usage ? <span className="status-badge neutral">{usage.totalLinked} liên kết</span> : null}
                  </div>
                </button>
              );
            })}
            {!filteredBranches.length ? <div className="warehouse-empty-state">Không có kho nào khớp bộ lọc hiện tại.</div> : null}
          </div>
        </aside>

        <section className="warehouse-branch-detail">
          <div className="card-shell warehouse-branch-section">
            <div className="section-heading">
              <div>
                <h2>Thông tin kho</h2>
                <p>{isCreateMode ? 'Thiết lập kho mới và mã kho chỉ nhập một lần khi tạo.' : 'Quản lý dữ liệu vận hành của kho đang chọn.'}</p>
              </div>
              {loadingDetail ? <LoaderCircle className="spin" size={18} /> : null}
            </div>

            <div className="warehouse-branch-grid">
              <label>
                <span>Tên kho</span>
                <input aria-label="Tên kho" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Kho Hà Nội" />
              </label>
              <label>
                <span>Mã kho</span>
                <input aria-label="Mã kho" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Ví dụ: KHO-HN" readOnly={!isCreateMode} />
              </label>
              <label className="full-width">
                <span>Địa chỉ</span>
                <textarea aria-label="Địa chỉ" rows={3} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Nhập địa chỉ vận hành của kho" />
              </label>
              <label>
                <span>Hotline</span>
                <input aria-label="Hotline" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Nhập số hotline hiển thị trên hóa đơn" />
              </label>
              <div className="warehouse-state-card">
                <div><span>Trạng thái</span><strong>{selectedBranch?.isActive === false && !isCreateMode ? 'Ngừng hoạt động' : 'Đang hoạt động'}</strong></div>
                <div><span>Kho mặc định</span><strong>{selectedBranch?.isDefault && !isCreateMode ? 'Có' : 'Không'}</strong></div>
              </div>
            </div>
          </div>

          <div className="card-shell warehouse-branch-section">
            <div className="section-heading">
              <div>
                <h2>Cấu hình in hóa đơn</h2>
                <p>Tiêu đề lớn luôn là thương hiệu; địa chỉ và hotline lấy theo kho của hóa đơn.</p>
              </div>
              <Store size={18} />
            </div>

            <div className="warehouse-branch-grid">
              <label>
                <span>Tên thương hiệu in hóa đơn</span>
                <input
                  aria-label="Tên thương hiệu in hóa đơn"
                  value={form.invoiceProfile.displayName}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    invoiceProfile: { ...current.invoiceProfile, displayName: event.target.value },
                  }))}
                  placeholder="Để trống để dùng tên cửa hàng chung"
                />
              </label>
              <label>
                <span>Mẫu in</span>
                <input value="Hóa đơn bán lẻ A4 chuẩn" readOnly />
              </label>
              <label className="full-width">
                <span>Nội dung cuối hóa đơn</span>
                <textarea
                  aria-label="Nội dung cuối hóa đơn"
                  rows={3}
                  value={form.invoiceProfile.footerText}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    invoiceProfile: { ...current.invoiceProfile, footerText: event.target.value },
                  }))}
                />
              </label>
            </div>

            <div className="warehouse-checkbox-grid">
              <label><input aria-label="Bật hiển thị chi nhánh trên hóa đơn" type="checkbox" checked={form.invoiceProfile.showBranchName} onChange={(event) => setForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, showBranchName: event.target.checked } }))} />Hiển thị tên kho</label>
              <label><input aria-label="Bật hiển thị người lập phiếu" type="checkbox" checked={form.invoiceProfile.showCashier} onChange={(event) => setForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, showCashier: event.target.checked } }))} />Hiển thị người lập phiếu</label>
              <label><input aria-label="Bật hiển thị mã sản phẩm" type="checkbox" checked={form.invoiceProfile.showProductCode} onChange={(event) => setForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, showProductCode: event.target.checked } }))} />Hiển thị mã sản phẩm</label>
              <label><input aria-label="Bật hiển thị logo cửa hàng" type="checkbox" checked={form.invoiceProfile.showLogo} onChange={(event) => setForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, showLogo: event.target.checked } }))} />Hiển thị logo cửa hàng</label>
            </div>

            <div className="invoice-preview-shell">
              <div className="invoice-preview-sheet">
                <div className="invoice-preview-meta"><span>In thử A4</span><strong>Hóa đơn bán lẻ</strong></div>
                <div className="invoice-preview-center">
                  <h3>{previewProfile.brandName}</h3>
                  <p>{previewProfile.address || 'Địa chỉ kho sẽ hiển thị tại đây'}</p>
                  <p>{previewProfile.phone || 'Hotline kho sẽ hiển thị tại đây'}</p>
                  {previewProfile.showBranchName && previewProfile.branchName ? <span>Kho: {previewProfile.branchName}</span> : null}
                </div>
                <div className="invoice-preview-dash" />
                <div className="invoice-preview-title">HÓA ĐƠN BÁN HÀNG</div>
                <table>
                  <thead>
                    <tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Đầm midi xếp ly{previewProfile.showProductCode ? <span>SP-001</span> : null}</td>
                      <td>1</td>
                      <td>450.000</td>
                      <td>450.000</td>
                    </tr>
                    <tr>
                      <td>Áo sơ mi tay phồng{previewProfile.showProductCode ? <span>SP-002</span> : null}</td>
                      <td>2</td>
                      <td>320.000</td>
                      <td>640.000</td>
                    </tr>
                  </tbody>
                </table>
                <div className="invoice-preview-totals">
                  <div><span>Tổng cộng</span><strong>1.090.000</strong></div>
                  <div><span>Giảm giá</span><strong>50.000</strong></div>
                  <div><span>Đã thanh toán</span><strong>1.100.000</strong></div>
                  <div><span>Tiền trả lại</span><strong>10.000</strong></div>
                </div>
                <div className="invoice-preview-dash" />
                <div className="invoice-preview-footer">{previewProfile.footerText}</div>
              </div>
            </div>
          </div>

          <div className="card-shell warehouse-branch-section">
            <div className="section-heading">
              <div>
                <h2>An toàn dữ liệu</h2>
                <p>Xem mức độ liên kết, in thử mẫu hóa đơn và khóa các thao tác nguy cơ cao bằng mật khẩu Admin.</p>
              </div>
              <ShieldAlert size={18} />
            </div>

            <div className="warehouse-actions-row">
              <button className="btn btn-primary" type="button" onClick={() => setConfirmAction(isCreateMode ? 'create' : 'save')} disabled={!trim(form.name) || !trim(form.code)}><Save size={16} /> {isCreateMode ? 'Tạo kho hàng' : 'Lưu thay đổi'}</button>
              <button className="btn btn-light" type="button" onClick={() => setConfirmAction('set-default')} disabled={isCreateMode || !selectedBranch || selectedBranch.isDefault === true}><Star size={16} /> Đặt làm kho mặc định</button>
              <button className="btn btn-light" type="button" onClick={() => setConfirmAction(selectedBranch?.isActive === false ? 'activate' : 'deactivate')} disabled={isCreateMode || !selectedBranch}>{selectedBranch?.isActive === false ? <RefreshCw size={16} /> : <CircleOff size={16} />}{selectedBranch?.isActive === false ? 'Kích hoạt lại' : 'Ngừng hoạt động'}</button>
              <button className="btn btn-light" type="button" onClick={() => void loadUsage()} disabled={isCreateMode || !selectedBranch || loadingUsage}><Info size={16} /> {loadingUsage ? 'Đang tải liên kết...' : 'Xem dữ liệu liên kết'}</button>
              <button className="btn btn-light" type="button" onClick={printPreview}><Printer size={16} /> In thử mẫu hóa đơn</button>
              <button className="btn btn-light danger" type="button" onClick={() => setConfirmAction('delete')} disabled={isCreateMode || !selectedBranch}><Trash2 size={16} /> Xóa vĩnh viễn</button>
            </div>

            <div className="usage-summary-card">
              <div className="usage-summary-top">
                <strong>{selectedUsage ? `${selectedUsage.totalLinked} liên kết đang được theo dõi` : 'Chưa tải dữ liệu liên kết'}</strong>
                {!selectedUsage ? <span>Nhấn “Xem dữ liệu liên kết” để kiểm tra xóa an toàn.</span> : <span>Hệ thống sẽ chặn xóa kho còn dữ liệu liên quan.</span>}
              </div>
              {selectedUsage ? (
                <div className="usage-summary-grid">
                  {Object.entries(selectedUsage.links)
                    .filter(([, value]) => Number(value || 0) > 0)
                    .map(([key, value]) => (
                      <div key={key} className="usage-summary-item">
                        <span>{USAGE_LABELS[key] || key}</span>
                        <strong>{Number(value || 0).toLocaleString('vi-VN')}</strong>
                      </div>
                    ))}
                  {!Object.values(selectedUsage.links).some((value) => Number(value || 0) > 0) ? <div className="usage-empty">Kho này hiện chưa có liên kết dữ liệu trực tiếp.</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {confirmAction ? (
        <div className="warehouse-modal-backdrop" role="presentation">
          <div className="warehouse-modal-card" role="dialog" aria-modal="true">
            <div className="warehouse-modal-header">
              <div>
                <h3>{actionTitle(confirmAction)}</h3>
                <p>{selectedBranch?.name || form.name || 'Kho hàng mới'}</p>
              </div>
              <AlertTriangle size={18} />
            </div>
            <div className="warehouse-modal-body">
              <p>{actionWarning(confirmAction, selectedBranch?.name || form.name || 'kho này')}</p>
              <label>
                <span>Nhập lại mật khẩu Admin</span>
                <div className="warehouse-password-field">
                  <KeyRound size={16} />
                  <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoFocus />
                </div>
              </label>
            </div>
            <div className="warehouse-modal-actions">
              <button className="btn btn-light" type="button" onClick={closeConfirmModal}>Hủy</button>
              <button className="btn btn-primary" type="button" onClick={() => void submitAction()} disabled={!adminPassword.trim() || submitting}>{submitting ? 'Đang xác nhận...' : 'Xác nhận'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

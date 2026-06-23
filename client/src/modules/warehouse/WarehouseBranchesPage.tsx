import { type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
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
type ConfirmAction = 'create' | 'save' | 'activate' | 'deactivate' | 'delete';

const DEFAULT_FOOTER = 'CẢM ƠN QUÝ KHÁCH ĐÃ MUA HÀNG!';

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
  usersDefaultWarehouseId: 'Nhân viên có defaultWarehouseId',
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

function hasInvalidPhone(value: string) {
  const phone = trim(value);
  return Boolean(phone) && !/^[0-9+().\-\s]+$/.test(phone);
}

function actionTitle(action: ConfirmAction) {
  if (action === 'create') return 'Tạo kho hàng';
  if (action === 'save') return 'Lưu thay đổi';
  if (action === 'activate') return 'Kích hoạt lại kho';
  if (action === 'deactivate') return 'Ngừng hoạt động kho';
  return 'Xóa vĩnh viễn kho';
}

function actionWarning(action: ConfirmAction, branchName: string) {
  if (action === 'create') return `Bạn sắp tạo kho mới ${branchName || 'chưa đặt tên'}. Hệ thống sẽ không tự tạo tồn kho giả.`;
  if (action === 'save') return `Tên, địa chỉ, hotline và cấu hình in hóa đơn của ${branchName} sẽ được cập nhật cho chứng từ mới và bản in mới.`;
  if (action === 'activate') return `${branchName} sẽ xuất hiện trở lại trong các form tạo mới.`;
  if (action === 'deactivate') return `${branchName} sẽ bị ẩn khỏi các form tạo mới nhưng vẫn giữ nguyên lịch sử và chứng từ cũ.`;
  return `${branchName} chỉ được xóa khi không còn dữ liệu liên kết.`;
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
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { width: 80mm; margin: 0; padding: 0; height: auto; min-height: 0; font-family: Arial, sans-serif; color: #111827; font-size: 12.5px; line-height: 1.32; }
      .page { width: 80mm; margin: 0; padding: 3mm 3.5mm 2.5mm; box-sizing: border-box; min-height: 0; height: auto; }
      .center { text-align: center; }
      h1 { margin: 0 0 4px; font-size: 16px; line-height: 1.2; text-transform: uppercase; }
      .sub { margin: 2px 0; overflow-wrap: anywhere; }
      .dash { border-top: 1px dashed #111827; margin: 8px 0; }
      .heading { text-align: center; font-size: 19px; font-weight: 900; letter-spacing: 0.03em; margin: 8px 0 7px; }
      .line, .total-line { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
      .items-head { display: flex; justify-content: space-between; gap: 8px; padding-bottom: 4px; border-bottom: 1px solid #111827; font-weight: 700; }
      .item { padding: 6px 0; border-bottom: 1px dashed #cbd5e1; }
      .item-name { font-weight: 600; overflow-wrap: anywhere; word-break: break-word; }
      .item-values { display: flex; justify-content: space-between; gap: 8px; margin-top: 3px; white-space: nowrap; }
      .total-line.grand { border-top: 1px solid #111827; margin-top: 5px; padding-top: 5px; font-weight: 800; }
      .footer { margin-top: 12px; text-align: center; overflow-wrap: anywhere; }
      .small { font-size: 10px; color: #475569; }
      @media print { html, body { width: 80mm; height: auto; min-height: 0; } .page { width: 80mm; } }    </style>
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
      <div class="heading">ĐƠN BÁN HÀNG</div>
      <div class="line"><span>Mã HĐ:</span><strong>HD-MAU-001</strong></div>
      <div class="line"><span>Khách:</span><strong>Khách lẻ</strong></div>
      <div class="dash"></div>
      <div class="items-head"><span>Sản phẩm</span><span>Thành tiền</span></div>
      <div class="item">
        <div class="item-name">1. Đầm midi xếp ly dáng dài chất liệu mềm dễ xuống dòng</div>
        <div class="item-values"><span>1 x 450.000</span><strong>450.000</strong></div>
      </div>
      <div class="item">
        <div class="item-name">2. Áo sơ mi tay phồng</div>
        <div class="item-values"><span>2 x 320.000</span><strong>640.000</strong></div>
      </div>
      <div class="total-line"><span>Tổng cộng</span><strong>1.090.000</strong></div>
      <div class="total-line"><span>Giảm giá</span><strong>50.000</strong></div>
      <div class="total-line grand"><span>Thành tiền</span><strong>1.040.000</strong></div>
      <div class="total-line"><span>Đã thanh toán</span><strong>1.100.000</strong></div>
      <div class="total-line"><span>Tiền trả lại</span><strong>10.000</strong></div>
      <div class="dash"></div>
      <div class="footer">${profile.footerText}</div>
    </main>
  </body>
</html>`;
}

export function WarehouseBranchesPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [storeSetting, setStoreSetting] = useState<StoreSettingRecord>({ shopName: 'LadyStars' });
  const [invoiceSettingsOpen, setInvoiceSettingsOpen] = useState(false);
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
  const selectedBranchIdRef = useRef(selectedBranchId);
  const isCreateModeRef = useRef(isCreateMode);
  const formEditVersionRef = useRef(0);
  const detailRequestSeqRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    selectedBranchIdRef.current = selectedBranchId;
  }, [selectedBranchId]);

  useEffect(() => {
    isCreateModeRef.current = isCreateMode;
  }, [isCreateMode]);

  const updateForm = (updater: SetStateAction<BranchFormState>) => {
    formEditVersionRef.current += 1;
    setForm(updater);
  };

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
      // Open the first branch only for viewing the detail form.
    const preferredId = nextSelectedId
      || selectedBranchId
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
    const requestBranchId = branchId;
    const requestSeq = detailRequestSeqRef.current + 1;
    const formVersionAtStart = formEditVersionRef.current;
    detailRequestSeqRef.current = requestSeq;
    detailAbortRef.current?.abort();
    const abortController = new AbortController();
    detailAbortRef.current = abortController;
    setLoadingDetail(true);
    try {
      const detail = await getBranch(requestBranchId, { includeInactive: true }, abortController.signal);
      const isLatestRequest = detailRequestSeqRef.current === requestSeq;
      const isStillSelected = selectedBranchIdRef.current === requestBranchId;
      const isStillEditingSameForm = formEditVersionRef.current === formVersionAtStart;
      if (!isLatestRequest) return;
      setBranches((current) => current.map((branch) => (branch._id === requestBranchId ? detail : branch)));
      if (isStillSelected && !isCreateModeRef.current && isStillEditingSameForm) setForm(mapBranchToForm(detail));
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      throw err;
    } finally {
      if (detailRequestSeqRef.current === requestSeq) setLoadingDetail(false);
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
      detailAbortRef.current?.abort();
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
    detailAbortRef.current?.abort();
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
    const targetBranchId = selectedBranchId;
    if ((confirmAction === 'create' || confirmAction === 'save') && hasInvalidPhone(form.phone)) {
      setError('Hotline không hợp lệ. Chỉ dùng số, khoảng trắng, dấu +, -, ., ( ).');
      return;
    }
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
      } else if (confirmAction === 'save' && targetBranchId) {
        const updated = await updateBranch(targetBranchId, {
          name: form.name,
          address: form.address,
          phone: form.phone,
          invoiceProfile: form.invoiceProfile,
          adminPassword,
        });
        setBranches((current) => current.map((branch) => (branch._id === targetBranchId ? updated : branch)));
        if (selectedBranchIdRef.current === targetBranchId && !isCreateModeRef.current) setForm(mapBranchToForm(updated));
        setNotice('Đã lưu thay đổi kho hàng.');
      } else if (confirmAction === 'activate' && targetBranchId) {
        const updated = await activateBranch(targetBranchId, adminPassword);
        await loadBranchesData(updated._id);
        setNotice('Kho hàng đã được kích hoạt lại.');
      } else if (confirmAction === 'deactivate' && targetBranchId) {
        const updated = await deactivateBranch(targetBranchId, adminPassword);
        await loadBranchesData(updated._id);
        setNotice('Kho hàng đã được chuyển sang ngừng hoạt động.');
      } else if (confirmAction === 'delete' && targetBranchId) {
        await deleteBranch(targetBranchId, adminPassword);
        const remaining = await loadBranchesData('');
        const nextId = remaining[0]?._id || '';
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
      if (usage && targetBranchId) {
        setUsageByBranchId((current) => ({ ...current, [targetBranchId]: usage }));
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
                <input aria-label="Tên kho" value={form.name} onChange={(event) => updateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Kho Hà Nội" />
              </label>
              <label>
                <span>Mã kho</span>
                <input aria-label="Mã kho" value={form.code} onChange={(event) => updateForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Ví dụ: KHO-HN" readOnly={!isCreateMode} />
              </label>
              <label className="full-width">
                <span>Địa chỉ</span>
                <textarea aria-label="Địa chỉ" rows={3} value={form.address} onChange={(event) => updateForm((current) => ({ ...current, address: event.target.value }))} placeholder="Nhập địa chỉ vận hành của kho" />
              </label>
              <label>
                <span>Hotline</span>
                <input aria-label="Hotline" value={form.phone} onChange={(event) => updateForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Nhập số hotline hiển thị trên hóa đơn" />
              </label>
              <div className="warehouse-state-card">
                <div><span>Trạng thái</span><strong>{selectedBranch?.isActive === false && !isCreateMode ? 'Ngừng hoạt động' : 'Đang hoạt động'}</strong></div>
              </div>
            </div>
          </div>

          <div className="card-shell warehouse-branch-section">
            <section className={`invoice-settings-panel ${invoiceSettingsOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="invoice-settings-toggle"
                aria-expanded={invoiceSettingsOpen}
                aria-controls="branch-invoice-settings"
                onClick={() => setInvoiceSettingsOpen((open) => !open)}
              >
                <span className="invoice-settings-title">
                  <Printer size={18} />
                  <span>
                    <strong>Cấu hình in hóa đơn</strong>
                    <small>Thiết lập thông tin đầu hóa đơn của kho đang chọn</small>
                  </span>
                </span>
                <ChevronDown size={18} className="invoice-settings-chevron" />
              </button>

              {invoiceSettingsOpen && (
                <div id="branch-invoice-settings" className="invoice-settings-body">
                  <div className="warehouse-branch-grid">
                    <label>
                      <span>Tên thương hiệu *</span>
                      <input
                        aria-label="Tên thương hiệu"
                        value={form.invoiceProfile.displayName}
                        onChange={(event) => updateForm((current) => ({
                          ...current,
                          invoiceProfile: { ...current.invoiceProfile, displayName: event.target.value },
                        }))}
                        placeholder="Tên thương hiệu in đậm trên hóa đơn"
                        required
                      />
                    </label>
                    <label>
                      <span>Điện thoại *</span>
                      <input
                        aria-label="Điện thoại"
                        value={form.phone}
                        onChange={(event) => updateForm((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="Số điện thoại in trên hóa đơn"
                        required
                      />
                    </label>
                    <label className="full-width">
                      <span>Địa chỉ *</span>
                      <textarea
                        aria-label="Địa chỉ in hóa đơn"
                        rows={3}
                        value={form.address}
                        onChange={(event) => updateForm((current) => ({ ...current, address: event.target.value }))}
                        placeholder="Địa chỉ in trên hóa đơn"
                        required
                      />
                    </label>
                  </div>

                  <div className="warehouse-checkbox-grid">
                    <label><input aria-label="Hiển thị cửa hàng trên hóa đơn" type="checkbox" checked={form.invoiceProfile.showBranchName} onChange={(event) => updateForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, showBranchName: event.target.checked } }))} />Hiển thị cửa hàng trên hóa đơn</label>
                  </div>
                </div>
              )}
            </section>
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
              <button className="btn btn-primary" type="button" onClick={() => setConfirmAction(isCreateMode ? 'create' : 'save')} disabled={submitting || !trim(form.name) || !trim(form.code) || !trim(form.invoiceProfile.displayName) || !trim(form.phone) || !trim(form.address)}><Save size={16} /> {isCreateMode ? 'Tạo kho hàng' : 'Lưu thay đổi'}</button>
              <button className="btn btn-light" type="button" onClick={() => setConfirmAction(selectedBranch?.isActive === false ? 'activate' : 'deactivate')} disabled={submitting || isCreateMode || !selectedBranch}>{selectedBranch?.isActive === false ? <RefreshCw size={16} /> : <CircleOff size={16} />}{selectedBranch?.isActive === false ? 'Kích hoạt lại' : 'Ngừng hoạt động'}</button>
              <button className="btn btn-light" type="button" onClick={() => void loadUsage()} disabled={isCreateMode || !selectedBranch || loadingUsage}><Info size={16} /> {loadingUsage ? 'Đang tải liên kết...' : 'Xem dữ liệu liên kết'}</button>
              <button className="btn btn-light" type="button" onClick={printPreview}><Printer size={16} /> In thử mẫu hóa đơn</button>
              <button className="btn btn-light danger" type="button" onClick={() => setConfirmAction('delete')} disabled={submitting || isCreateMode || !selectedBranch}><Trash2 size={16} /> Xóa vĩnh viễn</button>
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

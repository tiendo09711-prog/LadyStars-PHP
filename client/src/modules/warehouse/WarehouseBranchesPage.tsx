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
  defaultTemplateConfig,
  normalizeTemplateConfig,
  TemplateConfig,
  deactivateBranch,
  deleteBranch,
  getBranch,
  getBranchUsage,
  getStoreSetting,
  listBranches,
  StoreSettingRecord,
  updateBranch,
} from '../../core/api/branch.api';
import { buildReceiptHtml } from '../sales/invoicePrint';
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
    templateConfig: TemplateConfig;
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
      templateConfig: defaultTemplateConfig(),
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
      templateConfig: normalizeTemplateConfig(branch.invoiceProfile?.templateConfig),
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

const DEMO_INVOICE_CODE = 'HD-MAU-001';
const DEMO_CUSTOMER = 'Khách lẻ';
const DEMO_CASHIER = 'Thu ngân mẫu';
const DEMO_DATE = new Date().toLocaleDateString('vi-VN');

function demoReceiptSections(showCode: boolean) {
  const lines: { name: string; code: string; quantity: number; price: string; total: string }[] = [
    { name: 'Đầm midi xếp ly dáng dài', code: 'DM001', quantity: 1, price: '450.000', total: '450.000' },
    { name: 'Áo sơ mi tay phồng', code: 'SM002', quantity: 2, price: '320.000', total: '640.000' },
  ];
  return [{ lines }];
}

const DEMO_SUMMARY = [
  { label: 'Tổng cộng', value: '1.090.000' },
  { label: 'Giảm giá', value: '50.000' },
  { label: 'Thành tiền', value: '1.040.000', strong: true },
  { label: 'Đã thanh toán', value: '1.100.000' },
  { label: 'Tiền trả lại', value: '60.000' },
];

function buildDemoReceiptHtml(form: BranchFormState, storeSetting: StoreSettingRecord) {
  const profile = buildInvoiceProfile(
    {
      _id: 'preview',
      name: form.name,
      code: form.code,
      address: form.address,
      phone: form.phone,
      invoiceProfile: form.invoiceProfile,
    },
    storeSetting,
  );
  return buildReceiptHtml({
    profile,
    title: form.invoiceProfile.templateConfig?.title || 'HÓA ĐƠN BÁN HÀNG',
    date: DEMO_DATE,
    code: DEMO_INVOICE_CODE,
    customer: DEMO_CUSTOMER,
    cashier: form.invoiceProfile.showCashier ? DEMO_CASHIER : undefined,
    sections: demoReceiptSections(Boolean(form.invoiceProfile.showProductCode)),
    summary: DEMO_SUMMARY,
  });
}

type InvoiceTemplateDesignerProps = {
  form: BranchFormState;
  updateForm: (updater: SetStateAction<BranchFormState>) => void;
  storeSetting: StoreSettingRecord;
  isDirty: boolean;
  isSaved: boolean;
  disabled: boolean;
  onResetDefault: () => void;
  onSave: () => void;
};

function inlineInputClass(extra = '') {
  return `invoice-tpl-inline-input ${extra}`.trim();
}

function InvoiceTemplateDesigner(props: InvoiceTemplateDesignerProps) {
  const { form, updateForm, storeSetting, isDirty, isSaved, disabled, onResetDefault, onSave } = props;
  const cfg = form.invoiceProfile.templateConfig || defaultTemplateConfig();
  const defaultCfg = defaultTemplateConfig();
  const labels: NonNullable<TemplateConfig['totalLabels']> = {
    subtotal: cfg.totalLabels?.subtotal || defaultCfg.totalLabels?.subtotal || 'Tổng cộng',
    discount: cfg.totalLabels?.discount || defaultCfg.totalLabels?.discount || 'Giảm giá',
    total: cfg.totalLabels?.total || defaultCfg.totalLabels?.total || 'Thành tiền',
    paid: cfg.totalLabels?.paid || defaultCfg.totalLabels?.paid || 'Đã thanh toán',
    change: cfg.totalLabels?.change || defaultCfg.totalLabels?.change || 'Tiền trả lại',
  };
  const align = cfg.typography?.titleAlign || 'center';

  const setCfg = (patch: Partial<TemplateConfig>) => {
    updateForm((current) => ({
      ...current,
      invoiceProfile: {
        ...current.invoiceProfile,
        templateConfig: { ...current.invoiceProfile.templateConfig, ...patch },
      },
    }));
  };
  const setLabel = (key: keyof NonNullable<TemplateConfig['totalLabels']>, value: string) => {
    updateForm((current) => ({
      ...current,
      invoiceProfile: {
        ...current.invoiceProfile,
        templateConfig: {
          ...current.invoiceProfile.templateConfig,
          totalLabels: { ...current.invoiceProfile.templateConfig?.totalLabels, [key]: value },
        },
      },
    }));
  };
  const setToggle = (key: 'showBranchName' | 'showCashier' | 'showProductCode' | 'showLogo', value: boolean) => {
    updateForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, [key]: value } }));
  };

  const previewDoc = buildDemoReceiptHtml(form, storeSetting);
  const showCode = Boolean(form.invoiceProfile.showProductCode);

  return (
    <div className="invoice-tpl-designer">
      <div className="invoice-tpl-columns">
        <div className="invoice-tpl-col invoice-tpl-editor-col">
          <div className="invoice-tpl-col-header">Thiết kế mẫu in</div>
          <p className="invoice-tpl-hint">Chỉnh các phần cho phép. Thương hiệu, địa chỉ, hotline tự đổ từ cấu hình phía trên.</p>

          <div className="invoice-tpl-paper" dir="ltr">
            <div className="invoice-tpl-paper-head" style={{ textAlign: 'center' }}>
              <input
                className={inlineInputClass('is-brand')}
                aria-label="Tên thương hiệu"
                value={form.invoiceProfile.displayName}
                onChange={(event) => updateForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, displayName: event.target.value } }))}
                placeholder={form.name || 'Tên thương hiệu'}
                disabled={disabled}
              />
              <div className="invoice-tpl-static">{form.address || 'Địa chỉ kho'}</div>
              <div className="invoice-tpl-static">Điện thoại: {form.phone || '—'}</div>
              {form.invoiceProfile.showBranchName ? <div className="invoice-tpl-static">Kho: {form.name || '—'}</div> : null}
            </div>
            <div className="invoice-tpl-dash" />
            <div className="invoice-tpl-static">Ngày bán: {DEMO_DATE}</div>
            <input
              className={inlineInputClass('is-title')}
              aria-label="Tiêu đề hóa đơn"
              value={cfg.title || ''}
              onChange={(event) => setCfg({ title: event.target.value })}
              placeholder="HÓA ĐƠN BÁN HÀNG"
              style={{ textAlign: align }}
              disabled={disabled}
            />
            <div className="invoice-tpl-static" style={{ textAlign: align }}>{DEMO_INVOICE_CODE}</div>
            <input
              className={inlineInputClass('is-subtitle')}
              aria-label="Lời dẫn dưới tiêu đề"
              value={cfg.subtitle || ''}
              onChange={(event) => setCfg({ subtitle: event.target.value })}
              placeholder="Lời dẫn ngắn dưới tiêu đề (để trống nếu không dùng)"
              style={{ textAlign: align }}
              disabled={disabled}
            />
            <div className="invoice-tpl-static">Khách hàng: {DEMO_CUSTOMER}</div>
            {form.invoiceProfile.showCashier ? <div className="invoice-tpl-static">Người lập phiếu: {DEMO_CASHIER}</div> : null}
            <div className="invoice-tpl-dash" />
            <table className="invoice-tpl-demo-table">
              <thead>
                <tr>
                  {showCode ? <th>Mã</th> : null}
                  <th>Tên sản phẩm</th>
                  <th>Đơn giá</th>
                  <th>SL</th>
                  <th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {demoReceiptSections(showCode)[0].lines.map((line, index) => (
                  <tr key={index}>
                    {showCode ? <td>{line.code}</td> : null}
                    <td>{line.name}</td>
                    <td>{line.price}</td>
                    <td>{line.quantity}</td>
                    <td>{line.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <textarea
              className="invoice-tpl-inline-textarea"
              aria-label="Ghi chú sau bảng sản phẩm"
              value={cfg.noteText || ''}
              onChange={(event) => setCfg({ noteText: event.target.value })}
              placeholder="Ghi chú đơn hàng (để trống nếu không dùng)"
              rows={2}
              disabled={disabled}
            />
            <div className="invoice-tpl-demo-totals">
              <div className="invoice-tpl-total-row">
                <input className={inlineInputClass('is-label')} aria-label="Nhãn tổng cộng" value={labels.subtotal || ''} onChange={(event) => setLabel('subtotal', event.target.value)} disabled={disabled} />
                <span>1.090.000</span>
              </div>
              <div className="invoice-tpl-total-row">
                <input className={inlineInputClass('is-label')} aria-label="Nhãn giảm giá" value={labels.discount || ''} onChange={(event) => setLabel('discount', event.target.value)} disabled={disabled} />
                <span>50.000</span>
              </div>
              <div className="invoice-tpl-total-row is-strong">
                <input className={inlineInputClass('is-label')} aria-label="Nhãn thành tiền" value={labels.total || ''} onChange={(event) => setLabel('total', event.target.value)} disabled={disabled} />
                <span>1.040.000</span>
              </div>
              <div className="invoice-tpl-total-row">
                <input className={inlineInputClass('is-label')} aria-label="Nhãn đã thanh toán" value={labels.paid || ''} onChange={(event) => setLabel('paid', event.target.value)} disabled={disabled} />
                <span>1.100.000</span>
              </div>
              <div className="invoice-tpl-total-row">
                <input className={inlineInputClass('is-label')} aria-label="Nhãn tiền trả lại" value={labels.change || ''} onChange={(event) => setLabel('change', event.target.value)} disabled={disabled} />
                <span>60.000</span>
              </div>
            </div>
            <div className="invoice-tpl-dash" />
            <textarea
              className="invoice-tpl-inline-textarea is-footer"
              aria-label="Nội dung footer"
              value={form.invoiceProfile.footerText}
              onChange={(event) => updateForm((current) => ({ ...current, invoiceProfile: { ...current.invoiceProfile, footerText: event.target.value } }))}
              rows={2}
              disabled={disabled}
            />
          </div>

          <div className="invoice-tpl-controls">
            <div className="invoice-tpl-control-group">
              <span className="invoice-tpl-control-title">Hiển thị</span>
              <label><input type="checkbox" checked={form.invoiceProfile.showBranchName} onChange={(event) => setToggle('showBranchName', event.target.checked)} disabled={disabled} />Tên kho</label>
              <label><input type="checkbox" checked={form.invoiceProfile.showCashier} onChange={(event) => setToggle('showCashier', event.target.checked)} disabled={disabled} />Thu ngân</label>
              <label><input type="checkbox" checked={form.invoiceProfile.showProductCode} onChange={(event) => setToggle('showProductCode', event.target.checked)} disabled={disabled} />Mã sản phẩm</label>
              <label><input type="checkbox" checked={form.invoiceProfile.showLogo} onChange={(event) => setToggle('showLogo', event.target.checked)} disabled={disabled} />Logo</label>
            </div>
            <div className="invoice-tpl-control-group">
              <span className="invoice-tpl-control-title">Văn phong</span>
              <label>
                <span>Căn tiêu đề</span>
                <select value={cfg.typography?.titleAlign || 'center'} onChange={(event) => setCfg({ typography: { ...cfg.typography, titleAlign: event.target.value as 'left' | 'center' | 'right' } })} disabled={disabled}>
                  <option value="left">Trái</option>
                  <option value="center">Giữa</option>
                  <option value="right">Phải</option>
                </select>
              </label>
              <label>
                <span>Cỡ chữ</span>
                <select value={cfg.typography?.bodyFontSize || 'normal'} onChange={(event) => setCfg({ typography: { ...cfg.typography, bodyFontSize: event.target.value as 'small' | 'normal' } })} disabled={disabled}>
                  <option value="small">Nhỏ</option>
                  <option value="normal">Thường</option>
                </select>
              </label>
            </div>
          </div>

          <div className="invoice-tpl-actions">
            <button className="btn btn-light" type="button" onClick={onResetDefault} disabled={disabled}>
              <RefreshCw size={15} /> Quay về dùng mẫu in mặc định
            </button>
            <button className="btn btn-primary" type="button" onClick={onSave} disabled={disabled}>
              <Save size={15} /> Lưu mẫu
            </button>
          </div>
        </div>

        <div className="invoice-tpl-col invoice-tpl-preview-col">
          <div className="invoice-tpl-col-header">
            <span>Bản xem trước</span>
            <span className={`invoice-tpl-badge ${isDirty ? 'is-draft' : 'is-saved'}`}>
              {isDirty ? 'Bản nháp chưa lưu' : 'Mẫu chính đã lưu'}
            </span>
          </div>
          <div className="invoice-tpl-preview-scroll">
            <iframe title="Bản xem trước mẫu in" className="invoice-tpl-preview-frame" srcDoc={previewDoc} sandbox="" />
          </div>
        </div>
      </div>
    </div>
  );
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

  const savedInvoiceProfile = useMemo(
    () => mapBranchToForm(selectedBranch).invoiceProfile,
    [selectedBranch],
  );

  const templateDirty = useMemo(() => {
    if (isCreateMode) return true;
    return JSON.stringify(form.invoiceProfile) !== JSON.stringify(savedInvoiceProfile);
  }, [form.invoiceProfile, savedInvoiceProfile, isCreateMode]);

  const requiredFieldsMissing = !trim(form.name) || !trim(form.code) || !trim(form.phone) || !trim(form.address);

  const resetTemplateDefault = () => {
    if (templateDirty && !window.confirm('Bản nháp chưa lưu. Bạn có chắc muốn quay về dùng mẫu in mặc định? Các thay đổi chưa lưu sẽ mất.')) return;
    updateForm((current) => ({
      ...current,
      invoiceProfile: {
        ...current.invoiceProfile,
        footerText: DEFAULT_FOOTER,
        showBranchName: false,
        showCashier: true,
        showProductCode: false,
        showLogo: false,
        templateConfig: defaultTemplateConfig(),
      },
    }));
  };

  const saveTemplate = () => {
    if (requiredFieldsMissing) {
      setError('Vui lòng nhập đầy đủ tên, mã, địa chỉ và hotline trước khi lưu mẫu in.');
      return;
    }
    setConfirmAction(isCreateMode ? 'create' : 'save');
  };

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
    popup.document.write(buildDemoReceiptHtml(form, storeSetting));
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

          <div className="card-shell warehouse-branch-section invoice-tpl-module">
            <div className="invoice-tpl-module-head">
              <div>
                <h2>Thiết kế mẫu in hóa đơn</h2>
                <p>Thiết lập mẫu hóa đơn riêng cho kho đang chọn. Thông tin thương hiệu, địa chỉ và hotline được đồng bộ tự động từ cấu hình phía trên.</p>
              </div>
              <Printer size={18} />
            </div>
            <InvoiceTemplateDesigner
              form={form}
              updateForm={updateForm}
              storeSetting={storeSetting}
              isDirty={templateDirty}
              isSaved={!isCreateMode && !templateDirty}
              disabled={submitting}
              onResetDefault={resetTemplateDefault}
              onSave={saveTemplate}
            />
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
              <button className="btn btn-primary" type="button" onClick={() => setConfirmAction(isCreateMode ? 'create' : 'save')} disabled={submitting || !trim(form.name) || !trim(form.code) || !trim(form.phone) || !trim(form.address)}><Save size={16} /> {isCreateMode ? 'Tạo kho hàng' : 'Lưu thay đổi'}</button>
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

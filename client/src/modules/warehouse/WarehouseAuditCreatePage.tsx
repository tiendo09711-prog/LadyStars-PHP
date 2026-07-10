import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ClipboardCheck,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import { useProductScanTarget } from '../../core/hooks/productScanner';
import './warehouseRecords.css';
import './warehouseAudit.css';

type Option = {
  value: string;
  label: string;
  code?: string;
  email?: string;
  role?: string;
  status?: string;
};

type InventoryOption = {
  _id: string;
  code: string;
  name: string;
  barcode?: string;
  unit?: string;
  cost?: number;
  price?: number;
  selectedStock?: number;
  totalStock?: number;
};

type AuditLine = {
  productId: string;
  productCodeSnapshot: string;
  barcodeSnapshot: string;
  productNameSnapshot: string;
  unitSnapshot: string;
  costPriceSnapshot: number;
  salePriceSnapshot: number;
  systemQuantitySnapshot: number;
  inTransitQuantitySnapshot: number;
  physicalInput: string;
  physicalInput2: string;
  assignedToId: string;
  assignedToName?: string;
  location: string;
  varianceReason: string;
  varianceReasonLabel?: string;
  countedByName?: string;
  countedByName2?: string;
  note: string;
  varianceQuantity: number;
};

type AuditDetail = {
  _id: string;
  code: string;
  warehouseId: string;
  warehouseName: string;
  auditType: string;
  auditTypeLabel: string;
  status: string;
  statusLabel: string;
  note: string;
  createdAt?: string;
  snapshotAt?: string;
  createdByName?: string;
  submittedAt?: string;
  submittedByName?: string;
  reconciledAt?: string;
  reconciledByName?: string;
  cancelReason?: string;
  linkedInventoryBillIds: string[];
  linkedInventoryBillCodes: string[];
  reversalVoucherIds?: string[];
  reversalVoucherCodes?: string[];
  blindMode?: boolean;
  doubleCount?: boolean;
  summary: {
    itemCount: number;
    countedItemCount: number;
    systemQuantityTotal: number;
    inTransitQuantityTotal: number;
    physicalQuantityTotal: number;
    varianceQuantityTotal: number;
    excessItemCount: number;
    shortageItemCount: number;
    totalIncreaseQuantity: number;
    totalDecreaseQuantity: number;
  };
  items: Array<{
    _id: string;
    productId: string;
    productCodeSnapshot: string;
    barcodeSnapshot: string;
    productNameSnapshot: string;
    unitSnapshot: string;
    costPriceSnapshot: number;
    salePriceSnapshot: number;
    systemQuantitySnapshot: number;
    inTransitQuantitySnapshot: number;
    physicalQuantity: number | null;
    physicalQuantity2?: number | null;
    varianceQuantity: number;
    note: string;
    assignedToId?: string | null;
    assignedToName?: string;
    location?: string;
    varianceReason?: string;
    varianceReasonLabel?: string;
    countedByName?: string;
    countedByName2?: string;
  }>;
  logs?: Array<{
    _id: string;
    actionType: string;
    actorName?: string;
    previousStatus?: string;
    nextStatus?: string;
    reason?: string;
    createdAt?: string;
  }>;
};

type VoucherDetail = {
  code?: string;
  kindLabel?: string;
  directionLabel?: string;
  warehouseName?: string;
  createdByName?: string;
  date?: string;
  note?: string;
  totalQuantity?: number;
  totalAmount?: number;
  items?: Array<{
    rowKey: string;
    productCode?: string;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount?: number;
  }>;
};

type ConfirmState =
  | { kind: 'submit' }
  | { kind: 'cancel'; reason: string }
  | { kind: 'reconcile' }
  | { kind: 'reverse'; reason: string };

const VARIANCE_REASON_FALLBACKS: Option[] = [
  { value: 'BROKEN', label: 'Hỏng/vỡ' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'LOSS', label: 'Thất thoát' },
  { value: 'FOUND', label: 'Tìm thấy/thừa thực tế' },
  { value: 'DATA_ERROR', label: 'Sai dữ liệu trước đó' },
  { value: 'OTHER', label: 'Khác' },
];

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('vi-VN');
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('vi-VN');
}

function signedNumber(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  if (amount > 0) return `+${amount.toLocaleString('vi-VN')}`;
  return amount.toLocaleString('vi-VN');
}

function varianceClass(value: number) {
  if (value > 0) return 'audit-variance positive';
  if (value < 0) return 'audit-variance negative';
  return 'audit-variance neutral';
}

function parsePhysicalInput(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return NaN;
  return parsed;
}

function lineFromInventory(product: InventoryOption): AuditLine {
  const stock = Number(product.selectedStock ?? product.totalStock ?? 0);
  return {
    productId: product._id,
    productCodeSnapshot: product.code || '',
    barcodeSnapshot: product.barcode || '',
    productNameSnapshot: product.name || '',
    unitSnapshot: product.unit || '',
    costPriceSnapshot: Number(product.cost || 0),
    salePriceSnapshot: Number(product.price || 0),
    systemQuantitySnapshot: stock,
    inTransitQuantitySnapshot: 0,
    physicalInput: '',
    physicalInput2: '',
    assignedToId: '',
    location: '',
    varianceReason: '',
    note: '',
    varianceQuantity: 0,
  };
}

function lineFromAuditItem(item: AuditDetail['items'][number]): AuditLine {
  return {
    productId: item.productId,
    productCodeSnapshot: item.productCodeSnapshot || '',
    barcodeSnapshot: item.barcodeSnapshot || '',
    productNameSnapshot: item.productNameSnapshot || '',
    unitSnapshot: item.unitSnapshot || '',
    costPriceSnapshot: Number(item.costPriceSnapshot || 0),
    salePriceSnapshot: Number(item.salePriceSnapshot || 0),
    systemQuantitySnapshot: Number(item.systemQuantitySnapshot || 0),
    inTransitQuantitySnapshot: Number(item.inTransitQuantitySnapshot || 0),
    physicalInput: item.physicalQuantity === null || item.physicalQuantity === undefined ? '' : String(item.physicalQuantity),
    physicalInput2: item.physicalQuantity2 === null || item.physicalQuantity2 === undefined ? '' : String(item.physicalQuantity2),
    assignedToId: item.assignedToId || '',
    assignedToName: item.assignedToName || '',
    location: item.location || '',
    varianceReason: item.varianceReason || '',
    varianceReasonLabel: item.varianceReasonLabel || '',
    countedByName: item.countedByName || '',
    countedByName2: item.countedByName2 || '',
    note: item.note || '',
    varianceQuantity: Number(item.varianceQuantity || 0),
  };
}

export function WarehouseAuditCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isCreateMode = !id;
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [role, setRole] = useState('EMPLOYEE');
  const [warehouseId, setWarehouseId] = useState('');
  const [auditType, setAuditType] = useState<'BY_PRODUCT' | 'FULL'>('BY_PRODUCT');
  const [note, setNote] = useState('');
  const [blindMode, setBlindMode] = useState(false);
  const [doubleCount, setDoubleCount] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<Option[]>([]);
  const [shelves, setShelves] = useState<Option[]>([]);
  const [varianceReasons, setVarianceReasons] = useState<Option[]>(VARIANCE_REASON_FALLBACKS);
  const [status, setStatus] = useState<'DRAFT' | 'COUNTING' | 'SUBMITTED' | 'RECONCILED' | 'CANCELLED'>('DRAFT');
  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [voucherViewer, setVoucherViewer] = useState<{
    codes: Array<{ id: string; code: string }>;
    selectedId: string;
    data: VoucherDetail | null;
    loading: boolean;
    error: string;
  } | null>(null);

  const isEditable = status === 'DRAFT' || status === 'COUNTING';
  const allowStructureEdit = isCreateMode || status === 'DRAFT';

  const loadMeta = async () => {
    const response = await http.get('/inventory-audits/meta');
    const nextWarehouses = response.data.warehouses || [];
    setRole(response.data.role || 'EMPLOYEE');
    setWarehouses(nextWarehouses);
    setVarianceReasons(response.data.varianceReasons || VARIANCE_REASON_FALLBACKS);
  };

  const loadAudit = async () => {
    if (!id) return;
    const response = await http.get(`/inventory-audits/${id}`);
    const data = response.data as AuditDetail;
    setAudit(data);
    setWarehouseId(data.warehouseId);
    const at = (data.auditType === 'FULL_WAREHOUSE' ? 'FULL' : data.auditType) as 'BY_PRODUCT' | 'FULL';
    setAuditType(at || 'BY_PRODUCT');
    setNote(data.note || '');
    setStatus(data.status as any);
    setBlindMode(Boolean(data.blindMode));
    setDoubleCount(Boolean(data.doubleCount));
    setLines((data.items || []).map(lineFromAuditItem));
  };

  const loadInventories = async (selectedWarehouseId: string) => {
    if (!selectedWarehouseId) return;
    setInventoryLoading(true);
    try {
      const response = await http.get('/products/inventories', {
        params: { branchId: selectedWarehouseId, limit: 5000 },
      });
      const raw: any[] = response.data.items || [];
      const mapped: InventoryOption[] = raw.map((stock: any) => {
        const product = stock?.product ?? {};
        return {
          _id: String(stock?._id ?? stock?.id ?? ' '),
          code: product.code ?? '',
          name: product.name ?? '',
          barcode: product.barcode ?? undefined,
          unit: product.unit ?? undefined,
          cost: Number(product.cost ?? 0),
          price: Number(product.price ?? 0),
          selectedStock: Number(stock?.quantity ?? stock?.qty ?? 0),
          totalStock: Number(product.qty ?? stock?.quantity ?? stock?.qty ?? 0),
        };
      });
      setInventoryOptions(mapped);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được sản phẩm tồn kho.');
    } finally {
      setInventoryLoading(false);
    }
  };

  const loadAssignableUsers = async (selectedWarehouseId: string) => {
    if (!selectedWarehouseId) return;
    try {
      const response = await http.get('/inventory-audits/assignable-users', { params: { warehouseId: selectedWarehouseId } });
      setAssignableUsers(response.data.items || []);
    } catch {
      setAssignableUsers([]);
    }
  };

  const loadShelves = async () => {
    try {
      const response = await http.get('/inventory-audits/shelves');
      setShelves(response.data.items || []);
    } catch {
      setShelves([]);
    }
  };

  const reloadCurrentAudit = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      await loadAudit();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được phiếu kiểm kho.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError('');
      try {
        await loadMeta();
        await loadShelves();
        if (id) await loadAudit();
      } catch (err: any) {
        setError(err.response?.data?.message || 'Không tải được dữ liệu kiểm kho.');
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, [id]);

  useEffect(() => {
    if (!warehouseId) return;
    void loadInventories(warehouseId);
    void loadAssignableUsers(warehouseId);
  }, [warehouseId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const keyword = searchQuery.trim().toLowerCase();
    return inventoryOptions.filter((product) => {
      const haystack = [product.code, product.name, product.barcode].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [inventoryOptions, searchQuery]);

  const lineSummary = useMemo(() => {
    return lines.reduce((summary, line) => {
      summary.itemCount += 1;
      summary.systemQuantityTotal += Number(line.systemQuantitySnapshot || 0);
      summary.inTransitQuantityTotal += Number(line.inTransitQuantitySnapshot || 0);
      const physical = parsePhysicalInput(line.physicalInput);
      if (physical !== null && !Number.isNaN(physical)) {
        summary.countedItemCount += 1;
        summary.physicalQuantityTotal += Number(physical);
      }
      summary.varianceQuantityTotal += Number(line.varianceQuantity || 0);
      if (line.varianceQuantity > 0) {
        summary.excessItemCount += 1;
        summary.totalIncreaseQuantity += line.varianceQuantity;
      } else if (line.varianceQuantity < 0) {
        summary.shortageItemCount += 1;
        summary.totalDecreaseQuantity += Math.abs(line.varianceQuantity);
      }
      return summary;
    }, {
      itemCount: 0,
      countedItemCount: 0,
      systemQuantityTotal: 0,
      inTransitQuantityTotal: 0,
      physicalQuantityTotal: 0,
      varianceQuantityTotal: 0,
      excessItemCount: 0,
      shortageItemCount: 0,
      totalIncreaseQuantity: 0,
      totalDecreaseQuantity: 0,
    });
  }, [lines]);

  const updateLine = (index: number, field: 'physicalInput' | 'physicalInput2' | 'note' | 'assignedToId' | 'location' | 'varianceReason', value: string) => {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const nextLine = { ...line, [field]: value };
      const physical = parsePhysicalInput(field === 'physicalInput' ? value : nextLine.physicalInput);
      nextLine.varianceQuantity = physical === null || Number.isNaN(physical)
        ? 0
        : Number(physical) - Number(nextLine.systemQuantitySnapshot || 0);
      return nextLine;
    }));
  };

  const handleProductScan = (rawBarcode: string) => {
    const lower = rawBarcode.trim().toLowerCase();
    const barcodeMatches = inventoryOptions.filter((p) => String(p.barcode || '').trim().toLowerCase() === lower);
    const codeMatches = barcodeMatches.length ? [] : inventoryOptions.filter((p) => String(p.code || '').trim().toLowerCase() === lower);
    const exactMatches = barcodeMatches.length ? barcodeMatches : codeMatches;
    if (exactMatches.length === 1) {
      addProduct(exactMatches[0]);
      window.setTimeout(() => productSearchRef.current?.focus(), 0);
      return;
    }
    setSearchQuery(rawBarcode.trim());
  };

  useProductScanTarget(productSearchRef, handleProductScan);

  const addProduct = (product: InventoryOption) => {
    if (lines.some((line) => line.productId === product._id)) return;
    setLines((current) => [...current, lineFromInventory(product)]);
    setSearchQuery('');
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  };

  const loadFullWarehousePreview = () => {
    const unique = new Map<string, AuditLine>();
    inventoryOptions.forEach((product) => {
      unique.set(product._id, lineFromInventory(product));
    });
    setLines(Array.from(unique.values()));
  };

  const buildPayload = (nextStatus: 'DRAFT' | 'COUNTING') => {
    const items = lines.map((line) => {
      const physical = parsePhysicalInput(line.physicalInput);
      if (Number.isNaN(physical)) {
        throw new Error(`Số lượng thực tế của ${line.productCodeSnapshot || line.productNameSnapshot} phải là số nguyên không âm.`);
      }
      return {
        productId: line.productId,
        physicalQuantity: physical,
        physicalQuantity2: parsePhysicalInput(line.physicalInput2),
        assignedToId: line.assignedToId || undefined,
        location: line.location.trim(),
        varianceReason: line.varianceReason,
        note: line.note.trim(),
      };
    });
    return {
      warehouseId,
      auditType,
      note: note.trim(),
      blindMode,
      doubleCount,
      status: nextStatus,
      items,
    };
  };

  const saveAudit = async (nextStatus: 'DRAFT' | 'COUNTING') => {
    if (!warehouseId) {
      setError('Vui lòng chọn kho hàng.');
      return;
    }
    if (auditType === 'BY_PRODUCT' && lines.length === 0) {
      setError('Vui lòng chọn ít nhất một sản phẩm để kiểm kho.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = buildPayload(nextStatus);
      if (isCreateMode) {
        const response = await http.post('/inventory-audits', payload);
        setNotice(nextStatus === 'COUNTING' ? 'Đã tạo phiếu và chuyển sang trạng thái đang kiểm.' : 'Đã lưu phiếu kiểm kho nháp.');
        navigate(`/warehouse/audit/${response.data._id}`);
        return;
      }

      await http.patch(`/inventory-audits/${id}`, payload);
      setNotice(nextStatus === 'COUNTING' ? 'Đã cập nhật phiếu kiểm kho đang kiểm.' : 'Đã lưu thay đổi phiếu kiểm kho.');
      await reloadCurrentAudit();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Không lưu được phiếu kiểm kho.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!id || !confirm) return;
    setActionLoading(true);
    setError('');
    try {
      if (confirm.kind === 'submit') {
        await http.post(`/inventory-audits/${id}/submit`);
        setNotice('Đã submit phiếu kiểm kho.');
      } else if (confirm.kind === 'cancel') {
        await http.post(`/inventory-audits/${id}/cancel`, { reason: confirm.reason });
        setNotice('Đã hủy phiếu kiểm kho.');
      } else if (confirm.kind === 'reconcile') {
        await http.post(`/inventory-audits/${id}/reconcile`);
        setNotice('Bù trừ kiểm kho thành công.');
      } else {
        await http.post(`/inventory-audits/${id}/reverse-reconcile`, { reason: confirm.reason });
        setNotice('Đã đảo bù trừ kiểm kho.');
      }
      setConfirm(null);
      await reloadCurrentAudit();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thực hiện được thao tác kiểm kho.');
    } finally {
      setActionLoading(false);
    }
  };

  const resnapshotAudit = async () => {
    if (!id) return;
    setActionLoading(true);
    setError('');
    try {
      await http.post(`/inventory-audits/${id}/resnapshot`);
      setNotice('Đã cập nhật lại snapshot tồn kho.');
      await reloadCurrentAudit();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không cập nhật lại snapshot được.');
    } finally {
      setActionLoading(false);
    }
  };

  const printBlankCountSheet = () => {
    const rows = lines.map((line) => `
      <tr>
        <td>${line.location || ''}</td>
        <td>${line.productCodeSnapshot || ''}</td>
        <td>${line.productNameSnapshot || ''}</td>
        <td>${line.unitSnapshot || ''}</td>
        <td>${blindMode ? '' : formatNumber(line.systemQuantitySnapshot)}</td>
        <td></td>
        ${doubleCount ? '<td></td>' : ''}
        <td>${assignableUsers.find((user) => user.value === line.assignedToId)?.label || line.assignedToName || ''}</td>
        <td></td>
      </tr>
    `).join('');
    const html = `<!doctype html><html><head><title>Phiếu kiểm kho</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:8px;font-size:12px}h1{font-size:20px;margin-bottom:4px}.meta{margin-bottom:16px;color:#555}</style></head><body><h1>Phiếu kiểm kho ${audit?.code || ''}</h1><div class="meta">Kho: ${audit?.warehouseName || warehouses.find((warehouse) => warehouse.value === warehouseId)?.label || ''} · Snapshot: ${formatDate(audit?.snapshotAt)}</div><table><thead><tr><th>Vị trí/kệ</th><th>Mã SP</th><th>Tên sản phẩm</th><th>ĐVT</th><th>Tồn hệ thống</th><th>SL thực tế</th>${doubleCount ? '<th>SL đếm lần 2</th>' : ''}<th>Người đếm</th><th>Ghi chú</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const openVoucherViewer = async () => {
    if (!audit?.linkedInventoryBillIds?.length) return;
    const codes = audit.linkedInventoryBillIds.map((billId, index) => ({
      id: billId,
      code: audit.linkedInventoryBillCodes[index] || `Voucher ${index + 1}`,
    }));
    const first = codes[0];
    setVoucherViewer({
      codes,
      selectedId: first.id,
      data: null,
      loading: true,
      error: '',
    });
    try {
      const response = await http.get(`/warehouse/transactions/bills/inventory-voucher/${first.id}`);
      setVoucherViewer({
        codes,
        selectedId: first.id,
        data: response.data,
        loading: false,
        error: '',
      });
    } catch (err: any) {
      setVoucherViewer({
        codes,
        selectedId: first.id,
        data: null,
        loading: false,
        error: err.response?.data?.message || 'Không tải được phiếu XNK liên kết.',
      });
    }
  };

  const loadVoucherDetail = async (billId: string) => {
    if (!voucherViewer) return;
    setVoucherViewer({ ...voucherViewer, selectedId: billId, loading: true, error: '' });
    try {
      const response = await http.get(`/warehouse/transactions/bills/inventory-voucher/${billId}`);
      setVoucherViewer((current) => current ? ({
        ...current,
        selectedId: billId,
        data: response.data,
        loading: false,
        error: '',
      }) : current);
    } catch (err: any) {
      setVoucherViewer((current) => current ? ({
        ...current,
        selectedId: billId,
        data: null,
        loading: false,
        error: err.response?.data?.message || 'Không tải được phiếu XNK liên kết.',
      }) : current);
    }
  };

  if (loading) {
    return (
      <div className="workspace-page warehouse-records warehouse-audit-admin compact-page">
        <section className="wr-card wr-detail-loading">
          <LoaderCircle size={18} className="spin" /> Đang tải phiếu kiểm kho...
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-page warehouse-records warehouse-audit-admin compact-page">
      <section className="wr-card">
        <header className="wr-detail-header">
          <div>
            <span className="wr-detail-eyebrow">{isCreateMode ? 'Tạo phiếu kiểm kho' : (audit?.statusLabel || 'Chi tiết kiểm kho')}</span>
            <h2>{isCreateMode ? 'Phiếu kiểm kho mới' : (audit?.code || 'Phiếu kiểm kho')}</h2>
          </div>
          <div className="wr-detail-actions">
            <button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/audit')}>
              <ArrowLeft size={15} /> Quay lại
            </button>
            {!isCreateMode ? (
              <button className="wr-icon-button" type="button" onClick={() => void reloadCurrentAudit()} title="Làm mới">
                <RefreshCw size={15} />
              </button>
            ) : null}
          </div>
        </header>

        {notice ? <div className="wr-notice"><Check size={15} /> {notice}</div> : null}
        {error ? (
          <div className="wr-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>Đóng</button>
          </div>
        ) : null}

        <div className="wr-detail-summary">
          <div>
            <span>Kho hàng</span>
            <strong>{audit?.warehouseName || warehouses.find((warehouse) => warehouse.value === warehouseId)?.label || '—'}</strong>
          </div>
          <div>
            <span>Loại kiểm kho</span>
            <strong>{auditType === 'FULL' ? 'Toàn kho' : 'Theo sản phẩm'}</strong>
          </div>
          <div>
            <span>Chế độ đếm</span>
            <strong>{blindMode ? 'Đếm mù' : 'Hiển thị tồn hệ thống'}</strong>
          </div>
          <div>
            <span>Đếm 2 lần</span>
            <strong>{doubleCount ? 'Bật' : 'Tắt'}</strong>
          </div>
          <div>
            <span>Trạng thái</span>
            <strong>{audit?.statusLabel || (status === 'COUNTING' ? 'Đang kiểm' : status === 'DRAFT' ? 'Nháp' : status)}</strong>
          </div>
          <div>
            <span>Số dòng sản phẩm</span>
            <strong>{formatNumber(lineSummary.itemCount)}</strong>
          </div>
          <div>
            <span>Tồn hệ thống</span>
            <strong>{formatNumber(lineSummary.systemQuantityTotal)}</strong>
          </div>
          <div>
            <span>Tồn thực tế</span>
            <strong>{formatNumber(lineSummary.physicalQuantityTotal)}</strong>
          </div>
          <div>
            <span>Tổng chênh lệch</span>
            <strong className={varianceClass(lineSummary.varianceQuantityTotal)}>{signedNumber(lineSummary.varianceQuantityTotal)}</strong>
          </div>
          <div>
            <span>Đang chuyển</span>
            <strong>{formatNumber(lineSummary.inTransitQuantityTotal)}</strong>
          </div>
          <div>
            <span>Người tạo</span>
            <strong>{audit?.createdByName || 'Bạn'}</strong>
          </div>
          <div>
            <span>Snapshot lúc</span>
            <strong>{formatDate(audit?.snapshotAt)}</strong>
          </div>
          <div>
            <span>Người submit</span>
            <strong>{audit?.submittedByName || '—'}</strong>
          </div>
          <div>
            <span>Người bù trừ</span>
            <strong>{audit?.reconciledByName || '—'}</strong>
          </div>
        </div>

        <div className="audit-editor-grid">
          <section className="audit-editor-panel">
            <div className="audit-editor-form">
              <label className="form-field">
                <span>Kho hàng *</span>
                <select
                  value={warehouseId}
                  onChange={(event) => {
                    setWarehouseId(event.target.value);
                    if (allowStructureEdit) setLines([]);
                  }}
                  disabled={!allowStructureEdit}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.value} value={warehouse.value}>
                      {warehouse.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Loại kiểm kho *</span>
                <select
                  value={auditType}
                  onChange={(event) => {
                    setAuditType(event.target.value as 'BY_PRODUCT' | 'FULL');
                    if (allowStructureEdit) setLines([]);
                  }}
                  disabled={!allowStructureEdit}
                >
                  <option value="BY_PRODUCT">Theo sản phẩm</option>
                  <option value="FULL">Toàn kho</option>
                </select>
              </label>
              <label className="form-field wide">
                <span>Ghi chú</span>
                <textarea
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={!isEditable}
                />
              </label>
            </div>

            <div className="audit-toolbar audit-toolbar-stack">
              <label className="audit-toggle">
                <input type="checkbox" checked={blindMode} disabled={!allowStructureEdit} onChange={(event) => setBlindMode(event.target.checked)} />
                <span>Đếm mù — ẩn tồn hệ thống/chênh lệch khi nhập</span>
              </label>
              <label className="audit-toggle">
                <input type="checkbox" checked={doubleCount} disabled={!allowStructureEdit} onChange={(event) => setDoubleCount(event.target.checked)} />
                <span>Double-count — yêu cầu 2 lần đếm khớp nhau trước khi submit</span>
              </label>
              <div className="audit-toolbar">
                <button className="btn btn-light" type="button" onClick={printBlankCountSheet} disabled={!lines.length}>In phiếu kiểm rỗng</button>
                {!isCreateMode && ['DRAFT', 'COUNTING'].includes(status) ? (
                  <button className="btn btn-light" type="button" onClick={() => void resnapshotAudit()} disabled={actionLoading}>Cập nhật lại snapshot</button>
                ) : null}
              </div>
            </div>

            {auditType === 'BY_PRODUCT' && allowStructureEdit ? (
              <div className="audit-search-box">
                <label className="wr-search-field wide">
                  <Search size={14} />
                  <input
                    ref={productSearchRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    data-product-search-scan="true" data-product-search-primary="true" placeholder="Tìm theo mã sản phẩm hoặc mã vạch"
                  />
                </label>
                {searchQuery.trim() ? (
                  <div className="audit-search-results">
                    {filteredProducts.length ? filteredProducts.slice(0, 8).map((product) => (
                      <button key={product._id} type="button" className="audit-search-item" onClick={() => addProduct(product)}>
                        <span>
                          <strong>{product.name}</strong>
                          <small>{product.code}{product.barcode ? ` · ${product.barcode}` : ''}</small>
                        </span>
                        <b>{formatNumber(product.selectedStock ?? product.totalStock ?? 0)}</b>
                      </button>
                    )) : <div className="audit-search-empty">Không tìm thấy sản phẩm phù hợp.</div>}
                  </div>
                ) : null}
              </div>
            ) : null}

            {auditType === 'FULL' && allowStructureEdit ? (
              <div className="audit-toolbar">
                <button className="btn btn-light" type="button" disabled={inventoryLoading} onClick={loadFullWarehousePreview}>
                  <Plus size={15} /> {inventoryLoading ? 'Đang tải sản phẩm kho...' : 'Nạp sản phẩm từ kho'}
                </button>
              </div>
            ) : null}

            <div className="wr-table-wrap">
              <table className="wr-table audit-table">
                <thead>
                  <tr>
                    <th>SP</th>
                    <th>Vị trí/kệ</th>
                    <th>Người đếm</th>
                    {!blindMode ? <th className="right">Tồn hệ thống</th> : null}
                    <th className="right">Đang chuyển</th>
                    <th className="right">Tồn thực tế</th>
                    {doubleCount ? <th className="right">Tồn đếm lần 2</th> : null}
                    {!blindMode ? <th className="right">Chênh lệch</th> : null}
                    <th>Lý do chênh lệch</th>
                    <th>Ghi chú</th>
                    {allowStructureEdit ? <th className="wr-action-cell">Xóa</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {!lines.length ? (
                    <tr>
                      <td className="wr-empty" colSpan={allowStructureEdit ? (doubleCount ? (blindMode ? 9 : 11) : (blindMode ? 8 : 10)) : (doubleCount ? (blindMode ? 8 : 10) : (blindMode ? 7 : 9))}>
                        Chưa có sản phẩm kiểm kho. {auditType === 'FULL' ? 'Bấm "Nạp sản phẩm từ kho" để xem preview hoặc lưu phiếu để backend snapshot toàn kho.' : 'Hãy thêm sản phẩm từ ô tìm kiếm.'}
                      </td>
                    </tr>
                  ) : lines.map((line, index) => (
                    <tr key={`${line.productId}-${index}`}>
                      <td className="wr-product">
                        <strong>{line.productNameSnapshot || '—'}</strong>
                        <small>{line.productCodeSnapshot || line.barcodeSnapshot || '—'}</small>
                      </td>
                      <td>
                        <select className="audit-note-input" value={line.location} onChange={(event) => updateLine(index, 'location', event.target.value)} disabled={!isEditable}>
                          <option value="">Chọn vị trí/kệ</option>
                          {shelves.map((shelf) => <option key={shelf.value} value={shelf.label}>{shelf.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="audit-note-input" value={line.assignedToId} onChange={(event) => updateLine(index, 'assignedToId', event.target.value)} disabled={!isEditable}>
                          <option value="">Chưa phân công</option>
                          {assignableUsers.map((user) => <option key={user.value} value={user.value}>{user.label}</option>)}
                        </select>
                        {!isEditable && (line.countedByName || line.countedByName2) ? <small>{line.countedByName || '—'}{doubleCount && line.countedByName2 ? ` / ${line.countedByName2}` : ''}</small> : null}
                      </td>
                      {!blindMode ? <td className="right">{formatNumber(line.systemQuantitySnapshot)}</td> : null}
                      <td className="right">{formatNumber(line.inTransitQuantitySnapshot)}</td>
                      <td className="right">
                        <input
                          className="audit-qty-input"
                          inputMode="numeric"
                          value={line.physicalInput}
                          onChange={(event) => updateLine(index, 'physicalInput', event.target.value)}
                          disabled={!isEditable}
                          placeholder="Nhập số lượng"
                        />
                      </td>
                      {doubleCount ? (
                        <td className="right">
                          <input
                            className="audit-qty-input"
                            inputMode="numeric"
                            value={line.physicalInput2}
                            onChange={(event) => updateLine(index, 'physicalInput2', event.target.value)}
                            disabled={!isEditable}
                            placeholder="Nhập SL lần 2"
                          />
                        </td>
                      ) : null}
                      {!blindMode ? <td className={`right ${varianceClass(line.varianceQuantity)}`}>{signedNumber(line.varianceQuantity)}</td> : null}
                      <td>
                        <select className="audit-note-input" value={line.varianceReason} onChange={(event) => updateLine(index, 'varianceReason', event.target.value)} disabled={!isEditable || line.varianceQuantity === 0}>
                          <option value="">{line.varianceQuantity === 0 ? 'Không cần' : 'Chọn lý do'}</option>
                          {varianceReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          className="audit-note-input"
                          value={line.note}
                          onChange={(event) => updateLine(index, 'note', event.target.value)}
                          disabled={!isEditable}
                          placeholder="Ghi chú kiểm kho"
                        />
                      </td>
                      {allowStructureEdit ? (
                        <td className="wr-action-cell">
                          <button className="wr-row-menu-button" type="button" onClick={() => removeLine(index)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="audit-editor-actions">
              {isEditable ? (
                <>
                  <button className="btn btn-light" type="button" disabled={saving} onClick={() => void saveAudit('DRAFT')}>
                    <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu nháp'}
                  </button>
                  <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void saveAudit('COUNTING')}>
                    <ClipboardCheck size={15} /> {saving ? 'Đang lưu...' : 'Lưu và chuyển sang kiểm đếm'}
                  </button>
                  {!isCreateMode ? (
                    <button className="btn btn-primary" type="button" disabled={actionLoading || lineSummary.itemCount === 0} onClick={() => setConfirm({ kind: 'submit' })}>
                      <Check size={15} /> Submit phiếu
                    </button>
                  ) : null}
                </>
              ) : null}

              {!isCreateMode && status === 'SUBMITTED' && role === 'ADMIN' ? (
                <button className="btn btn-primary" type="button" disabled={actionLoading} onClick={() => setConfirm({ kind: 'reconcile' })}>
                  <Link2 size={15} /> Bù trừ kiểm kho
                </button>
              ) : null}

              {!isCreateMode && status === 'RECONCILED' && role === 'ADMIN' ? (
                <button className="btn btn-light" type="button" disabled={actionLoading} onClick={() => setConfirm({ kind: 'reverse', reason: '' })}>
                  <RefreshCw size={15} /> Đảo bù trừ
                </button>
              ) : null}

              {!isCreateMode && ['DRAFT', 'COUNTING', 'SUBMITTED'].includes(status) ? (
                <button className="btn btn-light" type="button" disabled={actionLoading} onClick={() => setConfirm({ kind: 'cancel', reason: '' })}>
                  <X size={15} /> Hủy phiếu
                </button>
              ) : null}

              {!isCreateMode && audit?.linkedInventoryBillIds?.length ? (
                <button className="btn btn-light" type="button" onClick={() => void openVoucherViewer()}>
                  <Link2 size={15} /> Xem phiếu XNK
                </button>
              ) : null}
            </div>
          </section>

          {!isCreateMode ? (
            <aside className="audit-log-panel">
              <div className="audit-log-card">
                <h3>Audit log</h3>
                <div className="audit-log-list">
                  {(audit?.logs || []).length ? (audit?.logs || []).map((log) => (
                    <div className="audit-log-item" key={log._id}>
                      <strong>{log.actionType}</strong>
                      <span>{formatDate(log.createdAt)}</span>
                      <small>{log.actorName || '—'} · {log.previousStatus || '—'} → {log.nextStatus || '—'}</small>
                      <p>{log.reason || 'Không có lý do bổ sung.'}</p>
                    </div>
                  )) : <div className="audit-log-empty">Chưa có audit log.</div>}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      {confirm ? (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-confirm-modal audit-small-modal">
            <header>
              <h2>
                {confirm.kind === 'submit' ? 'Submit phiếu kiểm kho' : confirm.kind === 'cancel' ? 'Hủy phiếu kiểm kho' : confirm.kind === 'reconcile' ? 'Xác nhận bù trừ' : 'Đảo bù trừ kiểm kho'}
              </h2>
              <button className="wr-icon-button" type="button" onClick={() => setConfirm(null)}><X size={16} /></button>
            </header>
            {confirm.kind === 'submit' ? (
              <p>Phiếu sẽ chuyển sang trạng thái chờ bù trừ. Hệ thống chỉ cho submit khi mọi dòng đã có tồn thực tế hợp lệ.</p>
            ) : null}
            {confirm.kind === 'cancel' ? (
              <>
                <p>Phiếu sẽ được hủy mềm và giữ toàn bộ lịch sử thao tác.</p>
                <div className="audit-modal-body">
                  <textarea
                    className="audit-textarea"
                    value={confirm.reason}
                    onChange={(event) => setConfirm({ ...confirm, reason: event.target.value })}
                    placeholder="Nhập lý do hủy phiếu..."
                  />
                </div>
              </>
            ) : null}
            {confirm.kind === 'reconcile' ? (
              <>
                <div className="wr-detail-summary">
                  <div><span>Sản phẩm dư</span><strong>{formatNumber(lineSummary.excessItemCount)}</strong></div>
                  <div><span>Sản phẩm thiếu</span><strong>{formatNumber(lineSummary.shortageItemCount)}</strong></div>
                  <div><span>Tổng lượng tăng</span><strong>{formatNumber(lineSummary.totalIncreaseQuantity)}</strong></div>
                  <div><span>Tổng lượng giảm</span><strong>{formatNumber(lineSummary.totalDecreaseQuantity)}</strong></div>
                </div>
                <p className="audit-preview-copy">Hệ thống sẽ tạo chứng từ nhập hoặc xuất điều chỉnh thật và sẽ chặn thao tác nếu tồn kho đã biến động sau snapshot.</p>
              </>
            ) : null}
            {confirm.kind === 'reverse' ? (
              <>
                <p>Hệ thống sẽ tạo phiếu đảo nhập/xuất để hoàn tác bù trừ trước đó, sau đó đưa phiếu về trạng thái chờ bù trừ để kiểm lại.</p>
                <div className="audit-modal-body">
                  <textarea
                    className="audit-textarea"
                    value={confirm.reason}
                    onChange={(event) => setConfirm({ ...confirm, reason: event.target.value })}
                    placeholder="Nhập lý do đảo bù trừ..."
                  />
                </div>
              </>
            ) : null}
            <footer className="audit-modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Đóng</button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={actionLoading || ((confirm.kind === 'cancel' || confirm.kind === 'reverse') && !confirm.reason.trim())}
                onClick={() => void runAction()}
              >
                {actionLoading ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {voucherViewer ? (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-detail-modal audit-voucher-modal">
            <header className="wr-detail-header">
              <div>
                <span className="wr-detail-eyebrow">Phiếu xuất nhập kho liên kết</span>
                <h2>{audit?.code || 'Kiểm kho'}</h2>
              </div>
              <button className="wr-icon-button" type="button" onClick={() => setVoucherViewer(null)}><X size={16} /></button>
            </header>
            <div className="audit-voucher-tabs">
              {voucherViewer.codes.map((code) => (
                <button key={code.id} type="button" className={voucherViewer.selectedId === code.id ? 'active' : ''} onClick={() => void loadVoucherDetail(code.id)}>
                  {code.code}
                </button>
              ))}
            </div>
            {voucherViewer.loading ? (
              <p className="audit-loading-copy"><LoaderCircle size={16} className="spin" /> Đang tải chi tiết phiếu XNK...</p>
            ) : voucherViewer.error ? (
              <div className="wr-error"><AlertCircle size={16} /><span>{voucherViewer.error}</span></div>
            ) : voucherViewer.data ? (
              <>
                <div className="wr-detail-summary">
                  <div><span>Mã phiếu</span><strong>{voucherViewer.data.code || '—'}</strong></div>
                  <div><span>Loại</span><strong>{voucherViewer.data.kindLabel || voucherViewer.data.directionLabel || '—'}</strong></div>
                  <div><span>Kho</span><strong>{voucherViewer.data.warehouseName || '—'}</strong></div>
                  <div><span>Người tạo</span><strong>{voucherViewer.data.createdByName || '—'}</strong></div>
                  <div><span>Ngày</span><strong>{formatDate(voucherViewer.data.date)}</strong></div>
                  <div><span>Tổng SL</span><strong>{formatNumber(voucherViewer.data.totalQuantity)}</strong></div>
                  <div><span>Tổng tiền</span><strong>{formatMoney(voucherViewer.data.totalAmount)}</strong></div>
                  <div className="wide"><span>Ghi chú</span><strong>{voucherViewer.data.note || '—'}</strong></div>
                </div>
                <div className="wr-detail-table-wrap">
                  <table className="wr-table wr-detail-table">
                    <thead>
                      <tr>
                        <th>Mã SP</th>
                        <th>Tên sản phẩm</th>
                        <th className="right">SL</th>
                        <th className="right">Đơn giá</th>
                        <th className="right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(voucherViewer.data.items || []).map((item) => (
                        <tr key={item.rowKey}>
                          <td>{item.productCode || '—'}</td>
                          <td>{item.productName || '—'}</td>
                          <td className="right">{formatNumber(item.quantity)}</td>
                          <td className="right">{formatMoney(item.unitPrice)}</td>
                          <td className="right">{formatMoney(item.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

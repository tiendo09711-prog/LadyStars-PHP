import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileDown,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import { Pagination } from '../../core/components/Pagination';
import './warehouseRecords.css';
import './warehouseAudit.css';

type TabKey = 'audits' | 'items';

type Option = {
  value: string;
  label: string;
  code?: string;
};

type AuditSummary = {
  itemCount: number;
  countedItemCount: number;
  systemQuantityTotal: number;
  inTransitQuantityTotal: number;
  physicalQuantityTotal: number;
  varianceQuantityTotal: number;
  excessItemCount: number;
  shortageItemCount: number;
  zeroVarianceItemCount: number;
  totalIncreaseQuantity: number;
  totalDecreaseQuantity: number;
};

type AuditRow = {
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
  updatedAt?: string;
  snapshotAt?: string;
  createdByName: string;
  submittedByName?: string;
  reconciledByName?: string;
  submittedAt?: string;
  reconciledAt?: string;
  linkedInventoryBillId?: string | null;
  linkedInventoryBillIds: string[];
  linkedInventoryBillCodes: string[];
  mergedIntoAuditId?: string | null;
  blindMode?: boolean;
  doubleCount?: boolean;
  canDelete: boolean;
  availableActions: Array<{ action: string; label: string; needsReason?: boolean; danger?: boolean }>;
  summary: AuditSummary;
};

type AuditItemRow = {
  _id: string;
  auditId: string;
  auditCode: string;
  warehouseId: string;
  warehouseName: string;
  createdAt?: string;
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
  location?: string;
  varianceReasonLabel?: string;
  assignedToName?: string;
  countedByName?: string;
  countedByName2?: string;
  countedAt?: string;
};

type VoucherDetail = {
  code?: string;
  kindLabel?: string;
  directionLabel?: string;
  warehouseName?: string;
  createdByName?: string;
  date?: string;
  note?: string;
  totalProductLines?: number;
  totalQuantity?: number;
  totalAmount?: number;
  items?: Array<{
    rowKey: string;
    productCode?: string;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount?: number;
    note?: string;
  }>;
};

type DashboardPayload = {
  totalAudits: number;
  itemCount: number;
  countedItemCount: number;
  totalVarianceQuantity: number;
  totalIncreaseQuantity: number;
  totalDecreaseQuantity: number;
  byStatus: Array<{ status: string; label: string; count: number }>;
};

type SuggestionRow = {
  productId: string;
  productCode: string;
  productName: string;
  currentStock: number;
  lastVarianceQuantity: number;
  lastAuditAt?: string | null;
  reasons: string[];
};

type MetaPayload = {
  role: string;
  warehouses: Option[];
  auditTypes: Option[];
  statuses: Option[];
  reconciliationStatuses: Option[];
};

type AuditFilters = {
  warehouseId: string;
  createdFrom: string;
  createdTo: string;
  keyword: string;
  auditType: string;
  reconciliationStatus: string;
  note: string;
  reconciledFrom: string;
  reconciledTo: string;
};

type ItemFilters = {
  warehouseId: string;
  createdFrom: string;
  createdTo: string;
  auditId: string;
  productKeyword: string;
  varianceType: string;
};

type ConfirmState =
  | {
      kind: 'cancel';
      audit: AuditRow;
      reason: string;
    }
  | {
      kind: 'delete';
      audit: AuditRow;
    }
  | {
      kind: 'merge';
      auditIds: string[];
      note: string;
    }
  | {
      kind: 'reverse';
      audit: AuditRow;
      reason: string;
    };

const PAGE_LIMIT = 20;

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 14);
  return { createdFrom: formatDateInput(start), createdTo: formatDateInput(end) };
}
const defaultAuditFilters = (): AuditFilters => ({
  warehouseId: '',
  ...defaultDateRange(),
  keyword: '',
  auditType: '',
  reconciliationStatus: '',
  note: '',
  reconciledFrom: '',
  reconciledTo: '',
});

const defaultItemFilters = (): ItemFilters => ({
  warehouseId: '',
  ...defaultDateRange(),
  auditId: '',
  productKeyword: '',
  varianceType: '',
});

const emptyAuditFilters: AuditFilters = {
  warehouseId: '',
  ...defaultDateRange(),
  keyword: '',
  auditType: '',
  reconciliationStatus: '',
  note: '',
  reconciledFrom: '',
  reconciledTo: '',
};

const emptyItemFilters: ItemFilters = {
  warehouseId: '',
  ...defaultDateRange(),
  auditId: '',
  productKeyword: '',
  varianceType: '',
};

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('vi-VN');
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(Number(value))) return '—';
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function pageRange(page: number, total: number, limit: number) {
  if (!total) return '0 / 0';
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `${start} - ${end} / ${total}`;
}

export function WarehouseAuditPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('audits');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [meta, setMeta] = useState<MetaPayload>({
    role: 'EMPLOYEE',
    warehouses: [],
    auditTypes: [],
    statuses: [],
    reconciliationStatuses: [],
  });
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [itemRows, setItemRows] = useState<AuditItemRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(() => defaultAuditFilters());
  const [appliedAuditFilters, setAppliedAuditFilters] = useState<AuditFilters>(() => defaultAuditFilters());
  const [itemFilters, setItemFilters] = useState<ItemFilters>(() => defaultItemFilters());
  const [appliedItemFilters, setAppliedItemFilters] = useState<ItemFilters>(() => defaultItemFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [previewAudit, setPreviewAudit] = useState<AuditRow | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [voucherViewer, setVoucherViewer] = useState<{
    codes: Array<{ id: string; code: string }>;
    selectedId: string;
    data: VoucherDetail | null;
    loading: boolean;
    error: string;
  } | null>(null);

  const selectedAuditRows = useMemo(
    () => auditRows.filter((row) => selectedIds.has(row._id)),
    [auditRows, selectedIds],
  );

  const loadMeta = async () => {
    const response = await http.get('/inventory-audits/meta');
    setMeta(response.data);
  };

  const loadDashboard = async () => {
    try {
      const response = await http.get('/inventory-audits/dashboard', { params: buildAuditQuery(appliedAuditFilters) });
      setDashboard(response.data);
    } catch {
      setDashboard(null);
    }
  };

  const loadSuggestions = async () => {
    const warehouseId = auditFilters.warehouseId || appliedAuditFilters.warehouseId || meta.warehouses[0]?.value || '';
    if (!warehouseId) return;
    try {
      const response = await http.get('/inventory-audits/suggestions', { params: { warehouseId } });
      setSuggestions(response.data.items || []);
    } catch {
      setSuggestions([]);
    }
  };

  const buildAuditQuery = (filters: AuditFilters) => ({
    page,
    limit: PAGE_LIMIT,
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
    ...(filters.keyword ? { keyword: filters.keyword } : {}),
    ...(filters.auditType ? { auditType: filters.auditType } : {}),
    ...(filters.reconciliationStatus ? { reconciliationStatus: filters.reconciliationStatus } : {}),
    ...(filters.note ? { note: filters.note } : {}),
    ...(filters.reconciledFrom ? { reconciledFrom: filters.reconciledFrom } : {}),
    ...(filters.reconciledTo ? { reconciledTo: filters.reconciledTo } : {}),
  });

  const buildItemQuery = (filters: ItemFilters) => ({
    page,
    limit: PAGE_LIMIT,
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
    ...(filters.auditId ? { auditId: filters.auditId } : {}),
    ...(filters.productKeyword ? { productKeyword: filters.productKeyword } : {}),
    ...(filters.varianceType ? { varianceType: filters.varianceType } : {}),
  });

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'audits') {
        const response = await http.get('/inventory-audits', {
          params: buildAuditQuery(appliedAuditFilters),
          signal,
        });
        setAuditRows(response.data.items || []);
        setItemRows([]);
        setTotal(Number(response.data.total || 0));
      } else {
        const response = await http.get('/inventory-audit-items', {
          params: buildItemQuery(appliedItemFilters),
          signal,
        });
        setItemRows(response.data.items || []);
        setAuditRows([]);
        setTotal(Number(response.data.total || 0));
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err.code !== 'ERR_CANCELED') {
        setError(err.response?.data?.message || 'Không tải được dữ liệu kiểm kho.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeta().catch(() => setError('Không tải được metadata kiểm kho.'));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    void loadDashboard();
    void loadSuggestions();
    return () => controller.abort();
  }, [activeTab, page, appliedAuditFilters, appliedItemFilters]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  const refresh = async () => {
    await load();
  };

  const changeTab = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedIds(new Set());
    setOpenMenu(null);
    setShowBulkMenu(false);
  };

  const applyCurrentFilters = () => {
    setPage(1);
    if (activeTab === 'audits') setAppliedAuditFilters(auditFilters);
    else setAppliedItemFilters(itemFilters);
  };

  const resetCurrentFilters = () => {
    setPage(1);
    if (activeTab === 'audits') {
      const nextFilters = defaultAuditFilters();
      setAuditFilters(nextFilters);
      setAppliedAuditFilters(nextFilters);
    } else {
      const nextFilters = defaultItemFilters();
      setItemFilters(nextFilters);
      setAppliedItemFilters(nextFilters);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(auditRows.filter((row) => !row.mergedIntoAuditId).map((row) => row._id)));
  };

  const toggleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const exportColumns: ColumnOption[] = useMemo(() => {
    if (activeTab === 'audits') {
      return [
        { label: 'Mã phiếu', key: 'code', getValue: (row: AuditRow) => row.code },
        { label: 'Kho', key: 'warehouse', getValue: (row: AuditRow) => row.warehouseName || '—' },
        { label: 'Loại kiểm kho', key: 'auditType', getValue: (row: AuditRow) => row.auditTypeLabel || '—' },
        { label: 'Trạng thái', key: 'status', getValue: (row: AuditRow) => row.statusLabel || row.status || '—' },
        { label: 'Ngày tạo', key: 'createdAt', getValue: (row: AuditRow) => formatDate(row.createdAt) },
        { label: 'Người tạo', key: 'createdByName', getValue: (row: AuditRow) => row.createdByName || '—' },
        { label: 'Người nộp', key: 'submittedByName', getValue: (row: AuditRow) => row.submittedByName || '—' },
        { label: 'Ngày nộp', key: 'submittedAt', getValue: (row: AuditRow) => formatDateTime(row.submittedAt) },
        { label: 'Người bù trừ', key: 'reconciledByName', getValue: (row: AuditRow) => row.reconciledByName || '—' },
        { label: 'Ngày bù trừ', key: 'reconciledAt', getValue: (row: AuditRow) => formatDateTime(row.reconciledAt) },
        { label: 'SL sản phẩm', key: 'itemCount', getValue: (row: AuditRow) => row.summary?.itemCount ?? 0 },
        { label: 'SL đã đếm', key: 'countedItemCount', getValue: (row: AuditRow) => row.summary?.countedItemCount ?? 0 },
        { label: 'Tồn hệ thống', key: 'systemQuantityTotal', getValue: (row: AuditRow) => row.summary?.systemQuantityTotal ?? 0 },
        { label: 'Đang chuyển', key: 'inTransitQuantityTotal', getValue: (row: AuditRow) => row.summary?.inTransitQuantityTotal ?? 0 },
        { label: 'Tồn thực tế', key: 'physicalQuantityTotal', getValue: (row: AuditRow) => row.summary?.physicalQuantityTotal ?? 0 },
        { label: 'Chênh lệch', key: 'varianceQuantityTotal', getValue: (row: AuditRow) => row.summary?.varianceQuantityTotal ?? 0 },
        { label: 'SL dư', key: 'excessItemCount', getValue: (row: AuditRow) => row.summary?.excessItemCount ?? 0 },
        { label: 'SL thiếu', key: 'shortageItemCount', getValue: (row: AuditRow) => row.summary?.shortageItemCount ?? 0 },
        { label: 'Ghi chú', key: 'note', getValue: (row: AuditRow) => row.note || '' },
      ];
    }
    return [
      { label: 'Mã phiếu kiểm', key: 'auditCode', getValue: (row: AuditItemRow) => row.auditCode || '—' },
      { label: 'Ngày', key: 'itemCreatedAt', getValue: (row: AuditItemRow) => formatDate(row.createdAt) },
      { label: 'Kho', key: 'itemWarehouse', getValue: (row: AuditItemRow) => row.warehouseName || '—' },
      { label: 'Mã SP', key: 'productCodeSnapshot', getValue: (row: AuditItemRow) => row.productCodeSnapshot || '—' },
      { label: 'Tên SP', key: 'productNameSnapshot', getValue: (row: AuditItemRow) => row.productNameSnapshot || '—' },
      { label: 'Mã vạch', key: 'barcodeSnapshot', getValue: (row: AuditItemRow) => row.barcodeSnapshot || '—' },
      { label: 'Đơn vị', key: 'unitSnapshot', getValue: (row: AuditItemRow) => row.unitSnapshot || '—' },
      { label: 'Vị trí/kệ', key: 'location', getValue: (row: AuditItemRow) => row.location || '—' },
      { label: 'Giá vốn', key: 'costPriceSnapshot', getValue: (row: AuditItemRow) => row.costPriceSnapshot ?? 0 },
      { label: 'Giá bán', key: 'salePriceSnapshot', getValue: (row: AuditItemRow) => row.salePriceSnapshot ?? 0 },
      { label: 'Tồn hệ thống', key: 'systemQuantitySnapshot', getValue: (row: AuditItemRow) => row.systemQuantitySnapshot ?? 0 },
      { label: 'Đang chuyển', key: 'inTransitQuantitySnapshot', getValue: (row: AuditItemRow) => row.inTransitQuantitySnapshot ?? 0 },
      { label: 'Tồn thực tế', key: 'physicalQuantity', getValue: (row: AuditItemRow) => row.physicalQuantity ?? '—' },
      { label: 'Đếm lần 2', key: 'physicalQuantity2', getValue: (row: AuditItemRow) => row.physicalQuantity2 ?? '—' },
      { label: 'Chênh lệch', key: 'varianceQuantity', getValue: (row: AuditItemRow) => row.varianceQuantity ?? 0 },
      { label: 'Lý do', key: 'varianceReasonLabel', getValue: (row: AuditItemRow) => row.varianceReasonLabel || '—' },
      { label: 'Mô tả', key: 'itemNote', getValue: (row: AuditItemRow) => row.note || '' },
      { label: 'Người đếm', key: 'countedByName', getValue: (row: AuditItemRow) => row.assignedToName || row.countedByName || '—' },
      { label: 'Ngày đếm', key: 'countedAt', getValue: (row: AuditItemRow) => formatDateTime(row.countedAt) },
    ];
  }, [activeTab]);

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    setError('');
    try {
      let dataToExport: any[] = [];
      if (exportType === 'current') {
        dataToExport = activeTab === 'audits' ? auditRows : itemRows;
      } else {
        const endpointPath = activeTab === 'audits' ? '/inventory-audits' : '/inventory-audit-items';
        const f: Record<string, string> = activeTab === 'audits' ? appliedAuditFilters : appliedItemFilters;
        const buildParams = (nextPage: number, nextLimit: number) => {
          const params: Record<string, string | number> = { page: nextPage, limit: nextLimit };
          for (const [key, value] of Object.entries(f)) { if (value) params[key] = value; }
          return params;
        };
        const pageSize = 100;
        const firstResponse = await http.get(endpointPath, { params: buildParams(1, pageSize) });
        let allItems: any[] = [...(firstResponse.data.items || [])];
        const totalItems = Number(firstResponse.data.total || 0);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => http.get(endpointPath, { params: buildParams(index + 2, pageSize) })),
          );
          responses.forEach((response) => { allItems = allItems.concat(response.data.items || []); });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setNotice('Không có dữ liệu để xuất.');
        return;
      }
      const mappedRows = dataToExport.map((row) => {
        const record: Record<string, unknown> = {};
        selectedColumns.forEach((column) => {
          const exportColumn = exportColumns.find((item) => item.key === column.key);
          record[column.customLabel] = exportColumn ? exportColumn.getValue(row) : '';
        });
        return record;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };
  const exportCurrent = async () => {
    setActionLoading(true);
    setError('');
    try {
      if (activeTab === 'audits') {
        const response = await http.get('/inventory-audits/export', {
          params: buildAuditQuery(appliedAuditFilters),
          responseType: 'blob',
        });
        downloadBlob(response.data, 'inventory-audits.csv');
      } else {
        const response = await http.get('/inventory-audit-items/export', {
          params: buildItemQuery(appliedItemFilters),
          responseType: 'blob',
        });
        downloadBlob(response.data, 'inventory-audit-items.csv');
      }
      setShowBulkMenu(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không xuất được dữ liệu kiểm kho.');
    } finally {
      setActionLoading(false);
    }
  };

  const exportAuditProducts = async (audit: AuditRow) => {
    setActionLoading(true);
    setError('');
    try {
      const response = await http.get('/inventory-audit-items/export', {
        params: { auditId: audit._id },
        responseType: 'blob',
      });
      downloadBlob(response.data, `${audit.code}-items.csv`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không xuất được sản phẩm kiểm kho.');
    } finally {
      setActionLoading(false);
      setOpenMenu(null);
    }
  };

  const openReconcilePreview = async (audit: AuditRow) => {
    setOpenMenu(null);
    setPreviewLoading(true);
    setPreviewAudit(null);
    setError('');
    try {
      const response = await http.get(`/inventory-audits/${audit._id}`);
      setPreviewAudit(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được preview bù trừ kiểm kho.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const runReconcile = async () => {
    if (!previewAudit) return;
    setActionLoading(true);
    setError('');
    try {
      await http.post(`/inventory-audits/${previewAudit._id}/reconcile`);
      setPreviewAudit(null);
      setNotice('Bù trừ kiểm kho thành công.');
      await refresh();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không bù trừ được phiếu kiểm kho.');
    } finally {
      setActionLoading(false);
    }
  };

  const openVoucherViewer = async (audit: AuditRow) => {
    setOpenMenu(null);
    const codes = audit.linkedInventoryBillIds.map((id, index) => ({
      id,
      code: audit.linkedInventoryBillCodes[index] || `Voucher ${index + 1}`,
    }));
    const first = codes[0];
    if (!first) return;
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

  const runConfirm = async () => {
    if (!confirm) return;
    setActionLoading(true);
    setError('');
    try {
      if (confirm.kind === 'cancel') {
        await http.post(`/inventory-audits/${confirm.audit._id}/cancel`, { reason: confirm.reason });
        setNotice('Đã hủy phiếu kiểm kho.');
      } else if (confirm.kind === 'delete') {
        await http.delete(`/inventory-audits/${confirm.audit._id}`);
        setNotice('Đã xóa phiếu kiểm kho nháp.');
      } else if (confirm.kind === 'merge') {
        const response = await http.post('/inventory-audits/merge', {
          auditIds: confirm.auditIds,
          note: confirm.note,
        });
        setNotice('Gộp phiếu kiểm kho thành công.');
        navigate(`/warehouse/audit/${response.data._id}`);
      } else {
        await http.post(`/inventory-audits/${confirm.audit._id}/reverse-reconcile`, { reason: confirm.reason });
        setNotice('Đã đảo bù trừ kiểm kho.');
      }
      setConfirm(null);
      await refresh();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thực hiện được thao tác kiểm kho.');
    } finally {
      setActionLoading(false);
    }
  };

  const canMerge = selectedAuditRows.length >= 2;

  const auditTable = (
    <div className="wr-table-wrap">
      <table className="wr-table audit-table">
        <thead>
          <tr>
            <th className="wr-checkbox-cell">
              <input
                type="checkbox"
                aria-label="Chọn tất cả phiếu kiểm kho"
                checked={auditRows.length > 0 && selectedIds.size > 0 && selectedIds.size === auditRows.filter((row) => !row.mergedIntoAuditId).length}
                onChange={(event) => toggleSelectAll(event.target.checked)}
              />
            </th>
            <th>ID | Ngày</th>
            <th>Loại kiểm kho</th>
            <th>Chế độ</th>
            <th>Kho hàng</th>
            <th>Người tạo</th>
            <th className="right">SP</th>
            <th className="right">SL kiểm</th>
            <th>Ghi chú</th>
            <th className="right">Chênh lệch</th>
            <th>Bù trừ kiểm kho</th>
            <th className="wr-action-cell"><MoreHorizontal size={14} /></th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }).map((_, index) => (
            <tr className="wr-skeleton" key={`audit-skeleton-${index}`}>
              <td colSpan={12}><span /></td>
            </tr>
          ))}
          {!loading && auditRows.length === 0 && (
            <tr>
              <td className="wr-empty" colSpan={12}>Chưa có phiếu kiểm kho phù hợp.</td>
            </tr>
          )}
          {!loading && auditRows.map((audit) => (
            <tr key={audit._id}>
              <td className="wr-checkbox-cell">
                <input
                  type="checkbox"
                  disabled={Boolean(audit.mergedIntoAuditId)}
                  checked={selectedIds.has(audit._id)}
                  onChange={(event) => toggleSelectRow(audit._id, event.target.checked)}
                />
              </td>
              <td className="wr-identity-cell">
                <button type="button" className="wr-link" onClick={() => navigate(`/warehouse/audit/${audit._id}`)}>
                  {audit.code}
                </button>
                <span>{formatDate(audit.createdAt)}</span>
              </td>
              <td>
                <strong>{audit.auditTypeLabel}</strong>
                <span className="wr-sub">{audit.statusLabel}</span>
              </td>
              <td>{audit.warehouseName || '—'}</td>
              <td>
                {audit.createdByName || '—'}
                {audit.mergedIntoAuditId ? <span className="wr-sub">Đã gộp sang phiếu khác</span> : null}
              </td>
              <td className="right">{formatNumber(audit.summary.itemCount)}</td>
              <td className="right">{formatNumber(audit.summary.physicalQuantityTotal)}</td>
              <td className="audit-note-cell">{audit.note || '—'}</td>
              <td className={`right ${varianceClass(audit.summary.varianceQuantityTotal)}`}>{signedNumber(audit.summary.varianceQuantityTotal)}</td>
              <td>
                {audit.status === 'RECONCILED' ? (
                  <>
                    <span className="audit-pill success">Đã bù trừ</span>
                    <span className="wr-sub">
                      {audit.reconciledByName || '—'} · {formatDateTime(audit.reconciledAt)}
                    </span>
                    {audit.linkedInventoryBillCodes.length ? (
                      <span className="wr-sub">{audit.linkedInventoryBillCodes.join(', ')}</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="audit-pill neutral">Chưa bù trừ</span>
                    <span className="wr-sub">
                      Dư {formatNumber(audit.summary.excessItemCount)} · Thiếu {formatNumber(audit.summary.shortageItemCount)}
                    </span>
                  </>
                )}
              </td>
              <td className="wr-action-cell">
                <div className="wr-menu">
                  <button
                    className="wr-row-menu-button"
                    type="button"
                    onClick={() => setOpenMenu(openMenu === audit._id ? null : audit._id)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {openMenu === audit._id && (
                    <div className="wr-menu-panel wr-row-menu">
                      <button type="button" onClick={() => navigate(`/warehouse/audit/${audit._id}`)}>
                        <Eye size={15} /> Xem chi tiết
                      </button>
                      <button type="button" onClick={() => void exportAuditProducts(audit)}>
                        <FileDown size={15} /> Xuất CSV sản phẩm
                      </button>
                      {audit.availableActions.some((action) => action.action === 'reconcile') ? (
                        <button type="button" onClick={() => void openReconcilePreview(audit)}>
                          <Check size={15} /> Bù trừ kiểm kho
                        </button>
                      ) : null}
                      {audit.linkedInventoryBillIds.length ? (
                        <button type="button" onClick={() => void openVoucherViewer(audit)}>
                          <Link2 size={15} /> Xem phiếu XNK
                        </button>
                      ) : null}
                      {audit.status === 'RECONCILED' && meta.role === 'ADMIN' ? (
                        <button type="button" onClick={() => setConfirm({ kind: 'reverse', audit, reason: '' })}>
                          <RefreshCw size={15} /> Đảo bù trừ
                        </button>
                      ) : null}
                      {audit.availableActions.some((action) => action.action === 'cancel') ? (
                        <button type="button" className="danger" onClick={() => setConfirm({ kind: 'cancel', audit, reason: '' })}>
                          <X size={15} /> Hủy phiếu
                        </button>
                      ) : null}
                      {audit.canDelete ? (
                        <button type="button" className="danger" onClick={() => setConfirm({ kind: 'delete', audit })}>
                          <Trash2 size={15} /> Xóa phiếu nháp
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const itemTable = (
    <div className="wr-table-wrap">
      <table className="wr-table audit-table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Kho</th>
            <th>Tên sản phẩm</th>
            <th>Vị trí/kệ</th>
            <th>Người đếm</th>
            <th className="right">Giá vốn</th>
            <th className="right">Giá bán</th>
            <th className="right">Tồn hệ thống</th>
            <th className="right">Đang chuyển</th>
            <th className="right">Tồn thực tế</th>
            <th className="right">Đếm lần 2</th>
            <th className="right">Chênh lệch</th>
            <th>Lý do</th>
            <th>Mô tả</th>
            <th className="wr-action-cell"><MoreHorizontal size={14} /></th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }).map((_, index) => (
            <tr className="wr-skeleton" key={`item-skeleton-${index}`}>
              <td colSpan={12}><span /></td>
            </tr>
          ))}
          {!loading && itemRows.length === 0 && (
            <tr>
              <td className="wr-empty" colSpan={12}>Chưa có sản phẩm kiểm kho phù hợp.</td>
            </tr>
          )}
          {!loading && itemRows.map((item) => (
            <tr key={item._id}>
              <td>
                <button type="button" className="wr-link audit-inline-link" onClick={() => navigate(`/warehouse/audit/${item.auditId}`)}>
                  {formatDate(item.createdAt)}
                </button>
              </td>
              <td>{item.warehouseName || '—'}</td>
              <td className="wr-product">
                <button type="button" className="wr-link audit-inline-link" onClick={() => navigate(`/warehouse/audit/${item.auditId}`)}>
                  {item.productNameSnapshot || '—'}
                </button>
                <small>{item.productCodeSnapshot || item.barcodeSnapshot || '—'}</small>
              </td>
              <td>{item.location || '—'}</td>
              <td>{item.assignedToName || item.countedByName || '—'}{item.countedByName2 ? ` / ${item.countedByName2}` : ''}</td>
              <td className="right">{formatMoney(item.costPriceSnapshot)}</td>
              <td className="right">{formatMoney(item.salePriceSnapshot)}</td>
              <td className="right">{formatNumber(item.systemQuantitySnapshot)}</td>
              <td className="right">{formatNumber(item.inTransitQuantitySnapshot)}</td>
              <td className="right">{formatNumber(item.physicalQuantity)}</td>
              <td className="right">{formatNumber(item.physicalQuantity2)}</td>
              <td className={`right ${varianceClass(item.varianceQuantity)}`}>{signedNumber(item.varianceQuantity)}</td>
              <td>{item.varianceReasonLabel || (item.varianceQuantity === 0 ? '—' : 'Chưa chọn')}</td>
              <td className="audit-note-cell">{item.note || '—'}</td>
              <td className="wr-action-cell">
                <button
                  className="wr-row-menu-button"
                  type="button"
                  onClick={() => navigate(`/warehouse/audit/${item.auditId}`)}
                  title="Mở phiếu kiểm kho"
                >
                  <Eye size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="workspace-page warehouse-records warehouse-audit-admin" ref={rootRef}>
      <section className="wr-card">
        {dashboard ? (
          <div className="audit-dashboard">
            <div><span>Tổng phiếu</span><strong>{formatNumber(dashboard.totalAudits)}</strong></div>
            <div><span>Dòng đã đếm</span><strong>{formatNumber(dashboard.countedItemCount)} / {formatNumber(dashboard.itemCount)}</strong></div>
            <div><span>Tổng lệch</span><strong className={varianceClass(dashboard.totalVarianceQuantity)}>{signedNumber(dashboard.totalVarianceQuantity)}</strong></div>
            <div><span>Tăng/giảm</span><strong>+{formatNumber(dashboard.totalIncreaseQuantity)} / -{formatNumber(dashboard.totalDecreaseQuantity)}</strong></div>
            <div className="wide"><span>Trạng thái</span><strong>{dashboard.byStatus.map((entry) => `${entry.label}: ${entry.count}`).join(' · ')}</strong></div>
          </div>
        ) : null}

        {activeTab === 'audits' ? (
          <div className="audit-suggestions">
            <div>
              <strong>Gợi ý kiểm kho</strong>
              <span>Ưu tiên sản phẩm lâu chưa kiểm, tồn cao hoặc từng lệch.</span>
            </div>
            <button className="btn btn-light" type="button" onClick={() => void loadSuggestions()}>Làm mới gợi ý</button>
            {suggestions.length ? (
              <div className="audit-suggestion-list">
                {suggestions.slice(0, 6).map((item) => (
                  <button key={item.productId} type="button" onClick={() => navigate(`/warehouse/audit/create`)}>
                    <strong>{item.productName}</strong>
                    <small>{item.productCode || '—'} · Tồn {formatNumber(item.currentStock)} · {item.reasons.join(', ') || 'Nên kiểm lại'}</small>
                  </button>
                ))}
              </div>
            ) : <span className="wr-sub">Chưa có gợi ý hoặc chưa chọn kho.</span>}
          </div>
        ) : null}

        <div className="workspace-tabs wr-tabs audit-tabs" role="tablist" aria-label="Kiểm kho">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audits'}
            className={activeTab === 'audits' ? 'active' : ''}
            onClick={() => changeTab('audits')}
          >
            <ClipboardCheck size={16} /> Kiểm kho
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'items'}
            className={activeTab === 'items' ? 'active' : ''}
            onClick={() => changeTab('items')}
          >
            <PackageSearch size={16} /> Sản phẩm kiểm kho
          </button>
        </div>

        <div className="wr-filters audit-filters">
          {activeTab === 'audits' ? (
            <>
              <select className="wr-filter" value={auditFilters.warehouseId} onChange={(event) => setAuditFilters({ ...auditFilters, warehouseId: event.target.value })}>
                <option value="">Kho hàng</option>
                {meta.warehouses.map((warehouse) => <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>)}
              </select>
              <input className="wr-filter audit-date" type="date" value={auditFilters.createdFrom} onChange={(event) => setAuditFilters({ ...auditFilters, createdFrom: event.target.value })} />
              <input className="wr-filter audit-date" type="date" value={auditFilters.createdTo} onChange={(event) => setAuditFilters({ ...auditFilters, createdTo: event.target.value })} />
              <label className="wr-search-field">
                <Search size={14} />
                <input value={auditFilters.keyword} onChange={(event) => setAuditFilters({ ...auditFilters, keyword: event.target.value })} placeholder="ID phiếu kiểm kho" />
              </label>
              <select className="wr-filter" value={auditFilters.auditType} onChange={(event) => setAuditFilters({ ...auditFilters, auditType: event.target.value })}>
                <option value="">Loại kiểm kho</option>
                {meta.auditTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="wr-filter" value={auditFilters.reconciliationStatus} onChange={(event) => setAuditFilters({ ...auditFilters, reconciliationStatus: event.target.value })}>
                <option value="">Trạng thái bù trừ</option>
                {meta.reconciliationStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <label className="wr-search-field wide">
                <Search size={14} />
                <input value={auditFilters.note} onChange={(event) => setAuditFilters({ ...auditFilters, note: event.target.value })} placeholder="Ghi chú" />
              </label>
            </>
          ) : (
            <>
              <select className="wr-filter" value={itemFilters.warehouseId} onChange={(event) => setItemFilters({ ...itemFilters, warehouseId: event.target.value })}>
                <option value="">Kho hàng</option>
                {meta.warehouses.map((warehouse) => <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>)}
              </select>
              <input className="wr-filter audit-date" type="date" value={itemFilters.createdFrom} onChange={(event) => setItemFilters({ ...itemFilters, createdFrom: event.target.value })} />
              <input className="wr-filter audit-date" type="date" value={itemFilters.createdTo} onChange={(event) => setItemFilters({ ...itemFilters, createdTo: event.target.value })} />
              <label className="wr-search-field">
                <Search size={14} />
                <input value={itemFilters.auditId} onChange={(event) => setItemFilters({ ...itemFilters, auditId: event.target.value })} placeholder="ID phiếu kiểm kho" />
              </label>
              <label className="wr-search-field wide">
                <Search size={14} />
                <input value={itemFilters.productKeyword} onChange={(event) => setItemFilters({ ...itemFilters, productKeyword: event.target.value })} placeholder="Sản phẩm" />
              </label>
              <select className="wr-filter" value={itemFilters.varianceType} onChange={(event) => setItemFilters({ ...itemFilters, varianceType: event.target.value })}>
                <option value="">Trạng thái chênh lệch</option>
                <option value="EXCESS">Dư hàng</option>
                <option value="SHORTAGE">Thiếu hàng</option>
                <option value="BALANCED">Không chênh lệch</option>
              </select>
            </>
          )}

          <button className="btn btn-primary wr-filter-button" type="button" onClick={applyCurrentFilters}>Lọc</button>
          <button className="btn btn-light wr-reset-button" type="button" onClick={resetCurrentFilters}>Đặt lại</button>
        </div>

        <div className="wr-actions">
          <div className="wr-action-left">
            {activeTab === 'audits' ? (
              <button className="btn btn-primary wr-create-button" type="button" onClick={() => navigate('/warehouse/audit/create')}>
                <Plus size={15} /> Thêm mới
              </button>
            ) : null}
            <div className="wr-menu">
              <button className="btn btn-light" type="button" onClick={() => setShowBulkMenu(!showBulkMenu)}>
                <ChevronDown size={14} /> Thao tác
              </button>
              {showBulkMenu && (
                <div className="wr-menu-panel wr-action-menu">
                  <button type="button" disabled={exportLoading} onClick={() => setShowExportModal(true)}>
                    <FileDown size={15} /> Xuất dữ liệu
                  </button>
                  {activeTab === 'audits' ? (
                    <button
                      type="button"
                      disabled={!canMerge || actionLoading}
                      onClick={() => setConfirm({ kind: 'merge', auditIds: selectedAuditRows.map((row) => row._id), note: '' })}
                    >
                      <Link2 size={15} /> Gộp phiếu đã chọn
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <div className="wr-action-right">
            <span className="wr-count">
              {pageRange(page, total, PAGE_LIMIT)}
              {activeTab === 'audits' && selectedIds.size ? ` · Đã chọn ${selectedIds.size}` : ''}
            </span>
            <button className="wr-icon-button" type="button" title="Làm mới" onClick={resetCurrentFilters}>
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {notice ? <div className="wr-notice"><Check size={15} /> {notice}</div> : null}
        {error ? (
          <div className="wr-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>Đóng</button>
          </div>
        ) : null}

        {activeTab === 'audits' ? auditTable : itemTable}
        <Pagination page={page} total={total} limit={PAGE_LIMIT} onPageChange={setPage} />
      </section>

      {previewLoading ? (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-confirm-modal audit-small-modal">
            <header>
              <h2>Đang tải preview bù trừ</h2>
              <button className="wr-icon-button" type="button" onClick={() => setPreviewLoading(false)}><X size={16} /></button>
            </header>
            <p className="audit-loading-copy"><LoaderCircle size={16} className="spin" /> Đang chuẩn bị dữ liệu bù trừ kiểm kho...</p>
          </section>
        </div>
      ) : null}

      {previewAudit ? (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-detail-modal audit-preview-modal">
            <header className="wr-detail-header">
              <div>
                <span className="wr-detail-eyebrow">Xác nhận bù trừ</span>
                <h2>{previewAudit.code}</h2>
              </div>
              <button className="wr-icon-button" type="button" onClick={() => setPreviewAudit(null)}><X size={16} /></button>
            </header>
            <div className="wr-detail-summary">
              <div><span>Sản phẩm dư</span><strong>{formatNumber(previewAudit.summary.excessItemCount)}</strong></div>
              <div><span>Sản phẩm thiếu</span><strong>{formatNumber(previewAudit.summary.shortageItemCount)}</strong></div>
              <div><span>Tổng lượng tăng</span><strong>{formatNumber(previewAudit.summary.totalIncreaseQuantity)}</strong></div>
              <div><span>Tổng lượng giảm</span><strong>{formatNumber(previewAudit.summary.totalDecreaseQuantity)}</strong></div>
            </div>
            <p className="audit-preview-copy">
              Hệ thống sẽ tạo chứng từ xuất nhập kho thật để bù trừ tồn. Thao tác này chỉ chạy một lần và sẽ bị chặn nếu tồn kho đã biến động sau thời điểm snapshot.
            </p>
            <footer className="audit-modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setPreviewAudit(null)}>Đóng</button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={actionLoading || previewAudit.summary.countedItemCount !== previewAudit.summary.itemCount}
                onClick={() => void runReconcile()}
              >
                {actionLoading ? 'Đang bù trừ...' : 'Bù trừ kiểm kho'}
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
                <h2>Xem chứng từ bù trừ kiểm kho</h2>
              </div>
              <button className="wr-icon-button" type="button" onClick={() => setVoucherViewer(null)}><X size={16} /></button>
            </header>
            <div className="audit-voucher-tabs">
              {voucherViewer.codes.map((code) => (
                <button
                  key={code.id}
                  type="button"
                  className={voucherViewer.selectedId === code.id ? 'active' : ''}
                  onClick={() => void loadVoucherDetail(code.id)}
                >
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
                  <div><span>Ngày</span><strong>{formatDateTime(voucherViewer.data.date)}</strong></div>
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
                        <th>Ghi chú</th>
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
                          <td>{item.note || '—'}</td>
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

      {confirm ? (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-confirm-modal audit-small-modal">
            <header>
              <h2>
                {confirm.kind === 'cancel' ? 'Hủy phiếu kiểm kho' : confirm.kind === 'delete' ? 'Xóa phiếu nháp' : 'Gộp phiếu kiểm kho'}
              </h2>
              <button className="wr-icon-button" type="button" onClick={() => setConfirm(null)}><X size={16} /></button>
            </header>
            {confirm.kind === 'cancel' ? (
              <>
                <p>Phiếu <strong>{confirm.audit.code}</strong> sẽ được chuyển sang trạng thái đã hủy và không làm thay đổi tồn kho.</p>
                <div className="audit-modal-body">
                  <textarea
                    className="audit-textarea"
                    placeholder="Nhập lý do hủy phiếu..."
                    value={confirm.reason}
                    onChange={(event) => setConfirm({ ...confirm, reason: event.target.value })}
                  />
                </div>
              </>
            ) : null}
            {confirm.kind === 'delete' ? (
              <p>Phiếu <strong>{confirm.audit.code}</strong> sẽ bị xóa vật lý vì còn ở trạng thái nháp và chưa có log nghiệp vụ quan trọng.</p>
            ) : null}
            {confirm.kind === 'merge' ? (
              <>
                <p>Hệ thống sẽ tạo một phiếu kiểm kho mới từ {confirm.auditIds.length} phiếu đã chọn. Các phiếu nguồn sẽ được giữ lịch sử và khóa thao tác tiếp theo.</p>
                <div className="audit-modal-body">
                  <textarea
                    className="audit-textarea"
                    placeholder="Ghi chú gộp phiếu (không bắt buộc)..."
                    value={confirm.note}
                    onChange={(event) => setConfirm({ ...confirm, note: event.target.value })}
                  />
                </div>
              </>
            ) : null}
            <footer className="audit-modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Đóng</button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={actionLoading || (confirm.kind === 'cancel' && !confirm.reason.trim())}
                onClick={() => void runConfirm()}
              >
                {actionLoading ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title={'Xuất Excel - ' + (activeTab === 'audits' ? 'Phiếu kiểm kho' : 'Sản phẩm kiểm kho')}
          defaultFilename={`${activeTab === 'audits' ? 'phieu-kiem-kho' : 'san-pham-kiem-kho'}-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}

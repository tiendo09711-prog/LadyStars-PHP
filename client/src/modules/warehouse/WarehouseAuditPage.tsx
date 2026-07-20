import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { useProductScanTarget } from '../../core/hooks/productScanner';
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
  isRootOwner?: boolean;
  isAdmin?: boolean;
  userWarehouseIds?: string[];
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

function modeLabel(audit: Pick<AuditRow, 'blindMode' | 'doubleCount'>) {
  const parts: string[] = [];
  if (audit.blindMode) parts.push('Đếm mù');
  if (audit.doubleCount) parts.push('Double');
  return parts.length ? parts.join(' · ') : 'Thường';
}

function statusBadgeClass(status: string) {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'RECONCILED' || normalized === 'COMPLETED') return 'success';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') return 'danger';
  if (normalized === 'SUBMITTED' || normalized === 'COUNTING') return 'warning';
  return 'neutral';
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
  const productKeywordRef = useRef<HTMLInputElement>(null);
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
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [bulkMenuPos, setBulkMenuPos] = useState<{ top: number; left: number } | null>(null);
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

  const openMenuAudit = useMemo(
    () => (openMenu ? auditRows.find((row) => row._id === openMenu) ?? null : null),
    [openMenu, auditRows],
  );

  const hasActiveFilters = useMemo(() => {
    if (activeTab === 'audits') {
      const defaults = defaultAuditFilters();
      return (
        appliedAuditFilters.warehouseId !== defaults.warehouseId
        || appliedAuditFilters.createdFrom !== defaults.createdFrom
        || appliedAuditFilters.createdTo !== defaults.createdTo
        || appliedAuditFilters.keyword !== defaults.keyword
        || appliedAuditFilters.auditType !== defaults.auditType
        || appliedAuditFilters.reconciliationStatus !== defaults.reconciliationStatus
        || appliedAuditFilters.note !== defaults.note
        || appliedAuditFilters.reconciledFrom !== defaults.reconciledFrom
        || appliedAuditFilters.reconciledTo !== defaults.reconciledTo
      );
    }
    const defaults = defaultItemFilters();
    return (
      appliedItemFilters.warehouseId !== defaults.warehouseId
      || appliedItemFilters.createdFrom !== defaults.createdFrom
      || appliedItemFilters.createdTo !== defaults.createdTo
      || appliedItemFilters.auditId !== defaults.auditId
      || appliedItemFilters.productKeyword !== defaults.productKeyword
      || appliedItemFilters.varianceType !== defaults.varianceType
    );
  }, [activeTab, appliedAuditFilters, appliedItemFilters]);

  const closeMenus = () => {
    setOpenMenu(null);
    setRowMenuPos(null);
    setShowBulkMenu(false);
    setBulkMenuPos(null);
  };

  /**
   * Position a fixed portal menu next to a trigger.
   * Prefer below-right; flip above only when below space is insufficient AND above has more room.
   * Avoid the old bug: overestimated height forced `top = 8` (menu jumps to page top).
   */
  const positionMenu = (
    trigger: HTMLElement,
    menuWidth: number,
    menuHeight: number,
  ) => {
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - gap;
    const spaceAbove = rect.top - gap;

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > vw - 8) {
      left = Math.max(8, vw - menuWidth - 8);
    }

    let top = rect.bottom + gap;
    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      top = rect.top - menuHeight - gap;
    }
    // Clamp inside viewport — never snap to a meaningless corner
    const maxTop = Math.max(8, vh - Math.min(menuHeight, vh - 16) - 8);
    top = Math.min(Math.max(8, top), maxTop);

    return { top, left };
  };

  const estimateRowMenuHeight = (audit: AuditRow) => {
    // Base: Xem chi tiết + Xuất CSV (+ padding)
    let items = 2;
    if (audit.availableActions.some((action) => action.action === 'reconcile')) items += 1;
    if (audit.linkedInventoryBillIds.length) items += 1;
    // Reverse comes from availableActions (backend already gates ADMIN/root)
    if (audit.availableActions.some((action) => action.action === 'reverse-reconcile')) items += 1;
    if (audit.availableActions.some((action) => action.action === 'cancel')) items += 1;
    if (audit.canDelete) items += 1;
    return 12 + items * 38;
  };

  const openRowActionMenu = (auditId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (openMenu === auditId) {
      setOpenMenu(null);
      setRowMenuPos(null);
      return;
    }
    const audit = auditRows.find((row) => row._id === auditId);
    const menuHeight = audit ? estimateRowMenuHeight(audit) : 160;
    setShowBulkMenu(false);
    setBulkMenuPos(null);
    setRowMenuPos(positionMenu(event.currentTarget, 200, menuHeight));
    setOpenMenu(auditId);
  };

  const toggleBulkMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (showBulkMenu) {
      setShowBulkMenu(false);
      setBulkMenuPos(null);
      return;
    }
    setOpenMenu(null);
    setRowMenuPos(null);
    setBulkMenuPos(positionMenu(event.currentTarget, 220, 100));
    setShowBulkMenu(true);
  };

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
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const el = target instanceof Element ? target : target.parentElement;
      // Keep open when interacting with trigger buttons or portal menus
      if (el?.closest('.audit-bulk-menu, .audit-actions, .audit-row-action-menu--portal, .audit-bulk-action-menu--portal')) {
        return;
      }
      closeMenus();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const refresh = async () => {
    closeMenus();
    await load();
  };

  const changeTab = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedIds(new Set());
    closeMenus();
  };

  const applyCurrentFilters = () => {
    setPage(1);
    closeMenus();
    if (activeTab === 'audits') setAppliedAuditFilters(auditFilters);
    else setAppliedItemFilters(itemFilters);
  };

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();
    applyCurrentFilters();
  };

  useProductScanTarget(productKeywordRef, (rawBarcode) => {
    if (activeTab !== 'items') return;
    const query = rawBarcode.trim();
    if (!query) return;
    setItemFilters((current) => {
      const next = { ...current, productKeyword: query };
      setPage(1);
      setAppliedItemFilters(next);
      return next;
    });
    window.setTimeout(() => productKeywordRef.current?.focus(), 0);
  });

  const resetCurrentFilters = () => {
    setPage(1);
    closeMenus();
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
    closeMenus();
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
    }
  };

  const openReconcilePreview = async (audit: AuditRow) => {
    closeMenus();
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
    closeMenus();
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

  const canMerge = useMemo(() => {
    if (selectedAuditRows.length < 2) return false;
    // Only Nháp / Đang kiểm, same warehouse, not already merged (backend re-validates).
    for (const row of selectedAuditRows) {
      const st = String(row.status || '').toUpperCase();
      if (st !== 'DRAFT' && st !== 'COUNTING') return false;
      if (row.mergedIntoAuditId) return false;
    }
    const warehouses = new Set(selectedAuditRows.map((row) => String(row.warehouseId || '')));
    if (warehouses.size !== 1) return false;
    const only = [...warehouses][0];
    return Boolean(only);
  }, [selectedAuditRows]);
  const auditColumnCount = 12;
  const itemColumnCount = 15;
  const currentTitle = activeTab === 'audits' ? 'Kiểm kho' : 'Sản phẩm kiểm kho';
  const entityLabel = activeTab === 'audits' ? 'phiếu' : 'dòng';
  const sortLabel = activeTab === 'audits' ? 'Mới nhất trước' : 'Theo phiếu / sản phẩm';

  const auditTable = (
    <div className="table-scroll audit-table-scroll warehouse-audit-table">
      <table className="data-table audit-data-table audit-table audit-data-table--audits">
        <colgroup>
          <col className="col-check" style={{ width: 42 }} />
          <col className="col-id-date" style={{ width: 195 }} />
          <col className="col-type" style={{ width: 115 }} />
          <col className="col-mode" style={{ width: 85 }} />
          <col className="col-warehouse" style={{ width: 130 }} />
          <col className="col-creator" style={{ width: 100 }} />
          <col className="col-sp" style={{ width: 70 }} />
          <col className="col-qty" style={{ width: 80 }} />
          <col className="col-note" style={{ width: 220 }} />
          <col className="col-variance" style={{ width: 85 }} />
          <col className="col-reconcile" style={{ width: 115 }} />
          <col className="col-action" style={{ width: 68 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="check-cell">
              <input
                type="checkbox"
                aria-label="Chọn tất cả phiếu kiểm kho"
                checked={auditRows.length > 0 && selectedIds.size > 0 && selectedIds.size === auditRows.filter((row) => !row.mergedIntoAuditId).length}
                onChange={(event) => toggleSelectAll(event.target.checked)}
              />
            </th>
            <th className="col-id-date">ID | Ngày</th>
            <th className="col-type">Loại kiểm kho</th>
            <th className="col-mode audit-col-center">Chế độ</th>
            <th className="col-warehouse">Kho hàng</th>
            <th className="col-creator">Người tạo</th>
            <th className="col-sp audit-number">SP</th>
            <th className="col-qty audit-number">SL kiểm</th>
            <th className="col-note">Ghi chú</th>
            <th className="col-variance audit-number">Chênh lệch</th>
            <th className="col-reconcile audit-col-center">Bù trừ kiểm kho</th>
            <th className="action-cell" scope="col">Thao Tác</th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }).map((_, index) => (
            <tr className="wr-skeleton" key={`audit-skeleton-${index}`}>
              <td colSpan={auditColumnCount}><span /></td>
            </tr>
          ))}
          {!loading && auditRows.length === 0 && (
            <tr>
              <td className="audit-empty-cell" colSpan={auditColumnCount}>
                <div className="audit-empty-state">
                  <ClipboardCheck size={28} />
                  <strong>Chưa có phiếu kiểm kho</strong>
                  <span>Thử đổi bộ lọc hoặc tạo phiếu kiểm kho mới.</span>
                </div>
              </td>
            </tr>
          )}
          {!loading && auditRows.map((audit) => (
            <tr key={audit._id}>
              <td className="check-cell">
                <input
                  type="checkbox"
                  aria-label={`Chọn phiếu ${audit.code}`}
                  disabled={Boolean(audit.mergedIntoAuditId)}
                  checked={selectedIds.has(audit._id)}
                  onChange={(event) => toggleSelectRow(audit._id, event.target.checked)}
                />
              </td>
              <td className="col-id-date audit-name-cell">
                <button type="button" className="audit-link-button" onClick={() => navigate(`/warehouse/audit/${audit._id}`)}>
                  {audit.code}
                </button>
                <div className="audit-name-sub">{formatDate(audit.createdAt)}</div>
              </td>
              <td className="col-type audit-name-cell">
                <div className="audit-name-main">{audit.auditTypeLabel}</div>
                <span className={`audit-status-badge ${statusBadgeClass(audit.status)}`}>{audit.statusLabel}</span>
              </td>
              <td className="col-mode audit-col-center">
                <span className="audit-status-badge neutral">{modeLabel(audit)}</span>
              </td>
              <td className="col-warehouse">{audit.warehouseName || '—'}</td>
              <td className="col-creator audit-name-cell">
                <div className="audit-name-main">{audit.createdByName || '—'}</div>
                {audit.mergedIntoAuditId ? <div className="audit-name-sub">Đã gộp sang phiếu khác</div> : null}
              </td>
              <td className="col-sp audit-number">{formatNumber(audit.summary.itemCount)}</td>
              <td className="col-qty audit-number">{formatNumber(audit.summary.physicalQuantityTotal)}</td>
              <td className="col-note audit-note-cell" title={audit.note || undefined}>{audit.note || '—'}</td>
              <td className={`col-variance audit-number ${varianceClass(audit.summary.varianceQuantityTotal)}`}>{signedNumber(audit.summary.varianceQuantityTotal)}</td>
              <td className="col-reconcile audit-col-center audit-name-cell">
                {audit.status === 'RECONCILED' ? (
                  <>
                    <span className="audit-status-badge success">Đã bù trừ</span>
                    <div className="audit-name-sub">
                      {audit.reconciledByName || '—'} · {formatDateTime(audit.reconciledAt)}
                    </div>
                    {audit.linkedInventoryBillCodes.length ? (
                      <div className="audit-name-sub">{audit.linkedInventoryBillCodes.join(', ')}</div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="audit-status-badge neutral">Chưa bù trừ</span>
                    <div className="audit-name-sub">
                      Dư {formatNumber(audit.summary.excessItemCount)} · Thiếu {formatNumber(audit.summary.shortageItemCount)}
                    </div>
                  </>
                )}
              </td>
              <td className="action-cell">
                <div className="audit-actions">
                  <button
                    className="audit-row-menu-button"
                    type="button"
                    aria-label={`Thao tác phiếu ${audit.code}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === audit._id}
                    onClick={(event) => openRowActionMenu(audit._id, event)}
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const itemTable = (
    <div className="table-scroll audit-table-scroll warehouse-audit-table">
      <table className="data-table audit-data-table audit-table audit-data-table--items">
        <colgroup>
          <col className="col-date" style={{ width: 95 }} />
          <col className="col-warehouse" style={{ width: 120 }} />
          <col className="col-product" style={{ width: 200 }} />
          <col className="col-location" style={{ width: 90 }} />
          <col className="col-counter" style={{ width: 100 }} />
          <col className="col-cost" style={{ width: 90 }} />
          <col className="col-price" style={{ width: 90 }} />
          <col className="col-sys" style={{ width: 85 }} />
          <col className="col-transit" style={{ width: 85 }} />
          <col className="col-phys" style={{ width: 85 }} />
          <col className="col-count2" style={{ width: 80 }} />
          <col className="col-variance" style={{ width: 80 }} />
          <col className="col-reason" style={{ width: 100 }} />
          <col className="col-desc" style={{ width: 240 }} />
          <col className="col-action" style={{ width: 60 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="col-date audit-col-center">Ngày</th>
            <th className="col-warehouse">Kho</th>
            <th className="col-product">Tên sản phẩm</th>
            <th className="col-location audit-col-center">Vị trí/kệ</th>
            <th className="col-counter">Người đếm</th>
            <th className="col-cost audit-number">Giá vốn</th>
            <th className="col-price audit-number">Giá bán</th>
            <th className="col-sys audit-number">Tồn hệ thống</th>
            <th className="col-transit audit-number">Đang chuyển</th>
            <th className="col-phys audit-number">Tồn thực tế</th>
            <th className="col-count2 audit-number">Đếm lần 2</th>
            <th className="col-variance audit-number">Chênh lệch</th>
            <th className="col-reason">Lý do</th>
            <th className="col-desc">Mô tả</th>
            <th className="action-cell" scope="col">Thao Tác</th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }).map((_, index) => (
            <tr className="wr-skeleton" key={`item-skeleton-${index}`}>
              <td colSpan={itemColumnCount}><span /></td>
            </tr>
          ))}
          {!loading && itemRows.length === 0 && (
            <tr>
              <td className="audit-empty-cell" colSpan={itemColumnCount}>
                <div className="audit-empty-state">
                  <PackageSearch size={28} />
                  <strong>Chưa có sản phẩm kiểm kho</strong>
                  <span>Thử đổi bộ lọc hoặc mở tab phiếu kiểm kho.</span>
                </div>
              </td>
            </tr>
          )}
          {!loading && itemRows.map((item) => (
            <tr key={item._id}>
              <td className="col-date audit-col-center">
                <button type="button" className="audit-link-button" onClick={() => navigate(`/warehouse/audit/${item.auditId}`)}>
                  {formatDate(item.createdAt)}
                </button>
              </td>
              <td className="col-warehouse">{item.warehouseName || '—'}</td>
              <td className="col-product audit-name-cell">
                <button type="button" className="audit-link-button audit-name-main" onClick={() => navigate(`/warehouse/audit/${item.auditId}`)}>
                  {item.productNameSnapshot || '—'}
                </button>
                <div className="audit-name-sub">{item.productCodeSnapshot || item.barcodeSnapshot || '—'}</div>
              </td>
              <td className="col-location audit-col-center">{item.location || '—'}</td>
              <td className="col-counter">{item.assignedToName || item.countedByName || '—'}{item.countedByName2 ? ` / ${item.countedByName2}` : ''}</td>
              <td className="col-cost audit-number">{formatMoney(item.costPriceSnapshot)}</td>
              <td className="col-price audit-number">{formatMoney(item.salePriceSnapshot)}</td>
              <td className="col-sys audit-number">{formatNumber(item.systemQuantitySnapshot)}</td>
              <td className="col-transit audit-number">{formatNumber(item.inTransitQuantitySnapshot)}</td>
              <td className="col-phys audit-number">{formatNumber(item.physicalQuantity)}</td>
              <td className="col-count2 audit-number">{formatNumber(item.physicalQuantity2)}</td>
              <td className={`col-variance audit-number ${varianceClass(item.varianceQuantity)}`}>{signedNumber(item.varianceQuantity)}</td>
              <td className="col-reason">{item.varianceReasonLabel || (item.varianceQuantity === 0 ? '—' : 'Chưa chọn')}</td>
              <td className="col-desc audit-note-cell" title={item.note || undefined}>{item.note || '—'}</td>
              <td className="action-cell">
                <div className="audit-actions">
                  <button
                    className="audit-row-menu-button"
                    type="button"
                    onClick={() => navigate(`/warehouse/audit/${item.auditId}`)}
                    title="Mở phiếu kiểm kho"
                    aria-label={`Mở phiếu kiểm kho ${item.auditCode || item.auditId}`}
                  >
                    <Eye size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page-stack audit-root warehouse-audit-admin" ref={rootRef}>
      <section className="data-card audit-toolbar-card audit-sticky-toolbar">
        <div className="audit-toolbar-header-slot">
          <div className="audit-compact-head">
            <h1 className="audit-compact-heading-sr">{currentTitle}</h1>
            <div className="audit-tabs-row audit-tabs-row--title-slot">
              <div className="audit-tabbar is-compact" role="tablist" aria-label="Kiểm kho tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'audits'}
                  aria-controls="audit-table-panel"
                  className={`audit-tab is-compact${activeTab === 'audits' ? ' is-active' : ''}`}
                  onClick={() => changeTab('audits')}
                >
                  <ClipboardCheck size={14} /> Kiểm kho
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'items'}
                  aria-controls="audit-table-panel"
                  className={`audit-tab is-compact${activeTab === 'items' ? ' is-active' : ''}`}
                  onClick={() => changeTab('items')}
                >
                  <PackageSearch size={14} /> Sản phẩm kiểm kho
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="audit-summary-strip" aria-label="Tóm tắt Kiểm kho">
          <div className="audit-summary-cluster">
            <span className="audit-summary-main">
              <strong>{total.toLocaleString('vi-VN')}</strong>
              <span>{entityLabel}</span>
            </span>
            {activeTab === 'audits' && selectedIds.size > 0 ? (
              <>
                <span className="audit-summary-divider" aria-hidden="true" />
                <span>{selectedIds.size.toLocaleString('vi-VN')} đã chọn</span>
              </>
            ) : null}
            {hasActiveFilters ? (
              <>
                <span className="audit-summary-divider" aria-hidden="true" />
                <span className="audit-summary-filter">Đang lọc</span>
              </>
            ) : null}
            {dashboard ? (
              <>
                <span className="audit-summary-divider" aria-hidden="true" />
                <span title="Dòng đã đếm / tổng dòng">
                  Đếm {formatNumber(dashboard.countedItemCount)}/{formatNumber(dashboard.itemCount)}
                </span>
                <span className="audit-summary-divider" aria-hidden="true" />
                <span className={varianceClass(dashboard.totalVarianceQuantity)} title="Tổng chênh lệch">
                  Lệch {signedNumber(dashboard.totalVarianceQuantity)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <form className="audit-filter-bar" onSubmit={handleFilterSubmit}>
          {activeTab === 'audits' ? (
            <>
              <div className="audit-search">
                <Search size={15} />
                <input
                  value={auditFilters.keyword}
                  onChange={(event) => setAuditFilters({ ...auditFilters, keyword: event.target.value })}
                  placeholder="ID phiếu kiểm kho"
                />
              </div>
              <select
                className="audit-filter-select"
                value={auditFilters.warehouseId}
                onChange={(event) => setAuditFilters({ ...auditFilters, warehouseId: event.target.value })}
              >
                <option value="">Kho hàng</option>
                {meta.warehouses.map((warehouse) => (
                  <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>
                ))}
              </select>
              <input
                className="audit-filter-select"
                type="date"
                value={auditFilters.createdFrom}
                onChange={(event) => setAuditFilters({ ...auditFilters, createdFrom: event.target.value })}
                title="Từ ngày tạo"
              />
              <input
                className="audit-filter-select"
                type="date"
                value={auditFilters.createdTo}
                onChange={(event) => setAuditFilters({ ...auditFilters, createdTo: event.target.value })}
                title="Đến ngày tạo"
              />
              <select
                className="audit-filter-select"
                value={auditFilters.auditType}
                onChange={(event) => setAuditFilters({ ...auditFilters, auditType: event.target.value })}
              >
                <option value="">Loại kiểm kho</option>
                {meta.auditTypes.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                className="audit-filter-select"
                value={auditFilters.reconciliationStatus}
                onChange={(event) => setAuditFilters({ ...auditFilters, reconciliationStatus: event.target.value })}
              >
                <option value="">Trạng thái bù trừ</option>
                {meta.reconciliationStatuses.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="audit-search audit-search--note">
                <Search size={15} />
                <input
                  value={auditFilters.note}
                  onChange={(event) => setAuditFilters({ ...auditFilters, note: event.target.value })}
                  placeholder="Ghi chú"
                />
              </div>
            </>
          ) : (
            <>
              <div className="audit-search">
                <Search size={15} />
                <input
                  ref={productKeywordRef}
                  value={itemFilters.productKeyword}
                  onChange={(event) => setItemFilters({ ...itemFilters, productKeyword: event.target.value })}
                  data-product-search-scan="true"
                  data-product-search-primary="true"
                  placeholder="Sản phẩm / quét barcode"
                />
              </div>
              <select
                className="audit-filter-select"
                value={itemFilters.warehouseId}
                onChange={(event) => setItemFilters({ ...itemFilters, warehouseId: event.target.value })}
              >
                <option value="">Kho hàng</option>
                {meta.warehouses.map((warehouse) => (
                  <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>
                ))}
              </select>
              <input
                className="audit-filter-select"
                type="date"
                value={itemFilters.createdFrom}
                onChange={(event) => setItemFilters({ ...itemFilters, createdFrom: event.target.value })}
                title="Từ ngày"
              />
              <input
                className="audit-filter-select"
                type="date"
                value={itemFilters.createdTo}
                onChange={(event) => setItemFilters({ ...itemFilters, createdTo: event.target.value })}
                title="Đến ngày"
              />
              <div className="audit-search audit-search--note">
                <Search size={15} />
                <input
                  value={itemFilters.auditId}
                  onChange={(event) => setItemFilters({ ...itemFilters, auditId: event.target.value })}
                  placeholder="ID phiếu kiểm kho"
                />
              </div>
              <select
                className="audit-filter-select"
                value={itemFilters.varianceType}
                onChange={(event) => setItemFilters({ ...itemFilters, varianceType: event.target.value })}
              >
                <option value="">Trạng thái chênh lệch</option>
                <option value="EXCESS">Dư hàng</option>
                <option value="SHORTAGE">Thiếu hàng</option>
                <option value="BALANCED">Không chênh lệch</option>
              </select>
            </>
          )}

          <div className="audit-filter-actions">
            <button className="audit-btn audit-btn-primary" type="submit">Lọc</button>
            <button className="audit-btn audit-btn-secondary" type="button" onClick={resetCurrentFilters} title="Đặt lại bộ lọc">
              <RefreshCw size={14} /> Đặt lại
            </button>
            {activeTab === 'audits' ? (
              <button className="audit-btn audit-btn-primary" type="button" onClick={() => navigate('/warehouse/audit/create')}>
                <Plus size={14} /> Thêm mới
              </button>
            ) : null}
            <div className={`audit-floating-menu audit-bulk-menu${showBulkMenu ? ' is-open' : ''}`}>
              <button
                className="audit-btn audit-btn-secondary"
                type="button"
                aria-expanded={showBulkMenu}
                aria-haspopup="menu"
                onClick={toggleBulkMenu}
              >
                <ChevronDown size={14} /> Thao tác
              </button>
            </div>
          </div>
        </form>

        {activeTab === 'audits' ? (
          <div className="audit-suggestions" aria-label="Gợi ý kiểm kho">
            <div className="audit-suggestions-head">
              <strong>Gợi ý kiểm kho</strong>
              <span>Ưu tiên SP lâu chưa kiểm, tồn cao hoặc từng lệch</span>
              <button className="audit-btn audit-btn-secondary audit-btn-sm" type="button" onClick={() => void loadSuggestions()}>
                Làm mới gợi ý
              </button>
            </div>
            {suggestions.length ? (
              <div className="audit-suggestion-list">
                {suggestions.slice(0, 6).map((item) => (
                  <button
                    key={item.productId}
                    type="button"
                    onClick={() => {
                      const warehouseId = auditFilters.warehouseId
                        || appliedAuditFilters.warehouseId
                        || meta.warehouses[0]?.value
                        || '';
                      const params = new URLSearchParams();
                      if (warehouseId) params.set('warehouseId', warehouseId);
                      if (item.productId) params.set('productId', item.productId);
                      const qs = params.toString();
                      navigate(qs ? `/warehouse/audit/create?${qs}` : '/warehouse/audit/create');
                    }}
                  >
                    <strong>{item.productName}</strong>
                    <small>
                      {item.productCode || '—'} · Tồn {formatNumber(item.currentStock)} · {item.reasons.join(', ') || 'Nên kiểm lại'}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <span className="audit-suggestions-empty">Chưa có gợi ý hoặc chưa chọn kho.</span>
            )}
          </div>
        ) : null}
      </section>

      {notice ? (
        <div className="audit-notice" role="status">
          <Check size={15} /> {notice}
        </div>
      ) : null}
      {error ? (
        <div className="audit-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Đóng</button>
        </div>
      ) : null}

      <section className="data-card audit-table-card" id="audit-table-panel">
        <div className="data-card-header audit-table-header">
          <div>
            <h2 className="audit-table-title">Bảng dữ liệu {currentTitle}</h2>
            <p className="audit-table-subtitle">
              {total.toLocaleString('vi-VN')} bản ghi · {pageRange(page, total, PAGE_LIMIT)} · Sắp xếp {sortLabel}
            </p>
          </div>
          {activeTab === 'audits' && selectedIds.size > 0 ? (
            <span className="audit-selected-count">{selectedIds.size.toLocaleString('vi-VN')} đã chọn</span>
          ) : null}
        </div>

        {activeTab === 'audits' ? auditTable : itemTable}
        <Pagination page={page} total={total} limit={PAGE_LIMIT} onPageChange={setPage} />
      </section>

      {showBulkMenu && bulkMenuPos
        ? createPortal(
            <div
              className="audit-floating-dropdown audit-bulk-action-menu--portal"
              role="menu"
              style={{
                position: 'fixed',
                top: `${bulkMenuPos.top}px`,
                left: `${bulkMenuPos.left}px`,
                zIndex: 10050,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="audit-dropdown-item"
                disabled={exportLoading}
                onClick={() => {
                  closeMenus();
                  setShowExportModal(true);
                }}
              >
                <FileDown size={15} /> Xuất dữ liệu
              </button>
              {activeTab === 'audits' ? (
                <button
                  type="button"
                  role="menuitem"
                  className="audit-dropdown-item"
                  disabled={!canMerge || actionLoading}
                  onClick={() => {
                    closeMenus();
                    setConfirm({ kind: 'merge', auditIds: selectedAuditRows.map((row) => row._id), note: '' });
                  }}
                >
                  <Link2 size={15} /> Gộp phiếu đã chọn
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {openMenuAudit && rowMenuPos
        ? createPortal(
            <div
              className="audit-row-action-menu audit-row-action-menu--portal"
              role="menu"
              style={{
                position: 'fixed',
                top: `${rowMenuPos.top}px`,
                left: `${rowMenuPos.left}px`,
                zIndex: 10050,
              }}
            >
              <button type="button" role="menuitem" onClick={() => { closeMenus(); navigate(`/warehouse/audit/${openMenuAudit._id}`); }}>
                <Eye size={15} /> Xem chi tiết
              </button>
              <button type="button" role="menuitem" onClick={() => void exportAuditProducts(openMenuAudit)}>
                <FileDown size={15} /> Xuất CSV sản phẩm
              </button>
              {openMenuAudit.availableActions.some((action) => action.action === 'reconcile') ? (
                <button type="button" role="menuitem" onClick={() => void openReconcilePreview(openMenuAudit)}>
                  <Check size={15} /> Bù trừ kiểm kho
                </button>
              ) : null}
              {openMenuAudit.linkedInventoryBillIds.length ? (
                <button type="button" role="menuitem" onClick={() => void openVoucherViewer(openMenuAudit)}>
                  <Link2 size={15} /> Xem phiếu XNK
                </button>
              ) : null}
              {openMenuAudit.availableActions.some((action) => action.action === 'reverse-reconcile') ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenus();
                    setConfirm({ kind: 'reverse', audit: openMenuAudit, reason: '' });
                  }}
                >
                  <RefreshCw size={15} /> Đảo bù trừ
                </button>
              ) : null}
              {openMenuAudit.availableActions.some((action) => action.action === 'cancel') ? (
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    closeMenus();
                    setConfirm({ kind: 'cancel', audit: openMenuAudit, reason: '' });
                  }}
                >
                  <X size={15} /> Hủy phiếu
                </button>
              ) : null}
              {openMenuAudit.canDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    closeMenus();
                    setConfirm({ kind: 'delete', audit: openMenuAudit });
                  }}
                >
                  <Trash2 size={15} /> Xóa phiếu nháp
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

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
                {confirm.kind === 'cancel'
                  ? 'Hủy phiếu kiểm kho'
                  : confirm.kind === 'delete'
                    ? 'Xóa phiếu nháp'
                    : confirm.kind === 'reverse'
                      ? 'Đảo bù trừ kiểm kho'
                      : 'Gộp phiếu kiểm kho'}
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
            {confirm.kind === 'reverse' ? (
              <>
                <p>
                  Phiếu <strong>{confirm.audit.code}</strong> sẽ được đảo bù trừ và chuyển về trạng thái đang kiểm. Vui lòng nhập lý do.
                </p>
                <div className="audit-modal-body">
                  <textarea
                    className="audit-textarea"
                    placeholder="Nhập lý do đảo bù trừ..."
                    value={confirm.reason}
                    onChange={(event) => setConfirm({ ...confirm, reason: event.target.value })}
                  />
                </div>
              </>
            ) : null}
            <footer className="audit-modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Đóng</button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  actionLoading
                  || ((confirm.kind === 'cancel' || confirm.kind === 'reverse') && !confirm.reason.trim())
                }
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

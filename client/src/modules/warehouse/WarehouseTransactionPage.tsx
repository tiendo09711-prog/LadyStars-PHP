import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';
import { suggestProducts, suggestWarehouseBills } from '../../core/api/filterSuggestions';
import { Pagination } from '../../core/components/Pagination';
import { FilterSuggestInput } from '../../core/components/ui/FilterSuggestInput';
import { useProductScanTarget } from '../../core/hooks/productScanner';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import './warehouseRecords.css';
import './warehouse-transactions-page.css';
import './warehouse-transactions-soft-type.css';

type TabKey = 'bills' | 'items';

const TRANSACTION_TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: 'bills', label: 'Phiếu xuất nhập kho', icon: FileText },
  { key: 'items', label: 'Sản phẩm xuất nhập kho', icon: Boxes },
];

type SelectOption = {
  value: string;
  label: string;
  code?: string;
};

type TransactionMeta = {
  warehouses: SelectOption[];
  types: SelectOption[];
  kinds: SelectOption[];
  isAdmin?: boolean;
};

type TransactionRow = {
  rowKey: string;
  source: string;
  sourceId: string;
  itemSourceId?: string;
  code?: string;
  billCode?: string;
  date: string;
  warehouseId?: string;
  warehouseName?: string;
  fromWarehouseId?: string;
  fromWarehouseName?: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  productId?: string;
  productCode?: string;
  productName?: string;
  barcode?: string;
  imei?: string;
  quantity?: number;
  unitPrice?: number;
  totalProductLines?: number;
  totalQuantity?: number;
  totalAmount?: number;
  type: string;
  kind: string;
  kindLabel: string;
  sourceModule: string;
  createdByName?: string;
  customerName?: string;
  customerPhone?: string;
  relatedCode?: string;
  note?: string;
  status?: string;
  directionLabel: string;
  directionTone: string;
  canDelete: boolean;
};

type TransactionDetail = TransactionRow & {
  items: TransactionRow[];
};

type FilterState = {
  warehouseId: string;
  billId: string;
  type: string;
  kind: string;
  fromDate: string;
  toDate: string;
  productKeyword: string;
};

type ColumnDefinition = {
  key: string;
  label: string;
  fixed?: boolean;
};

const LIMIT = 20;

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
  return { fromDate: formatDateInput(start), toDate: formatDateInput(end) };
}
const defaultTransactionFilters = (): FilterState => ({
  warehouseId: '',
  billId: '',
  type: '',
  kind: '',
  ...defaultDateRange(),
  productKeyword: '',
});

/** Compare YYYY-MM-DD as plain strings to avoid timezone shifts from Date parsing. */
function isInvertedDateRange(fromDate: string, toDate: string): boolean {
  if (!fromDate || !toDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return false;
  return fromDate > toDate;
}

const billColumns: ColumnDefinition[] = [
  { key: 'identity', label: 'ID | Ngày', fixed: true },
  { key: 'warehouse', label: 'Kho hàng' },
  { key: 'products', label: 'SP' },
  { key: 'quantity', label: 'SL' },
  { key: 'amount', label: 'Tổng tiền thanh toán' },
  { key: 'direction', label: 'Loại giao dịch' },
  { key: 'creator', label: 'Người tạo' },
  { key: 'note', label: 'Ghi chú' },
];

const itemColumns: ColumnDefinition[] = [
  { key: 'identity', label: 'ID | Ngày', fixed: true },
  { key: 'warehouse', label: 'Kho hàng' },
  { key: 'product', label: 'Sản phẩm' },
  { key: 'quantity', label: 'SL' },
  { key: 'price', label: 'Giá' },
  { key: 'direction', label: 'Loại giao dịch' },
  { key: 'amount', label: 'Tổng tiền' },
  { key: 'note', label: 'Ghi chú' },
];

function defaultVisibility(columns: ColumnDefinition[]) {
  return Object.fromEntries(columns.map((column) => [column.key, true]));
}

function formatMoney(value?: number) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function warehouseDisplay(row: TransactionRow) {
  if (row.kind === 'TRANSFER') {
    // Use neutral '-' instead of inventing "Kho nguồn"/"Kho đích" when names missing from source
    return `${row.fromWarehouseName || '-'} → ${row.toWarehouseName || '-'}`;
  }
  return row.warehouseName || '-';
}

function getBillCode(row: TransactionRow) {
  return row.code || row.billCode || row.sourceId;
}

function detailTitle(detail: TransactionDetail) {
  if (detail.kind === 'TRANSFER') return `Phiếu chuyển kho: ${getBillCode(detail)}`;
  if (detail.type === 'IMPORT') return `Hóa đơn nhập kho: ${getBillCode(detail)}`;
  if (detail.type === 'EXPORT') return `Hóa đơn xuất kho: ${getBillCode(detail)}`;
  // Unknown or other type: neutral title, do not fabricate import/export label
  return `Chi tiết phiếu: ${getBillCode(detail)}`;
}

function buildTransactionExportColumns(tab: TabKey): ColumnOption[] {
  if (tab === 'bills') {
    return [
      { label: 'ID phiếu', key: 'code', getValue: (row: TransactionRow) => getBillCode(row) },
      { label: 'Ngày', key: 'date', getValue: (row: TransactionRow) => formatDate(row.date) },
      { label: 'Kho hàng', key: 'warehouse', getValue: (row: TransactionRow) => warehouseDisplay(row) },
      { label: 'Số sản phẩm', key: 'totalProductLines', getValue: (row: TransactionRow) => row.totalProductLines || 0 },
      { label: 'Số lượng', key: 'totalQuantity', getValue: (row: TransactionRow) => row.totalQuantity || 0 },
      { label: 'Tổng tiền', key: 'totalAmount', getValue: (row: TransactionRow) => row.totalAmount || 0 },
      { label: 'Loại giao dịch', key: 'kindLabel', getValue: (row: TransactionRow) => row.kindLabel },
      { label: 'Người tạo', key: 'createdByName', getValue: (row: TransactionRow) => row.createdByName || '' },
      { label: 'Ghi chú', key: 'note', getValue: (row: TransactionRow) => row.note || '' },
    ];
  }
  return [
    { label: 'ID phiếu', key: 'code', getValue: (row: TransactionRow) => getBillCode(row) },
    { label: 'Ngày', key: 'date', getValue: (row: TransactionRow) => formatDate(row.date) },
    { label: 'Kho hàng', key: 'warehouse', getValue: (row: TransactionRow) => warehouseDisplay(row) },
    { label: 'Mã sản phẩm', key: 'productCode', getValue: (row: TransactionRow) => row.productCode || '' },
    { label: 'Sản phẩm', key: 'productName', getValue: (row: TransactionRow) => row.productName || '' },
    { label: 'Mã vạch', key: 'barcode', getValue: (row: TransactionRow) => row.barcode || '' },
    { label: 'Số lượng', key: 'quantity', getValue: (row: TransactionRow) => row.quantity || 0 },
    { label: 'Giá', key: 'unitPrice', getValue: (row: TransactionRow) => row.unitPrice || 0 },
    { label: 'Tổng tiền', key: 'totalAmount', getValue: (row: TransactionRow) => row.totalAmount || 0 },
    { label: 'Loại giao dịch', key: 'kindLabel', getValue: (row: TransactionRow) => row.kindLabel },
    { label: 'Ghi chú', key: 'note', getValue: (row: TransactionRow) => row.note || '' },
  ];
}

export function WarehouseTransactionPage() {
  const navigate = useNavigate();
  const menuRootRef = useRef<HTMLDivElement>(null);
  const listRequestSeq = useRef(0);
  const fromDateInputRef = useRef<HTMLInputElement>(null);
  const productKeywordRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('bills');
  const [meta, setMeta] = useState<TransactionMeta>({ warehouses: [], types: [], kinds: [] });
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftFilters, setDraftFilters] = useState<Record<TabKey, FilterState>>({
    bills: defaultTransactionFilters(),
    items: defaultTransactionFilters(),
  });
  const [appliedFilters, setAppliedFilters] = useState<Record<TabKey, FilterState>>({
    bills: defaultTransactionFilters(),
    items: defaultTransactionFilters(),
  });
  const [openCreateMenu, setOpenCreateMenu] = useState(false);
  const [openBulkMenu, setOpenBulkMenu] = useState(false);
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteRows, setDeleteRows] = useState<TransactionRow[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [billVisibility, setBillVisibility] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('warehouse-transactions-bill-columns');
    return saved ? { ...defaultVisibility(billColumns), ...JSON.parse(saved) } : defaultVisibility(billColumns);
  });
  const [itemVisibility, setItemVisibility] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('warehouse-transactions-item-columns');
    return saved ? { ...defaultVisibility(itemColumns), ...JSON.parse(saved) } : defaultVisibility(itemColumns);
  });
  const [columnDraft, setColumnDraft] = useState<Record<string, boolean>>({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const columns = activeTab === 'bills' ? billColumns : itemColumns;
  const visibility = activeTab === 'bills' ? billVisibility : itemVisibility;
  const currentFilters = draftFilters[activeTab];
  const exportColumns = useMemo(() => buildTransactionExportColumns(activeTab), [activeTab]);
  const visibleColumnCount = columns.filter((column) => visibility[column.key]).length;
  const currentTabMeta = TRANSACTION_TABS.find((tab) => tab.key === activeTab) || TRANSACTION_TABS[0];
  const rangeLabel = total > 0
    ? `${((page - 1) * LIMIT + 1).toLocaleString('vi-VN')}–${Math.min(page * LIMIT, total).toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')}`
    : '0 bản ghi';
  const listSettledOk = !loading && !error;
  const showEmptyState = listSettledOk && rows.length === 0;

  const hasActiveFilters = useMemo(() => {
    const applied = appliedFilters[activeTab];
    const defaults = defaultTransactionFilters();
    return (
      applied.warehouseId !== defaults.warehouseId
      || applied.billId !== defaults.billId
      || applied.type !== defaults.type
      || applied.kind !== defaults.kind
      || applied.fromDate !== defaults.fromDate
      || applied.toDate !== defaults.toDate
      || applied.productKeyword !== defaults.productKeyword
    );
  }, [activeTab, appliedFilters]);

  const openRowItem = openRowKey ? rows.find((row) => row.rowKey === openRowKey) ?? null : null;

  const closeMenus = () => {
    setOpenCreateMenu(false);
    setOpenBulkMenu(false);
    setOpenRowKey(null);
    setRowMenuPos(null);
  };

  const openRowActionMenu = (rowKey: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (openRowKey === rowKey) {
      setOpenRowKey(null);
      setRowMenuPos(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 150;
    const gap = 6;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - gap);
    }
    setOpenCreateMenu(false);
    setOpenBulkMenu(false);
    setRowMenuPos({ top, left });
    setOpenRowKey(rowKey);
  };

  const load = async (signal?: AbortSignal) => {
    const seq = ++listRequestSeq.current;
    setLoading(true);
    setError('');
    try {
      const params = {
        ...appliedFilters[activeTab],
        page,
        limit: LIMIT,
      };
      const response = await http.get(`/warehouse/transactions/${activeTab}`, { params, signal });
      // Ignore stale responses (aborted or superseded by a newer load).
      if (seq !== listRequestSeq.current) return;
      setRows(Array.isArray(response.data?.items) ? response.data.items : (Array.isArray(response.data?.data) ? response.data.data : []));
      setTotal(Number(response.data?.total ?? 0));
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED' || seq !== listRequestSeq.current) return;
      // Clear previous rows so a failed request never looks like real current data.
      setRows([]);
      setTotal(0);
      setError(err.response?.data?.message || 'Không tải được dữ liệu xuất nhập kho.');
    } finally {
      // Always clear loading for the latest request, including when an older one was aborted mid-flight.
      if (seq === listRequestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    http.get('/warehouse/transactions/meta', { signal: controller.signal })
      .then((response) => {
        const data = response.data || {};
        setMeta({
          warehouses: data.warehouses || [],
          types: data.types || [],
          kinds: data.kinds || [],
          isAdmin: data.isAdmin,
        });
        // EMPLOYEE: default warehouse filter = first assigned (meta already scoped).
        const isAdmin = data.isAdmin === true;
        const warehouses: SelectOption[] = data.warehouses || [];
        if (!isAdmin && warehouses.length > 0) {
          const allowed = new Set(warehouses.map((w) => String(w.value)));
          const pick = (current: string) =>
            (current && allowed.has(String(current)) ? current : String(warehouses[0].value));
          setDraftFilters((current) => ({
            bills: { ...current.bills, warehouseId: pick(current.bills.warehouseId) },
            items: { ...current.items, warehouseId: pick(current.items.warehouseId) },
          }));
          setAppliedFilters((current) => ({
            bills: { ...current.bills, warehouseId: pick(current.bills.warehouseId) },
            items: { ...current.items, warehouseId: pick(current.items.warehouseId) },
          }));
        }
      })
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Không tải được bộ lọc kho hàng.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // load closes over activeTab/page/appliedFilters; intentional deps for list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, appliedFilters]);

  useEffect(() => {
    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (menuRootRef.current?.contains(target)) return;
      const portalMenu = document.querySelector('.wt-row-action-menu--portal');
      if (portalMenu?.contains(target)) return;
      closeMenus();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilterError('');
    setDraftFilters((current) => ({
      ...current,
      [activeTab]: { ...current[activeTab], [key]: value },
    }));
  };

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    closeMenus();
    const draft = draftFilters[activeTab];
    if (isInvertedDateRange(draft.fromDate, draft.toDate)) {
      setFilterError('Từ ngày không được lớn hơn Đến ngày.');
      fromDateInputRef.current?.focus();
      return;
    }
    setFilterError('');
    setPage(1);
    setAppliedFilters((current) => ({ ...current, [activeTab]: { ...draft } }));
  };

  useProductScanTarget(productKeywordRef, (rawBarcode) => {
    if (activeTab !== 'items') return;
    const query = rawBarcode.trim();
    if (!query) return;
    setFilterError('');
    setDraftFilters((current) => {
      const nextDraft = { ...current.items, productKeyword: query };
      if (isInvertedDateRange(nextDraft.fromDate, nextDraft.toDate)) {
        setFilterError('Từ ngày không được lớn hơn Đến ngày.');
        return { ...current, items: nextDraft };
      }
      setPage(1);
      setAppliedFilters((applied) => ({ ...applied, items: nextDraft }));
      return { ...current, items: nextDraft };
    });
    window.setTimeout(() => productKeywordRef.current?.focus(), 0);
  });

  const resetFilters = () => {
    closeMenus();
    setFilterError('');
    setPage(1);
    const nextFilters = defaultTransactionFilters();
    // EMPLOYEE: keep warehouse on first assigned after reset (not "all stores").
    if (meta.isAdmin !== true && meta.warehouses.length > 0) {
      nextFilters.warehouseId = String(meta.warehouses[0].value);
    }
    setDraftFilters((current) => ({ ...current, [activeTab]: nextFilters }));
    setAppliedFilters((current) => ({ ...current, [activeTab]: nextFilters }));
  };

  const refreshData = () => {
    closeMenus();
    void load();
  };

  const changeTab = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
    closeMenus();
  };

  const openDetail = async (row: TransactionRow) => {
    closeMenus();
    setDetailLoading(true);
    setError('');
    try {
      const response = await http.get(`/warehouse/transactions/bills/${row.source}/${row.sourceId}`);
      setDetail(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được chi tiết phiếu.');
    } finally {
      setDetailLoading(false);
    }
  };

  const exportRows = (data: TransactionRow[], filename: string) => {
    if (!data.length) {
      setNotice('Không có dữ liệu để xuất.');
      return;
    }
    const mapped = data.map((row) => activeTab === 'bills'
      ? {
          'ID phiếu': getBillCode(row),
          Ngày: formatDate(row.date),
          'Kho hàng': warehouseDisplay(row),
          'Số sản phẩm': row.totalProductLines || 0,
          'Số lượng': row.totalQuantity || 0,
          'Tổng tiền': row.totalAmount || 0,
          'Loại giao dịch': row.kindLabel,
          'Người tạo': row.createdByName || '',
          'Ghi chú': row.note || '',
        }
      : {
          'ID phiếu': getBillCode(row),
          Ngày: formatDate(row.date),
          'Kho hàng': warehouseDisplay(row),
          'Mã sản phẩm': row.productCode || '',
          'Sản phẩm': row.productName || '',
          'Mã vạch': row.barcode || '',
          'Số lượng': row.quantity || 0,
          Giá: row.unitPrice || 0,
          'Tổng tiền': row.totalAmount || 0,
          'Loại giao dịch': row.kindLabel,
          'Ghi chú': row.note || '',
        });
    const worksheet = XLSX.utils.json_to_sheet(mapped);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === 'bills' ? 'Phiếu XNK' : 'Sản phẩm XNK');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    closeMenus();
  };

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    setError('');
    try {
      let dataToExport: TransactionRow[] = [];
      if (exportType === 'current') {
        dataToExport = rows;
      } else {
        const pageSize = 200;
        const filters = appliedFilters[activeTab];
        const firstResponse = await http.get(`/warehouse/transactions/${activeTab}`, {
          params: { ...filters, page: 1, limit: pageSize },
        });
        let allItems: TransactionRow[] = [...(firstResponse.data.items || [])];
        const totalRows = Number(firstResponse.data.total || 0);
        const pagesToFetch = Math.ceil(totalRows / pageSize);
        if (pagesToFetch > 1) {
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) =>
              http.get(`/warehouse/transactions/${activeTab}`, {
                params: { ...filters, page: index + 2, limit: pageSize },
              }),
            ),
          );
          responses.forEach((response) => {
            allItems = allItems.concat(response.data.items || []);
          });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setNotice('Không có dữ liệu để xuất.');
        setShowExportModal(false);
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
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Trang tính 1');
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  const requestDelete = (targets: TransactionRow[]) => {
    if (!targets.length) {
      setNotice('Vui lòng chọn ít nhất một phiếu.');
      return;
    }
    if (targets.some((row) => !row.canDelete)) {
      setNotice('Có phiếu liên kết phải hủy tại module nghiệp vụ gốc.');
      return;
    }
    setDeleteRows(targets);
    closeMenus();
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    setError('');
    try {
      if (deleteRows.length === 1) {
        const row = deleteRows[0];
        const response = await http.delete(`/warehouse/transactions/bills/${row.source}/${row.sourceId}`);
        setNotice(response.data.message || 'Đã xóa phiếu.');
      } else {
        const response = await http.post('/warehouse/transactions/bills/bulk-delete', {
          rows: deleteRows.map((row) => ({ source: row.source, sourceId: row.sourceId })),
        });
        setNotice(response.data.message || 'Đã xóa các phiếu đã chọn.');
      }
      setDeleteRows([]);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể xóa phiếu.');
      setDeleteRows([]);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openColumnModal = () => {
    setColumnDraft({ ...visibility });
    setColumnModalOpen(true);
    closeMenus();
  };

  const saveColumns = () => {
    if (activeTab === 'bills') {
      setBillVisibility(columnDraft);
      localStorage.setItem('warehouse-transactions-bill-columns', JSON.stringify(columnDraft));
    } else {
      setItemVisibility(columnDraft);
      localStorage.setItem('warehouse-transactions-item-columns', JSON.stringify(columnDraft));
    }
    setColumnModalOpen(false);
  };

  const resetColumns = () => {
    setColumnDraft(defaultVisibility(columns));
  };

  const renderWarehouseCell = (row: TransactionRow) => (
    <div className={row.kind === 'TRANSFER' ? 'wr-warehouse-transfer wt-warehouse-cell' : 'wt-warehouse-cell'}>
      {row.kind === 'TRANSFER' ? (
        <>
          {/* Neutral placeholders; do not fabricate warehouse names */}
          <span>{row.fromWarehouseName || '-'}</span>
          <ArrowLeftRight size={14} aria-hidden="true" />
          <span>{row.toWarehouseName || '-'}</span>
        </>
      ) : (
        <span>{row.warehouseName || '-'}</span>
      )}
    </div>
  );

  return (
    <div className="workspace-page warehouse-records wt-root compact-page" ref={menuRootRef}>
      <section className="data-card wt-toolbar-card wt-sticky-toolbar">
        <div className="wt-toolbar-header-slot">
          <div className="wt-compact-head">
            <h1 className="wt-compact-heading-sr">{currentTabMeta.label}</h1>
            <div className="wt-tabs-row wt-tabs-row--title-slot">
              <div className="wt-tabbar is-compact" role="tablist" aria-label="Xuất nhập kho">
                {TRANSACTION_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="wt-data-table"
                      className={'wt-tab is-compact' + (isActive ? ' is-active' : '')}
                      onClick={() => changeTab(tab.key)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="wt-summary-strip" aria-label="Tóm tắt xuất nhập kho">
          <div className="wt-summary-cluster" aria-live="polite">
            {loading ? (
              <span className="wt-summary-loading">Đang tải dữ liệu…</span>
            ) : error ? (
              <span className="wt-summary-error">Không tải được dữ liệu</span>
            ) : (
              <>
                <span className="wt-summary-main">
                  <strong>{total.toLocaleString('vi-VN')}</strong>
                  <span>{activeTab === 'bills' ? 'phiếu' : 'dòng SP'}</span>
                </span>
                <span className="wt-summary-divider" aria-hidden="true" />
                <span>{rangeLabel}</span>
              </>
            )}
            {!loading && !error && hasActiveFilters ? (
              <>
                <span className="wt-summary-divider" aria-hidden="true" />
                <span className="wt-summary-filter">Đang lọc</span>
              </>
            ) : null}
          </div>
        </div>

        <form
          className={`wt-filter-bar wt-filter-bar--balanced${activeTab === 'items' ? ' wt-filter-bar--items' : ' wt-filter-bar--bills'}`}
          onSubmit={applyFilters}
        >
          {/* Row 1: primary filters + Lọc (mirrors /warehouse/transfers "Tất cả") */}
          <select
            className="wt-filter-select"
            value={currentFilters.warehouseId}
            onChange={(event) => updateFilter('warehouseId', event.target.value)}
            title="Kho hàng"
            aria-label="Kho hàng"
          >
            <option value="">
              {meta.isAdmin === true ? 'Tất cả kho' : 'Tất cả kho được gán'}
            </option>
            {meta.warehouses.map((warehouse) => (
              <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>
            ))}
          </select>

          <div className="wt-search wt-search--compact">
            <Search size={15} aria-hidden="true" />
            <FilterSuggestInput
              bare
              value={currentFilters.billId}
              onChange={(next) => updateFilter('billId', next)}
              fetchSuggestions={suggestWarehouseBills}
              placeholder="ID phiếu"
              aria-label="ID phiếu"
            />
          </div>

          <select
            className="wt-filter-select"
            value={currentFilters.type}
            onChange={(event) => updateFilter('type', event.target.value)}
            title="Loại"
            aria-label="Loại giao dịch"
          >
            <option value="">Loại</option>
            {meta.types.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>

          <select
            className="wt-filter-select wt-filter-select--wide"
            value={currentFilters.kind}
            onChange={(event) => updateFilter('kind', event.target.value)}
            title="Kiểu"
            aria-label="Kiểu giao dịch"
          >
            <option value="">Kiểu</option>
            {meta.kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>

          {activeTab === 'items' ? (
            <div className="wt-search wt-search--product">
              <Search size={15} aria-hidden="true" />
              <FilterSuggestInput
                bare
                ref={productKeywordRef}
                value={currentFilters.productKeyword}
                onChange={(next) => updateFilter('productKeyword', next)}
                fetchSuggestions={suggestProducts}
                data-product-search-scan="true"
                data-product-search-primary="true"
                placeholder="Tên, mã, mã vạch — quét barcode"
                aria-label="Tìm sản phẩm"
              />
            </div>
          ) : null}

          <input
            ref={fromDateInputRef}
            className="wt-filter-select"
            type="date"
            value={currentFilters.fromDate}
            onChange={(event) => updateFilter('fromDate', event.target.value)}
            title="Từ ngày"
            aria-label="Từ ngày"
            aria-invalid={filterError ? true : undefined}
          />
          <input
            className="wt-filter-select"
            type="date"
            value={currentFilters.toDate}
            onChange={(event) => updateFilter('toDate', event.target.value)}
            title="Đến ngày"
            aria-label="Đến ngày"
            aria-invalid={filterError ? true : undefined}
          />

          <button className="wt-btn wt-btn-primary wt-filter-apply" type="submit">
            <Filter size={14} aria-hidden="true" />
            Lọc
          </button>

          {/* Row 2: secondary / create actions, right-aligned */}
          <div className="wt-filter-actions">
            <button className="wt-btn wt-btn-secondary" type="button" onClick={resetFilters} title="Đặt lại bộ lọc">
              <RefreshCw size={14} aria-hidden="true" />
              Đặt lại
            </button>
            <button className="wt-btn wt-btn-secondary" type="button" onClick={refreshData} title="Làm mới" aria-label="Làm mới">
              <RefreshCw size={14} aria-hidden="true" />
              Làm mới
            </button>

            <div className="wt-floating-menu">
              <button
                className="wt-btn wt-btn-primary"
                type="button"
                aria-expanded={openCreateMenu}
                aria-haspopup="menu"
                onClick={() => {
                  setOpenBulkMenu(false);
                  setOpenRowKey(null);
                  setRowMenuPos(null);
                  setOpenCreateMenu((current) => !current);
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Thêm mới
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {openCreateMenu ? (
                <div className="wt-floating-dropdown" role="menu">
                  <button className="wt-dropdown-item" type="button" role="menuitem" onClick={() => navigate('/warehouse/transactions/vouchers/import')}>
                    <ArrowDownLeft size={15} aria-hidden="true" />
                    <span>Nhập kho</span>
                  </button>
                  <button className="wt-dropdown-item" type="button" role="menuitem" onClick={() => navigate('/warehouse/transactions/vouchers/export')}>
                    <ArrowUpRight size={15} aria-hidden="true" />
                    <span>Xuất kho</span>
                  </button>
                  {activeTab === 'bills' ? (
                    <>
                      <button className="wt-dropdown-item" type="button" role="menuitem" onClick={() => navigate('/warehouse/transfers/create')}>
                        <ArrowLeftRight size={15} aria-hidden="true" />
                        <span>Chuyển kho</span>
                      </button>
                      <button className="wt-dropdown-item" type="button" role="menuitem" onClick={() => navigate('/warehouse/transactions/vouchers/excel')}>
                        <FileSpreadsheet size={15} aria-hidden="true" />
                        <span>Nhập từ Excel</span>
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="wt-floating-menu wt-bulk-menu">
              <button
                className="wt-btn wt-btn-secondary"
                type="button"
                aria-expanded={openBulkMenu}
                aria-haspopup="menu"
                onClick={() => {
                  setOpenCreateMenu(false);
                  setOpenRowKey(null);
                  setRowMenuPos(null);
                  setOpenBulkMenu((current) => !current);
                }}
              >
                <span>Thao tác</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {openBulkMenu ? (
                <div className="wt-floating-dropdown" role="menu">
                  <button
                    className="wt-dropdown-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenBulkMenu(false);
                      setShowExportModal(true);
                    }}
                  >
                    <FileDown size={15} aria-hidden="true" />
                    <span>Xuất dữ liệu</span>
                  </button>
                  <button className="wt-dropdown-item" type="button" role="menuitem" onClick={openColumnModal}>
                    <Settings2 size={15} aria-hidden="true" />
                    <span>Tùy chỉnh cột</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </section>

      {filterError ? (
        <div className="wt-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{filterError}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="wt-notice">
          <Check size={16} aria-hidden="true" />
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="wt-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>Thử lại</button>
        </div>
      ) : null}

      <section className="data-card wt-table-card">
        <div className="data-card-header wt-table-header">
          <div>
            <h2 className="wt-table-title">Bảng dữ liệu xuất nhập kho</h2>
            <p className="wt-table-subtitle">
              {loading
                ? `Đang tải · ${currentTabMeta.label}`
                : error
                  ? `Lỗi tải dữ liệu · ${currentTabMeta.label}`
                  : `${total.toLocaleString('vi-VN')} bản ghi · ${currentTabMeta.label} · ${rangeLabel}`}
            </p>
          </div>
        </div>

        <div className="table-scroll wt-table-scroll">
          <table
            className={`data-table wt-data-table warehouse-transaction-table wt-data-table--${activeTab}`}
            id="wt-data-table"
          >
            <thead>
              <tr>
                {columns.map((column) => visibility[column.key] && (
                  <th
                    key={column.key}
                    className={`wt-col wt-col-${column.key}`}
                    scope="col"
                  >
                    {column.label}
                  </th>
                ))}
                <th className="action-cell wt-col wt-col-actions" scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, index) => (
                <tr className="wt-skeleton" key={`loading-${index}`}>
                  <td colSpan={visibleColumnCount + 1}><span /></td>
                </tr>
              ))}
              {showEmptyState && (
                <tr>
                  <td className="wt-empty-cell" colSpan={visibleColumnCount + 1}>
                    <div className="wt-empty-state">
                      <Boxes size={28} aria-hidden="true" />
                      <strong>Chưa có dữ liệu</strong>
                      <span>Thử đổi bộ lọc hoặc thêm phiếu xuất/nhập kho mới.</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !error && rows.map((row) => (
                <tr key={row.rowKey}>
                  {visibility.identity && (
                    <td className="wt-col wt-col-identity wt-identity-cell">
                      <div className="id-date-cell">
                        <button type="button" className="wt-link-button id-date-cell__id" onClick={() => void openDetail(row)}>
                          {getBillCode(row)}
                        </button>
                        <span className="id-date-cell__date date">{formatDate(row.date)}</span>
                      </div>
                    </td>
                  )}
                  {visibility.warehouse && (
                    <td className="wt-col wt-col-warehouse">{renderWarehouseCell(row)}</td>
                  )}
                  {activeTab === 'bills' && visibility.products && (
                    <td className="wt-col wt-col-products wt-number wt-col--center">
                      {Number(row.totalProductLines || 0).toLocaleString('vi-VN')}
                    </td>
                  )}
                  {activeTab === 'items' && visibility.product && (
                    <td className="wt-col wt-col-product wt-name-cell">
                      <div className="wt-name-main">{row.productName || '-'}</div>
                      <div className="wt-name-sub">{[row.productCode, row.barcode].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                  )}
                  {visibility.quantity && (
                    <td className="wt-col wt-col-quantity wt-number wt-col--center">
                      {Number(activeTab === 'bills' ? row.totalQuantity : row.quantity || 0).toLocaleString('vi-VN')}
                    </td>
                  )}
                  {activeTab === 'items' && visibility.price && (
                    <td className="wt-col wt-col-price wt-price wt-col--center">
                      {formatMoney(row.unitPrice)}
                    </td>
                  )}
                  {/* Items: direction before amount (matches itemColumns header order) */}
                  {activeTab === 'items' && visibility.direction && (
                    <td className="wt-col wt-col-direction wt-col--center">
                      <span className={`wt-status-badge wr-direction ${row.directionTone || 'neutral'}`}>
                        {row.directionLabel || row.kindLabel || 'Không xác định'}
                      </span>
                      <small className="wt-kind">{row.kindLabel || '-'}</small>
                    </td>
                  )}
                  {visibility.amount && (
                    <td className="wt-col wt-col-amount wt-price wt-col--center">
                      {formatMoney(row.totalAmount)}
                    </td>
                  )}
                  {/* Bills: amount then direction (matches billColumns header order) */}
                  {activeTab === 'bills' && visibility.direction && (
                    <td className="wt-col wt-col-direction wt-col--center">
                      <span className={`wt-status-badge wr-direction ${row.directionTone || 'neutral'}`}>
                        {row.directionLabel || row.kindLabel || 'Không xác định'}
                      </span>
                      <small className="wt-kind">{row.kindLabel || '-'}</small>
                    </td>
                  )}
                  {activeTab === 'bills' && visibility.creator && (
                    <td className="wt-col wt-col-creator">{row.createdByName || '-'}</td>
                  )}
                  {visibility.note && (
                    <td className="wt-col wt-col-note wt-note-cell" title={row.note || undefined}>
                      <div className={`wt-note-wrap${activeTab === 'items' ? ' wt-note-wrap--clamp' : ''}`}>
                        {row.note || '-'}
                      </div>
                    </td>
                  )}
                  <td className="action-cell wt-col wt-col-actions">
                    <div className="wt-actions flex w-full items-center justify-center">
                      <button
                        className="wt-row-menu-button"
                        type="button"
                        aria-label={`Mở thao tác cho ${getBillCode(row)}`}
                        aria-expanded={openRowKey === row.rowKey}
                        aria-haspopup="menu"
                        onClick={(event) => openRowActionMenu(row.rowKey, event)}
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

        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </section>

      {openRowItem && rowMenuPos
        ? createPortal(
            <div
              className="wt-row-action-menu wt-row-action-menu--portal"
              role="menu"
              style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
            >
              <button type="button" role="menuitem" onClick={() => void openDetail(openRowItem)}>
                <Eye size={15} aria-hidden="true" />
                Xem chi tiết phiếu
              </button>
              <button type="button" role="menuitem" onClick={() => exportRows([openRowItem], `phieu-${getBillCode(openRowItem)}`)}>
                <FileDown size={15} aria-hidden="true" />
                Xuất dữ liệu
              </button>
              {openRowItem.canDelete && activeTab === 'bills' ? (
                <button className="danger" type="button" role="menuitem" onClick={() => requestDelete([openRowItem])}>
                  <Trash2 size={15} aria-hidden="true" />
                  Xóa phiếu
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {(detailLoading || detail) && (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !detailLoading) setDetail(null);
        }}>
          <section className="wr-detail-modal" role="dialog" aria-modal="true" aria-label="Chi tiết phiếu xuất nhập kho">
            {detailLoading && <div className="wr-detail-loading">Đang tải chi tiết phiếu...</div>}
            {!detailLoading && detail && (
              <>
                <header className="wr-detail-header">
                  <div>
                    <span className="wr-detail-eyebrow">{detail.kindLabel}</span>
                    <h2>{detailTitle(detail)}</h2>
                  </div>
                  <div className="wr-detail-actions">
                    <button className="wr-icon-button" type="button" aria-label="Đóng chi tiết" onClick={() => setDetail(null)}><X size={17} /></button>
                  </div>
                </header>

                <div className="wr-detail-summary">
                  <div><span>Kho hàng</span><strong>{warehouseDisplay(detail)}</strong></div>
                  <div><span>Ngày tạo</span><strong>{formatDate(detail.date)}</strong></div>
                  <div><span>Người tạo</span><strong>{detail.createdByName || '-'}</strong></div>
                  <div><span>Tổng tiền</span><strong>{formatMoney(detail.totalAmount)} đ</strong></div>
                  {detail.customerName && <div><span>Khách hàng</span><strong>{detail.customerName}</strong></div>}
                  {detail.relatedCode && <div><span>Phiếu liên quan</span><strong>{detail.relatedCode}</strong></div>}
                  <div className="wide"><span>Ghi chú</span><strong>{detail.note || '-'}</strong></div>
                </div>

                <div className="wr-detail-table-wrap">
                  <table className="wr-table wr-detail-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Sản phẩm</th>
                        <th>Mã</th>
                        <th>SL</th>
                        <th>Giá</th>
                        <th>Tổng</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item, index) => (
                        <tr key={item.rowKey}>
                          <td className="center">{index + 1}</td>
                          <td className="wr-product"><strong>{item.productName || '-'}</strong><small>{item.barcode || ''}</small></td>
                          <td>{item.productCode || '-'}</td>
                          <td className="right">{Number(item.quantity || 0).toLocaleString('vi-VN')}</td>
                          <td className="right">{formatMoney(item.unitPrice)}</td>
                          <td className="right">{formatMoney(item.totalAmount)}</td>
                          <td>{item.note || '-'}</td>
                        </tr>
                      ))}
                      {!detail.items.length && <tr><td className="wr-empty" colSpan={7}>Phiếu chưa có dòng sản phẩm.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {deleteRows.length > 0 && (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-confirm-modal" role="dialog" aria-modal="true" aria-label="Xác nhận xóa phiếu">
            <header>
              <h2>Thông báo</h2>
              <button className="wr-icon-button" type="button" aria-label="Đóng xác nhận" onClick={() => setDeleteRows([])}><X size={16} /></button>
            </header>
            <p>Bạn có chắc chắn muốn xóa {deleteRows.length > 1 ? `${deleteRows.length} phiếu đã chọn` : `phiếu ${getBillCode(deleteRows[0])}`}? Tồn kho sẽ được hoàn tác theo nghiệp vụ.</p>
            <footer>
              <button className="btn btn-light" type="button" onClick={() => setDeleteRows([])}>Hủy</button>
              <button className="btn btn-danger" type="button" disabled={deleteLoading} onClick={() => void confirmDelete()}>
                <Check size={15} /> {deleteLoading ? 'Đang xóa...' : 'Xóa'}
              </button>
            </footer>
          </section>
        </div>
      )}

      {columnModalOpen && (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation">
          <section className="wr-column-modal" role="dialog" aria-modal="true" aria-label="Tùy chỉnh hiển thị">
            <header>
              <h2>Tùy chỉnh hiển thị</h2>
              <button className="wr-icon-button" type="button" aria-label="Đóng tùy chỉnh cột" onClick={() => setColumnModalOpen(false)}><X size={16} /></button>
            </header>
            <div className="wr-column-list">
              {columns.map((column) => (
                <label key={column.key} className={column.fixed ? 'fixed' : ''}>
                  <input
                    type="checkbox"
                    checked={columnDraft[column.key] !== false}
                    disabled={column.fixed}
                    onChange={(event) => setColumnDraft((current) => ({ ...current, [column.key]: event.target.checked }))}
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
            <footer>
              <button className="btn btn-light" type="button" onClick={resetColumns}>Quay về mặc định</button>
              <button className="btn wr-save-button" type="button" onClick={saveColumns}><Check size={15} /> Lưu</button>
            </footer>
          </section>
        </div>
      )}

      {showExportModal && (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title={'Xuất Excel - ' + (activeTab === 'bills' ? 'Phiếu xuất nhập kho' : 'Sản phẩm xuất nhập kho')}
          defaultFilename={'xuat-nhap-kho-' + activeTab + '-' + new Date().toISOString().slice(0, 10)}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      )}
    </div>
  );
}

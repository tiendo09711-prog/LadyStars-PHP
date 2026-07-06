import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { Pagination } from '../../core/components/Pagination';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import './warehouseRecords.css';

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

const emptyFilters: FilterState = {
  warehouseId: '',
  billId: '',
  type: '',
  kind: '',
  ...defaultDateRange(),
  productKeyword: '',
};

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
    return `${row.fromWarehouseName || 'Kho nguồn'} → ${row.toWarehouseName || 'Kho đích'}`;
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
  const [activeTab, setActiveTab] = useState<TabKey>('bills');
  const [meta, setMeta] = useState<TransactionMeta>({ warehouses: [], types: [], kinds: [] });
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftFilters, setDraftFilters] = useState<Record<TabKey, FilterState>>({
    bills: defaultTransactionFilters(),
    items: defaultTransactionFilters(),
  });
  const [appliedFilters, setAppliedFilters] = useState<Record<TabKey, FilterState>>({
    bills: defaultTransactionFilters(),
    items: defaultTransactionFilters(),
  });
  const [openMenu, setOpenMenu] = useState<string | null>(null);
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

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        ...appliedFilters[activeTab],
        page,
        limit: LIMIT,
      };
      const response = await http.get(`/warehouse/transactions/${activeTab}`, { params, signal });
      setRows(response.data.items || []);
      setTotal(Number(response.data.total || 0));
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED') return;
      setError(err.response?.data?.message || 'Không tải được dữ liệu xuất nhập kho.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    http.get('/warehouse/transactions/meta', { signal: controller.signal })
      .then((response) => setMeta(response.data))
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Không tải được bộ lọc kho hàng.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [activeTab, page, appliedFilters]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setDraftFilters((current) => ({
      ...current,
      [activeTab]: { ...current[activeTab], [key]: value },
    }));
  };

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters((current) => ({ ...current, [activeTab]: { ...draftFilters[activeTab] } }));
  };

  const resetFilters = () => {
    setPage(1);
    const nextFilters = defaultTransactionFilters();
    setDraftFilters((current) => ({ ...current, [activeTab]: nextFilters }));
    setAppliedFilters((current) => ({ ...current, [activeTab]: nextFilters }));
  };

  const refreshData = () => {
    setOpenMenu(null);
    void load();
  };

  const changeTab = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
    setOpenMenu(null);
  };

  const openDetail = async (row: TransactionRow) => {
    setOpenMenu(null);
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
    setOpenMenu(null);
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
    setOpenMenu(null);
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
    setOpenMenu(null);
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
    <div className={row.kind === 'TRANSFER' ? 'wr-warehouse-transfer' : ''}>
      {row.kind === 'TRANSFER' ? (
        <>
          <span>{row.fromWarehouseName || 'Kho nguồn'}</span>
          <ArrowLeftRight size={14} />
          <span>{row.toWarehouseName || 'Kho đích'}</span>
        </>
      ) : row.warehouseName || '-'}
    </div>
  );

  return (
    <div className="workspace-page warehouse-records" ref={menuRootRef}>
      <section className="wr-card">
        <div className="wr-transfer-tabbar" role="tablist" aria-label="Xuất nhập kho">
          {TRANSACTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={'wr-transfer-tab ' + (isActive ? 'is-active' : '')}
                onClick={() => changeTab(tab.key)}
              >
                <Icon size={17} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <form className="wr-filters" onSubmit={applyFilters}>
          <select className="wr-filter" value={currentFilters.warehouseId} onChange={(event) => updateFilter('warehouseId', event.target.value)}>
            <option value="">Kho hàng</option>
            {meta.warehouses.map((warehouse) => <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>)}
          </select>
          <label className="wr-search-field">
            <Search size={14} />
            <input value={currentFilters.billId} onChange={(event) => updateFilter('billId', event.target.value)} placeholder="ID phiếu" />
          </label>
          <select className="wr-filter" value={currentFilters.type} onChange={(event) => updateFilter('type', event.target.value)}>
            <option value="">Loại</option>
            {meta.types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <select className="wr-filter wide" value={currentFilters.kind} onChange={(event) => updateFilter('kind', event.target.value)}>
            <option value="">Kiểu</option>
            {meta.kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
          {activeTab === 'items' && (
            <label className="wr-search-field wide">
              <Search size={14} />
              <input value={currentFilters.productKeyword} onChange={(event) => updateFilter('productKeyword', event.target.value)} placeholder="Tên, mã, mã vạch sản phẩm" />
            </label>
          )}
          <label className="wr-date-field">
            <span>Từ</span>
            <input type="date" value={currentFilters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} />
          </label>
          <label className="wr-date-field">
            <span>Đến</span>
            <input type="date" value={currentFilters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} />
          </label>
          <button className="btn btn-primary wr-filter-button" type="submit"><Filter size={15} /> Lọc</button>
          <button className="btn btn-light wr-reset-button" type="button" onClick={resetFilters}>Đặt lại</button>
        </form>

        <div className="wr-actions">
          <div className="wr-action-left">
            <div className="wr-menu">
              <button className="btn wr-create-button" type="button" onClick={() => setOpenMenu(openMenu === 'create' ? null : 'create')}>
                <Plus size={15} /> Thêm mới <ChevronDown size={14} />
              </button>
              {openMenu === 'create' && (
                <div className="wr-menu-panel wr-action-menu">
                  <button type="button" onClick={() => navigate('/warehouse/transactions/vouchers/import')}><ArrowDownLeft size={15} /> Nhập kho</button>
                  <button type="button" onClick={() => navigate('/warehouse/transactions/vouchers/export')}><ArrowUpRight size={15} /> Xuất kho</button>
                  {activeTab === 'bills' && (
                    <>
                      <button type="button" onClick={() => navigate('/warehouse/transfers/create')}><ArrowLeftRight size={15} /> Chuyển kho</button>
                      <button type="button" onClick={() => navigate('/warehouse/transactions/vouchers/excel')}><FileSpreadsheet size={15} /> Nhập từ Excel</button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button className="btn btn-light" type="button" onClick={() => setShowExportModal(true)}>
              <FileDown size={15} /> Xuất dữ liệu
            </button>
          </div>

          <div className="wr-action-right">
            <span className="wr-count">
              {total ? `${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} / ${total}` : '0 bản ghi'}
            </span>
            <button className="wr-icon-button" type="button" title="Làm mới" aria-label="Làm mới" onClick={refreshData}>
              <RefreshCw size={15} />
            </button>
            <button className="wr-icon-button" type="button" title="Tùy chỉnh cột" aria-label="Tùy chỉnh cột" onClick={openColumnModal}>
              <Settings2 size={15} />
            </button>
          </div>
        </div>

        {notice && <div className="wr-notice"><Check size={16} /> {notice}</div>}
        {error && (
          <div className="wr-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>Thử lại</button>
          </div>
        )}

        <div className="wr-table-wrap">
          <table className="wr-table">
            <thead>
              <tr>
                {columns.map((column) => visibility[column.key] && <th key={column.key}>{column.label}</th>)}
                <th className="wr-action-cell"><Settings2 size={14} /></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, index) => (
                <tr className="wr-skeleton" key={`loading-${index}`}>
                  <td colSpan={visibleColumnCount + 1}><span /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="wr-empty" colSpan={visibleColumnCount + 1}>Chưa có dữ liệu phù hợp với bộ lọc.</td>
                </tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.rowKey}>
                  {visibility.identity && (
                    <td className="wr-identity-cell">
                      <button type="button" className="wr-link" onClick={() => void openDetail(row)}>{getBillCode(row)}</button>
                      <span>{formatDate(row.date)}</span>
                    </td>
                  )}
                  {visibility.warehouse && <td>{renderWarehouseCell(row)}</td>}
                  {activeTab === 'bills' && visibility.products && <td className="right">{Number(row.totalProductLines || 0).toLocaleString('vi-VN')}</td>}
                  {activeTab === 'items' && visibility.product && (
                    <td className="wr-product">
                      <strong>{row.productName || '-'}</strong>
                      <small>{[row.productCode, row.barcode].filter(Boolean).join(' · ')}</small>
                    </td>
                  )}
                  {visibility.quantity && <td className="right">{Number(activeTab === 'bills' ? row.totalQuantity : row.quantity || 0).toLocaleString('vi-VN')}</td>}
                  {activeTab === 'items' && visibility.price && <td className="right">{formatMoney(row.unitPrice)}</td>}
                  {visibility.amount && <td className="right">{formatMoney(row.totalAmount)}</td>}
                  {visibility.direction && (
                    <td>
                      <span className={`wr-direction ${row.directionTone}`}>{row.directionLabel}</span>
                      <small className="wr-kind">{row.kindLabel}</small>
                    </td>
                  )}
                  {activeTab === 'bills' && visibility.creator && <td>{row.createdByName || '-'}</td>}
                  {visibility.note && <td className="wr-note-cell" title={row.note || ''}>{row.note || '-'}</td>}
                  <td className="wr-action-cell">
                    <div className="wr-menu">
                      <button className="wr-row-menu-button" type="button" aria-label={`Mở thao tác cho ${getBillCode(row)}`} onClick={() => setOpenMenu(openMenu === row.rowKey ? null : row.rowKey)}>
                        <MoreHorizontal size={17} />
                      </button>
                      {openMenu === row.rowKey && (
                        <div className="wr-menu-panel wr-row-menu">
                          <button type="button" onClick={() => void openDetail(row)}><Eye size={15} /> Xem chi tiết phiếu</button>
                          <button type="button" onClick={() => exportRows([row], `phieu-${getBillCode(row)}`)}><FileDown size={15} /> Xuất dữ liệu</button>
                          {row.canDelete && activeTab === 'bills' && (
                            <button className="danger" type="button" onClick={() => requestDelete([row])}><Trash2 size={15} /> Xóa phiếu</button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </section>

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

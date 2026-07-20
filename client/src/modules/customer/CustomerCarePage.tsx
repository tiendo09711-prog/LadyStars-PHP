import { useState, useEffect, useMemo, useRef, type FormEvent, type ChangeEvent } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  HeartHandshake,
  FileDown,
  X,
  Users,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import { suggestCustomerCare } from '../../core/api/filterSuggestions';
import { Pagination } from '../../core/components/Pagination';
import { FilterSuggestInput } from '../../core/components/ui/FilterSuggestInput';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import { CareActionType, CareActionIcons, CustomerCareActionModal } from './components/CustomerCareActionModal';
import * as XLSX from 'xlsx';
import './customer-list-page.css';
import './customer-care-page.css';

const fields: any[] = [
  { key: 'code', label: 'ID Phiếu' },
  { key: 'customerName', label: 'Tên KH' },
  { key: 'customerPhone', label: 'SĐT' },
  { key: 'details', label: 'Chi tiết' },
  { key: 'reason', label: 'Lý do' },
  { key: 'description', label: 'Mô tả' },
  { key: 'creator', label: 'Người tạo' },
  { key: 'recordDate', label: 'Ngày tạo', type: 'date' },
];

const formFields: any[] = [
  { key: 'code', label: 'ID Phiếu (Có thể nhập hoặc sinh tự động)', required: true },
  { key: 'customerCode', label: 'Mã khách hàng (nếu có)' },
  { key: 'customerName', label: 'Tên khách hàng (Tự động điền nếu nhập Mã KH)' },
  { key: 'customerPhone', label: 'Số điện thoại (Tự động điền)' },
  { key: 'details', label: 'Chi tiết (Ví dụ: -65 điểm)', type: 'textarea' },
  { key: 'reason', label: 'Lý do' },
  { key: 'description', label: 'Mô tả', type: 'textarea' },
  { key: 'creator', label: 'Người tạo' },
  { key: 'recordDate', label: 'Ngày tạo', type: 'date' },
];

type SortField = 'createdAt' | 'code' | 'customerName' | 'customerPhone' | 'recordDate' | 'reason' | 'creator';
type SortOrder = 'asc' | 'desc';

type CareFilters = {
  keyword: string;
  reason: string;
  creator: string;
};

type CareRow = {
  _id: string;
  code?: string;
  customerCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  details?: string;
  reason?: string;
  description?: string;
  creator?: string;
  recordDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CareMeta = {
  reasons: string[];
  creators: string[];
};

const PAGE_SIZE = 20;

const DEFAULT_FILTERS: CareFilters = {
  keyword: '',
  reason: '',
  creator: '',
};

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'createdAt', label: 'Phiếu mới tạo' },
  { value: 'code', label: 'ID Phiếu' },
  { value: 'customerName', label: 'Tên khách hàng' },
  { value: 'customerPhone', label: 'SĐT' },
  { value: 'recordDate', label: 'Ngày tạo' },
  { value: 'reason', label: 'Lý do' },
  { value: 'creator', label: 'Người tạo' },
];

function generateCareCode() {
  return 'CC' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

function buildCreateDefaults(creatorName: string) {
  return {
    code: generateCareCode(),
    customerCode: '',
    customerName: '',
    customerPhone: '',
    customerId: '',
    details: '',
    reason: '',
    description: '',
    creator: creatorName,
    recordDate: new Date().toISOString().slice(0, 10),
  };
}

const EMPTY_FORM: Record<string, string> = {
  code: '',
  customerCode: '',
  customerName: '',
  customerPhone: '',
  customerId: '',
  details: '',
  reason: '',
  description: '',
  creator: '',
  recordDate: '',
};

export function CustomerCarePage() {
  const [meta, setMeta] = useState<CareMeta>({ reasons: [], creators: [] });
  const [creatorName, setCreatorName] = useState('');
  const [items, setItems] = useState<CareRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableBusy, setTableBusy] = useState(false);
  const [filters, setFilters] = useState<CareFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CareFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CareRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<CareActionType | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const actionsList: CareActionType[] = [
    'Tặng điểm', 'Trừ điểm', 'Tặng tiền tích lũy', 'Trừ tiền tích lũy',
    'Gọi điện', 'Nhắn tin', 'Gửi email', 'Nhận cuộc gọi', 'Import hành động chăm sóc',
  ];

  const loadMeta = async () => {
    const [metaRes, meRes] = await Promise.all([
      http.get<CareMeta>('/customers/care/meta').catch(() => ({ data: { reasons: [], creators: [] } })),
      http.get('/auth/me').catch(() => ({ data: {} })),
    ]);
    setMeta(metaRes.data || { reasons: [], creators: [] });
    setCreatorName(String((meRes as any).data?.name || ''));
  };

  /** Shared list params for loadCare + export-all (q, not raw filters.keyword). */
  const buildCareListParams = (
    nextPage: number,
    nextLimit: number,
    nextFilters: CareFilters = filters,
    nextSortField: SortField = sortField,
    nextSortOrder: SortOrder = sortOrder,
  ): Record<string, string | number> => {
    const params: Record<string, string | number> = {
      page: nextPage,
      limit: nextLimit,
      sort: nextSortField,
      order: nextSortOrder,
    };
    const q = nextFilters.keyword.trim();
    if (q) params.q = q;
    if (nextFilters.reason) params.reason = nextFilters.reason;
    if (nextFilters.creator) params.creator = nextFilters.creator;
    return params;
  };

  const loadCare = async () => {
    setError('');
    setLoading(items.length === 0);
    setTableBusy(items.length > 0);
    try {
      const params = buildCareListParams(page, PAGE_SIZE);
      const response = await http.get('/customers/care', { params });
      const nextItems: CareRow[] = response.data?.items || [];
      const nextTotal = Number(response.data?.total || 0);
      if (page > 1 && nextItems.length === 0 && nextTotal > 0) {
        setPage(page - 1);
        return;
      }
      setItems(nextItems);
      setTotal(nextTotal);
      setSelectedIds((current) => {
        const validIds = new Set(nextItems.map((item) => item._id));
        return new Set([...current].filter((id) => validIds.has(id)));
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được danh sách phiếu chăm sóc.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setTableBusy(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadMeta(), loadCare()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Support prefill from other pages (e.g. CustomerDetail "Ghi phiếu chăm sóc")
  useEffect(() => {
    const cid = searchParams.get('customerId') || '';
    const ccode = searchParams.get('customerCode') || '';
    const cname = searchParams.get('customerName') || '';
    const cphone = searchParams.get('customerPhone') || '';

    if ((cid || ccode || cname || cphone) && !modalOpen && !editingItem) {
      setForm((prev) => ({
        ...buildCreateDefaults(creatorName || prev.creator || ''),
        customerId: cid,
        customerCode: ccode || prev.customerCode,
        customerName: cname || prev.customerName,
        customerPhone: cphone || prev.customerPhone,
      }));
      setFormError('');
      setModalOpen(true);

      // Clean the query params after consuming (avoid re-trigger on reload)
      // Use replace to not add history entry
      const next = new URLSearchParams(searchParams);
      ['customerId', 'customerCode', 'customerName', 'customerPhone'].forEach(k => next.delete(k));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, creatorName]);

  useEffect(() => {
    void loadCare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, sortField, sortOrder]);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  useEffect(() => {
    if (!showActionMenu) return;
    const handler = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionMenu]);

  const handleSubmitFilters = (event?: FormEvent) => {
    event?.preventDefault();
    setPage(1);
    setFilters({
      keyword: draftFilters.keyword.trim(),
      reason: draftFilters.reason,
      creator: draftFilters.creator,
    });
  };

  const handleClearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setSortField('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  const handleRemoveChip = (key: keyof CareFilters) => {
    const next = { ...filters, [key]: '' };
    setFilters(next);
    setDraftFilters(next);
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    const nextOrder: SortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(nextOrder);
    setPage(1);
  };

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item._id));

  const toggleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(new Set(items.map((item) => item._id)));
      return;
    }
    setSelectedIds(new Set());
  };

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormError('');
    setForm(buildCreateDefaults(creatorName));
    setModalOpen(true);
  };

  const openEdit = (item: CareRow) => {
    setEditingItem(item);
    setFormError('');
    setForm({
      code: item.code || '',
      customerCode: item.customerCode || '',
      customerName: item.customerName || '',
      customerPhone: item.customerPhone || '',
      customerId: item.customerId || '',
      details: item.details || '',
      reason: item.reason || '',
      description: item.description || '',
      creator: item.creator || '',
      recordDate: item.recordDate ? String(item.recordDate).slice(0, 10) : '',
    });
    setModalOpen(true);
  };

  const handleFormChange = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const lookupCustomerByCode = async (code: string) => {
    const ccode = code.trim();
    if (!ccode) return;
    try {
      const res = await http.get('/customers/customers', { params: { code: ccode, limit: 1 } });
      const items = res.data?.items || res.data?.data || [];
      const c = items[0];
      if (c) {
        setForm((f) => ({
          ...f,
          customerName: f.customerName?.trim() ? f.customerName : (c.name || ''),
          customerPhone: f.customerPhone?.trim() ? f.customerPhone : (c.phone || ''),
          customerId: (c._id || c.id || '').toString() || f.customerId,
        }));
      }
    } catch { /* ignore */ }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const codeTrim = String(form.code || '').trim();
    if (!codeTrim) {
      setFormError('Vui lòng nhập ID phiếu.');
      return;
    }
    const hasCustomer = !!(form.customerName.trim() || form.customerPhone.trim() || form.customerCode.trim());
    if (!hasCustomer) {
      setFormError('Vui lòng nhập ít nhất một thông tin khách hàng (Tên / SĐT / Mã KH).');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        code: codeTrim,
        customerCode: form.customerCode.trim() || undefined,
        customerName: form.customerName.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        customerId: form.customerId || undefined,
        details: form.details.trim() || undefined,
        reason: form.reason.trim() || undefined,
        description: form.description.trim() || undefined,
        creator: form.creator.trim() || undefined,
        recordDate: form.recordDate || undefined,
      };
      if (editingItem?._id) {
        await http.patch('/customers/care/' + editingItem._id, payload);
      } else {
        await http.post('/customers/care', payload);
      }
      setModalOpen(false);
      await Promise.all([loadMeta(), loadCare()]);
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Không lưu được phiếu chăm sóc.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CareRow) => {
    if (!window.confirm('Xóa phiếu "' + (item.code || item._id) + '"?')) return;
    setDeletingId(item._id);
    try {
      await http.delete('/customers/care/' + item._id);
      if (items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await loadCare();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không xóa được phiếu chăm sóc.');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedCount = selectedIds.size;

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'ID Phiếu', key: 'code', getValue: (c: CareRow) => c.code || '—' },
      { label: 'Mã KH', key: 'customerCode', getValue: (c: CareRow) => c.customerCode || '—' },
      { label: 'Tên KH', key: 'customerName', getValue: (c: CareRow) => c.customerName || '—' },
      { label: 'SĐT', key: 'customerPhone', getValue: (c: CareRow) => c.customerPhone || '—' },
      { label: 'Chi tiết', key: 'details', getValue: (c: CareRow) => c.details || '—' },
      { label: 'Lý do', key: 'reason', getValue: (c: CareRow) => c.reason || '—' },
      { label: 'Mô tả', key: 'description', getValue: (c: CareRow) => c.description || '—' },
      { label: 'Người tạo', key: 'creator', getValue: (c: CareRow) => c.creator || '—' },
      { label: 'Ngày tạo', key: 'recordDate', getValue: (c: CareRow) => (c.recordDate ? formatDate(c.recordDate) : '—') },
      { label: 'Ngày lưu', key: 'createdAt', getValue: (c: CareRow) => (c.createdAt ? formatDate(c.createdAt) : '—') },
    ],
    [],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: CareRow[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = (nextPage: number, nextLimit: number) =>
          http.get('/customers/care', {
            params: buildCareListParams(nextPage, nextLimit),
          });
        const pageSize = 100;
        const firstResponse = await fetchPage(1, pageSize);
        const firstItems = firstResponse.data?.items || [];
        let allItems: CareRow[] = [...firstItems];
        const totalItems = Number(firstResponse.data?.total || 0);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => fetchPage(index + 2, pageSize)),
          );
          responses.forEach((response) => { allItems = allItems.concat(response.data?.items || []); });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setError('Không có dữ liệu để xuất.');
        return;
      }
      const mappedRows = dataToExport.map((item) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((col) => {
          const exportColumn = exportColumns.find((c) => c.key === col.key);
          row[col.customLabel] = exportColumn ? exportColumn.getValue(item) : '';
        });
        return row;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, filename + '.xlsx');
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  const filterChips = useMemo(() => {
    const chips: Array<{ key: keyof CareFilters; label: string; value: string }> = [];
    if (filters.keyword) chips.push({ key: 'keyword', label: 'Tìm kiếm', value: filters.keyword });
    if (filters.reason) chips.push({ key: 'reason', label: 'Lý do', value: filters.reason });
    if (filters.creator) chips.push({ key: 'creator', label: 'Người tạo', value: filters.creator });
    return chips;
  }, [filters]);

  const hasActiveFilters = filterChips.length > 0;
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortField)?.label || sortField;
  const sortOrderLabel = sortOrder === 'desc' ? 'giảm dần' : 'tăng dần';

  return (
    <div className="page-stack customer-care-page care-root" data-testid="customers-care-page">
      <section className="data-card care-toolbar-card care-sticky-toolbar">
        <div className="care-toolbar-header-slot">
          <div className="care-compact-head">
            <h1 className="care-compact-heading-sr">Danh sách phiếu chăm sóc khách hàng</h1>
            <div className="care-tabs-row care-tabs-row--title-slot">
              <span className="care-toolbar-eyebrow">CUSTOMER CARE</span>
              <div className="care-title-chip" aria-hidden="true">
                <HeartHandshake size={14} />
                <span>Phiếu chăm sóc</span>
              </div>
            </div>
          </div>
        </div>

        <div className="care-summary-strip" aria-label="Tóm tắt chăm sóc khách hàng">
          <div className="care-summary-cluster">
            <span className="care-summary-main">
              <strong>{total.toLocaleString('vi-VN')}</strong>
              <span>phiếu</span>
            </span>
            {selectedCount > 0 ? (
              <>
                <span className="care-summary-divider" aria-hidden="true" />
                <span>{selectedCount.toLocaleString('vi-VN')} đã chọn</span>
              </>
            ) : null}
            {hasActiveFilters ? (
              <>
                <span className="care-summary-divider" aria-hidden="true" />
                <span className="care-summary-filter">Đang lọc</span>
              </>
            ) : null}
          </div>
        </div>

        <form className="care-filter-bar" onSubmit={handleSubmitFilters}>
          <div className="care-search">
            <Search size={15} />
            <FilterSuggestInput
              bare
              value={draftFilters.keyword}
              placeholder="ID phiếu, tên KH, SĐT..."
              onChange={(next) => setDraftFilters((current) => ({ ...current, keyword: next }))}
              fetchSuggestions={suggestCustomerCare}
              data-testid="customers-care-keyword-filter"
              aria-label="Tìm kiếm phiếu chăm sóc"
            />
          </div>

          <select
            className="care-filter-select"
            value={draftFilters.reason}
            onChange={(event) => setDraftFilters((current) => ({ ...current, reason: event.target.value }))}
            aria-label="Lý do"
            title="Lý do"
          >
            <option value="">Tất cả lý do</option>
            {meta.reasons.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>

          <select
            className="care-filter-select"
            value={draftFilters.creator}
            onChange={(event) => setDraftFilters((current) => ({ ...current, creator: event.target.value }))}
            aria-label="Người tạo"
            title="Người tạo"
          >
            <option value="">Tất cả người tạo</option>
            {meta.creators.map((creator) => (
              <option key={creator} value={creator}>{creator}</option>
            ))}
          </select>

          <select
            className="care-filter-select"
            value={sortField}
            onChange={(event) => { setSortField(event.target.value as SortField); setPage(1); }}
            aria-label="Sắp xếp"
            title="Sắp xếp"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            className="care-filter-select care-filter-select--order"
            value={sortOrder}
            onChange={(event) => { setSortOrder(event.target.value as SortOrder); setPage(1); }}
            aria-label="Thứ tự sắp xếp"
            title="Thứ tự"
          >
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>

          <div className="care-filter-actions">
            <button className="care-btn care-btn-primary" type="submit">
              <Search size={14} /> Lọc
            </button>
            <button className="care-btn care-btn-secondary" type="button" onClick={handleClearFilters} title="Xóa bộ lọc">
              <RotateCcw size={14} /> Làm mới
            </button>
            <button className="care-btn care-btn-secondary" type="button" onClick={() => setShowExportModal(true)}>
              <FileDown size={14} /> Xuất
            </button>
            <Link to="/customers/list" className="care-btn care-btn-secondary">
              <Users size={14} /> Danh sách KH
            </Link>

            <div className="care-floating-menu care-bulk-menu" ref={actionMenuRef}>
              <div className="care-split-actions">
                <button className="care-btn care-btn-primary" type="button" onClick={openCreate}>
                  <Plus size={14} /> Thêm phiếu
                </button>
                <button
                  className="care-btn care-btn-primary care-split-toggle"
                  type="button"
                  onClick={() => setShowActionMenu((current) => !current)}
                  aria-label="Thao tác chăm sóc"
                  aria-expanded={showActionMenu}
                  title="Thao tác chăm sóc"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              {showActionMenu && (
                <div className="care-floating-dropdown" role="menu">
                  {actionsList.map((action) => (
                    <button
                      key={action}
                      type="button"
                      role="menuitem"
                      className="care-dropdown-item"
                      onClick={() => { setShowActionMenu(false); setActiveAction(action); }}
                    >
                      {CareActionIcons[action]} {action}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        {(hasActiveFilters || selectedCount > 0) && (
          <div className="care-chip-bar" data-testid="customers-care-filter-chips">
            <div className="care-chip-list">
              {filterChips.map((chip) => (
                <button
                  key={chip.key + chip.value}
                  type="button"
                  className="care-chip"
                  onClick={() => handleRemoveChip(chip.key)}
                >
                  <span>{chip.label}: {chip.value}</span>
                  <X size={12} />
                </button>
              ))}
            </div>
            <div className="care-chip-actions">
              {selectedCount > 0 ? (
                <>
                  <span className="care-selected-pill">{selectedCount} đang chọn</span>
                  <button className="care-btn care-btn-secondary" type="button" onClick={() => setSelectedIds(new Set())}>
                    Bỏ chọn
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className="data-card care-table-card">
        <div className="data-card-header care-table-header">
          <div>
            <h2 className="care-table-title">Bảng dữ liệu chăm sóc khách hàng</h2>
            <p className="care-table-subtitle">
              {total.toLocaleString('vi-VN')} bản ghi · Sắp xếp {sortLabel} · {sortOrderLabel}
            </p>
          </div>
          <div className="care-table-header-meta">
            {selectedCount > 0 ? (
              <span className="care-selected-count">{selectedCount.toLocaleString('vi-VN')} đã chọn</span>
            ) : null}
            {tableBusy ? <span className="care-busy-pill">Đang cập nhật…</span> : null}
          </div>
        </div>

        {error && (
          <div className="care-feedback error" role="alert">
            <AlertCircle size={18} /><span>{error}</span>
            <button className="care-btn care-btn-secondary" type="button" onClick={() => void loadCare()}>Thử lại</button>
          </div>
        )}

        <div className="table-scroll care-table-scroll">
          <table className="data-table care-data-table">
            {/*
              Column min-widths kept in sync with customer-care-page.css.
              44+130+200+120+170+140+180+130+120+88 = 1322 (table min-width)
            */}
            <colgroup>
              <col className="care-col-check" />
              <col className="care-col-code" />
              <col className="care-col-customer" />
              <col className="care-col-phone" />
              <col className="care-col-details" />
              <col className="care-col-reason" />
              <col className="care-col-description" />
              <col className="care-col-creator" />
              <col className="care-col-date" />
              <col className="care-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="check-cell care-col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả" />
                </th>
                <th className="care-col-code">
                  <button type="button" className="care-sort-button" onClick={() => handleSort('code')}>
                    ID Phiếu <ArrowUpDown size={13} />
                  </button>
                </th>
                <th className="care-col-customer">
                  <button type="button" className="care-sort-button" onClick={() => handleSort('customerName')}>
                    Tên khách hàng <ArrowUpDown size={13} />
                  </button>
                </th>
                <th className="care-col-phone">
                  <button type="button" className="care-sort-button" onClick={() => handleSort('customerPhone')}>
                    SĐT <ArrowUpDown size={13} />
                  </button>
                </th>
                <th className="care-col-details">Chi tiết</th>
                <th className="care-col-reason">
                  <button type="button" className="care-sort-button" onClick={() => handleSort('reason')}>
                    Lý do <ArrowUpDown size={13} />
                  </button>
                </th>
                <th className="care-col-description">Mô tả</th>
                <th className="care-col-creator">
                  <button type="button" className="care-sort-button" onClick={() => handleSort('creator')}>
                    Người tạo <ArrowUpDown size={13} />
                  </button>
                </th>
                <th className="care-col-date">
                  <button type="button" className="care-sort-button" onClick={() => handleSort('recordDate')}>
                    Ngày tạo <ArrowUpDown size={13} />
                  </button>
                </th>
                <th className="action-cell care-col-actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, index) => (
                <tr key={'loading-' + index} className="care-skeleton-row">
                  <td className="check-cell care-col-check"><div className="care-skeleton-box short" /></td>
                  <td className="care-col-code"><div className="care-skeleton-box tall" /></td>
                  <td className="care-col-customer"><div className="care-skeleton-box tall" /></td>
                  <td className="care-col-phone"><div className="care-skeleton-box short" /></td>
                  <td className="care-col-details"><div className="care-skeleton-box tall" /></td>
                  <td className="care-col-reason"><div className="care-skeleton-box short" /></td>
                  <td className="care-col-description"><div className="care-skeleton-box tall" /></td>
                  <td className="care-col-creator"><div className="care-skeleton-box short" /></td>
                  <td className="care-col-date"><div className="care-skeleton-box short" /></td>
                  <td className="action-cell care-col-actions"><div className="care-skeleton-box short" /></td>
                </tr>
              ))}

              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={10} className="care-empty-cell">
                    <div className="care-empty-state">
                      <HeartHandshake size={28} />
                      <strong>Chưa có dữ liệu</strong>
                      <span>Thử đổi bộ lọc hoặc thêm phiếu chăm sóc mới.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && items.map((item) => (
                <tr key={item._id} className={selectedIds.has(item._id) ? 'is-selected' : undefined}>
                  <td className="check-cell care-col-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item._id)}
                      onChange={(event) => toggleRowSelection(item._id, event.target.checked)}
                      aria-label={'Chọn ' + (item.code || item._id)}
                    />
                  </td>
                  <td className="care-name-cell care-col-code">
                    <button type="button" className="care-link-button care-name-button" onClick={() => openEdit(item)}>
                      <span className="care-name-main" title={item.code || undefined}>{item.code || '—'}</span>
                      <span className="care-name-sub" title={item.customerCode || item._id}>{item.customerCode || item._id}</span>
                    </button>
                  </td>
                  <td className="care-name-cell care-col-customer">
                    {item.customerName ? (
                      item.customerId ? (
                        <Link
                          to={`/customers/list/${item.customerId}`}
                          className="care-code"
                          title={item.customerName}
                        >
                          {item.customerName}
                        </Link>
                      ) : (
                        <Link
                          to={`/customers/list?keyword=${encodeURIComponent(item.customerName)}`}
                          className="care-code"
                          title={item.customerName}
                        >
                          {item.customerName}
                        </Link>
                      )
                    ) : '—'}
                  </td>
                  <td className="care-number care-col-phone">{item.customerPhone || '—'}</td>
                  <td className="care-clamp-cell care-col-details" title={item.details || undefined}>{item.details || '—'}</td>
                  <td className="care-col-reason">
                    {item.reason ? (
                      <span className="care-status-badge neutral" title={item.reason}>{item.reason}</span>
                    ) : '—'}
                  </td>
                  <td className="care-clamp-cell care-col-description" title={item.description || undefined}>{item.description || '—'}</td>
                  <td className="care-clamp-cell care-col-creator" title={item.creator || undefined}>{item.creator || '—'}</td>
                  <td className="care-number care-col-date">{formatDate(item.recordDate)}</td>
                  <td className="action-cell care-col-actions">
                    <div className="care-actions">
                      <button
                        className="care-row-menu-button"
                        type="button"
                        title="Sửa"
                        aria-label={'Sửa ' + (item.code || item._id)}
                        onClick={() => openEdit(item)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="care-row-menu-button danger"
                        type="button"
                        title="Xóa"
                        aria-label={'Xóa ' + (item.code || item._id)}
                        onClick={() => void handleDelete(item)}
                        disabled={deletingId === item._id}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={setPage} />
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => !saving && setModalOpen(false)}>
          <div className="modal-card modal-card-wide customer-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingItem ? 'Cập nhật phiếu chăm sóc' : 'Thêm phiếu chăm sóc'}</h2>
                <p>{editingItem ? 'Cập nhật thông tin phiếu' : 'Ghi nhận hoạt động chăm sóc khách hàng'}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => !saving && setModalOpen(false)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <form className="customer-modal-body" onSubmit={handleSave}>
              <div className="customer-modal-grid">
                {formFields.map((field) => (
                  <label className={field.type === 'textarea' ? 'form-field form-field-wide' : 'form-field'} key={field.key}>
                    <span>{field.label}{field.required ? ' *' : ''}</span>
                    {field.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={String(form[field.key] ?? '')}
                        onChange={(event) => handleFormChange(field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        type={field.type === 'date' ? 'date' : 'text'}
                        required={field.required}
                        value={String(form[field.key] ?? '')}
                        onChange={(event) => handleFormChange(field.key, event.target.value)}
                        onBlur={(e) => {
                          if (field.key === 'customerCode') lookupCustomerByCode(e.target.value);
                        }}
                      />
                    )}
                  </label>
                ))}
              </div>
              {formError && <div className="customer-feedback error"><AlertCircle size={18} /><span>{formError}</span></div>}
              <div className="modal-footer customer-modal-footer">
                <button className="btn btn-outline" type="button" onClick={() => !saving && setModalOpen(false)} disabled={saving}>Hủy</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}
                  {saving ? 'Đang lưu...' : 'Lưu phiếu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeAction && (
        <CustomerCareActionModal
          action={activeAction}
          onClose={() => setActiveAction(null)}
          onSuccess={() => {
            setActiveAction(null);
            void loadCare();
          }}
        />
      )}

      {showExportModal && (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Danh sách phiếu chăm sóc"
          defaultFilename={'danh-sach-phieu-cham-soc-' + new Date().toISOString().slice(0, 10)}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      )}
    </div>
  );
}
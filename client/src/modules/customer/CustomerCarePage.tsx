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
} from 'lucide-react';
import { http } from '../../core/api/http';
import { Pagination } from '../../core/components/Pagination';
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

  const loadCare = async () => {
    setError('');
    setLoading(items.length === 0);
    setTableBusy(items.length > 0);
    try {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE, sort: sortField, order: sortOrder };
      if (filters.keyword) params.q = filters.keyword;
      if (filters.reason) params.reason = filters.reason;
      if (filters.creator) params.creator = filters.creator;
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
    setFilters(draftFilters);
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

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!String(form.code || '').trim()) {
      setFormError('Vui lòng nhập ID phiếu.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        code: form.code.trim(),
        customerCode: form.customerCode.trim() || undefined,
        customerName: form.customerName.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
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
            params: { ...filters, page: nextPage, limit: nextLimit, sort: sortField, order: sortOrder },
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

  return (
    <div className="page-stack customer-list-page customer-care-page" data-testid="customers-care-page">
      <div className="page-heading customer-list-heading">
        <div className="page-title-block">
          <div className="page-icon"><HeartHandshake size={24} /></div>
          <div>
            <h1>Danh sách phiếu chăm sóc khách hàng</h1>
            <p>Ghi nhận các hoạt động chăm sóc, thu hồi và tương tác với khách hàng</p>
          </div>
        </div>
        <div className="page-actions customer-care-actions">
          <span className="record-badge">{formatNumber(total)} bản ghi</span>
          <button className="btn btn-outline" type="button" onClick={() => setShowExportModal(true)}>
            <FileDown size={16} /> Xuất Excel
          </button>
          <div className="customer-care-action-menu" ref={actionMenuRef}>
            <div className="customer-care-action-toggle">
              <button className="btn btn-primary" type="button" onClick={openCreate}>
                <Plus size={16} /> Thêm phiếu chăm sóc
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowActionMenu((current) => !current)}
                aria-label="Thao tác chăm sóc"
                title="Thao tác chăm sóc"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            {showActionMenu && (
              <div className="customer-care-action-menu-panel" role="menu">
                {actionsList.map((action) => (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowActionMenu(false); setActiveAction(action); }}
                  >
                    {CareActionIcons[action]} {action}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="data-card customer-filter-card">
        <form className="customer-filter-shell" onSubmit={handleSubmitFilters}>
          <div className="customer-filter-topline">
            <label className="customer-filter-item customer-filter-search">
              <span>Tìm kiếm</span>
              <div className="search-box">
                <Search size={16} />
                <input
                  value={draftFilters.keyword}
                  placeholder="ID phiếu, tên khách hàng, số điện thoại"
                  onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
                  data-testid="customers-care-keyword-filter"
                />
              </div>
            </label>
            <label className="customer-filter-item">
              <span>Sắp xếp</span>
              <div className="customer-select-wrap">
                <select
                  value={sortField}
                  onChange={(event) => { setSortField(event.target.value as SortField); setPage(1); }}
                >
                  {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
          </div>

          <div className="customer-filter-grid">
            <label className="customer-filter-item">
              <span>Lý do</span>
              <div className="customer-select-wrap">
                <select value={draftFilters.reason} onChange={(event) => setDraftFilters((current) => ({ ...current, reason: event.target.value }))}>
                  <option value="">Tất cả</option>
                  {meta.reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
            <label className="customer-filter-item">
              <span>Người tạo</span>
              <div className="customer-select-wrap">
                <select value={draftFilters.creator} onChange={(event) => setDraftFilters((current) => ({ ...current, creator: event.target.value }))}>
                  <option value="">Tất cả</option>
                  {meta.creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
            <label className="customer-filter-item">
              <span>Thứ tự</span>
              <div className="customer-select-wrap">
                <select
                  value={sortOrder}
                  onChange={(event) => { setSortOrder(event.target.value as SortOrder); setPage(1); }}
                >
                  <option value="desc">Giảm dần</option>
                  <option value="asc">Tăng dần</option>
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
            <div className="customer-filter-actions-inline">
              <button className="btn btn-primary" type="submit">
                <Search size={16} /> Lọc
              </button>
              <button className="btn btn-outline" type="button" onClick={handleClearFilters}>
                <RotateCcw size={16} /> Xóa bộ lọc
              </button>
            </div>
          </div>
        </form>

        {(filterChips.length > 0 || selectedCount > 0) && (
          <div className="customer-chip-bar" data-testid="customers-care-filter-chips">
            <div className="customer-chip-list">
              {filterChips.map((chip) => (
                <button key={chip.key + chip.value} type="button" className="customer-chip" onClick={() => handleRemoveChip(chip.key)}>
                  <span>{chip.label}: {chip.value}</span>
                  <X size={14} />
                </button>
              ))}
            </div>
            <div className="customer-chip-actions">
              {selectedCount > 0 && <span className="record-badge">{selectedCount} đang chọn</span>}
              {selectedCount > 0 && <button className="btn btn-outline" type="button" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button>}
            </div>
          </div>
        )}
      </section>

      <section className="data-card customer-table-card">
        <div className="data-card-header customer-table-header">
          <div>
            <h2>Danh sách phiếu chăm sóc</h2>
            <p>Tổng {formatNumber(total)} phiếu đã ghi nhận</p>
          </div>
          <div className="customer-chip-actions">
            {tableBusy && <span className="record-badge">Đang cập nhật dữ liệu…</span>}
          </div>
        </div>

        {error && (
          <div className="customer-feedback error" role="alert">
            <AlertCircle size={18} /><span>{error}</span>
            <button className="btn btn-outline" type="button" onClick={() => void loadCare()}>Thử lại</button>
          </div>
        )}

        <div className="table-scroll">
          <table className="data-table customer-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả" />
                </th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('code')}>
                    ID Phiếu <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('customerName')}>
                    Tên khách hàng <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('customerPhone')}>
                    SĐT <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>Chi tiết</th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('reason')}>
                    Lý do <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>Mô tả</th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('creator')}>
                    Người tạo <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('recordDate')}>
                    Ngày tạo <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="action-col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, index) => (
                <tr key={'loading-' + index} className="customer-skeleton-row">
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box tall" /></td>
                  <td><div className="customer-skeleton-box tall" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                </tr>
              ))}

              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={10}>
                    <div className="customer-empty-state">
                      <strong>Không có phiếu chăm sóc phù hợp</strong>
                      <span>Hãy đổi điều kiện lọc hoặc thêm phiếu chăm sóc mới để bắt đầu.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && items.map((item) => (
                <tr key={item._id}>
                  <td className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item._id)}
                      onChange={(event) => toggleRowSelection(item._id, event.target.checked)}
                      aria-label={'Chọn ' + (item.code || item._id)}
                    />
                  </td>
                  <td>
                    <button type="button" className="customer-name-button" onClick={() => openEdit(item)}>
                      <strong>{item.code || '—'}</strong>
                      <span>{item.customerCode || item._id}</span>
                    </button>
                  </td>
                  <td className="customer-groups-cell">{item.customerName || '—'}</td>
                  <td>{item.customerPhone || '—'}</td>
                  <td>{item.details || '—'}</td>
                  <td>{item.reason || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td>{item.creator || '—'}</td>
                  <td>{formatDate(item.recordDate)}</td>
                  <td className="action-col">
                    <div className="customer-row-actions">
                      <button className="icon-button" type="button" title="Sửa" onClick={() => openEdit(item)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        type="button"
                        title="Xóa"
                        onClick={() => void handleDelete(item)}
                        disabled={deletingId === item._id}
                      >
                        <Trash2 size={16} />
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
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  FileDown,
  FileUp,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { http } from '../api/http';
import { Pagination } from './Pagination';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../../modules/product/components/ExportExcelModal';

const DEFAULT_PAGE_SIZE = 15;

export type DataField = {
  key: string;
  label: string;
  type?: 'text' | 'money' | 'number' | 'date' | 'badge' | 'status';
};

export type FormField = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'textarea' | 'select';
  required?: boolean;
  options?: { label: string; value: string }[];
};

type ModuleMetric = {
  label: string;
  value: string | number;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
};

export type RowAction = {
  label: string;
  endpointSuffix: string;
  method?: 'post' | 'patch';
  confirm?: string;
};

export type BulkAction = {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: (selectedItems: Record<string, any>[], onSuccess: () => void) => void;
};

export type BulkActionGroup = {
  label?: string;
  actions: BulkAction[];
};

export type DataModulePageProps = {
  title: string;
  subtitle: string;
  endpoint: string;
  icon: ReactNode;
  fields: DataField[];
  formFields: FormField[];
  createDefaults: Record<string, unknown>;
  primaryActionLabel?: string;
  primaryActions?: { label: string; icon?: ReactNode; onClick: () => void }[];
  quickFilters?: { label: string; value: string }[];
  metrics?: ModuleMetric[];
  normalizePayload?: (payload: Record<string, unknown>) => Record<string, unknown>;
  actions?: RowAction[];
  customActions?: { label: string; icon?: ReactNode; onClick: (item: Record<string, any>) => void; variant?: string }[];
  onPrimaryActionClick?: () => void;
  onImportExcel?: () => void;
  bulkActionGroups?: BulkActionGroup[];
  extraHeaderButtons?: ReactNode;
  hideImport?: boolean;
 hideCreate?: boolean;
 hideEdit?: boolean;
 hideDelete?: boolean;
};

function getValue(item: Record<string, any>, key: string) {
  return key.split('.').reduce((value, part) => value?.[part], item);
}

function formatValue(value: unknown, type: DataField['type']) {
  if (value === undefined || value === null || value === '') return '-';
  if (type === 'money') return `${Number(value).toLocaleString('vi-VN')} đ`;
  if (type === 'date') return new Date(String(value)).toLocaleDateString('vi-VN');
  if (type === 'number') return Number(value).toLocaleString('vi-VN');
  const strVal = String(value);
  if (strVal === 'person') return 'Cá nhân';
  if (strVal === 'company') return 'Công ty';
  return strVal;
}

function statusClass(value: unknown) {
  const status = String(value ?? '').toLowerCase();
  if (['completed', 'success', 'done', 'paid', 'active'].includes(status)) return 'success';
  if (['draft', 'temp', 'todo', 'backlog', 'planning', 'wait', 'delivery', 'in_progress', 'doing', 'review'].includes(status)) return 'warning';
  if (['cancelled', 'cancel', 'fail', 'inactive'].includes(status)) return 'danger';
  return 'primary';
}

export function DataModulePage({
  title,
  subtitle,
  endpoint,
  icon,
  fields,
  formFields,
  createDefaults,
  primaryActionLabel,
  primaryActions,
  quickFilters = [],
  metrics = [],
  normalizePayload,
  actions = [],
  onPrimaryActionClick,
  onImportExcel,
  bulkActionGroups,
  extraHeaderButtons,
  hideImport,
 hideCreate,
 hideEdit,
 hideDelete,
 customActions,
}: DataModulePageProps) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(createDefaults);
  const [error, setError] = useState('');
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showPrimaryDropdown, setShowPrimaryDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowActionOpen, setRowActionOpen] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const hasPrimaryActions = !!primaryActions?.length;
  const canCreate = !hideCreate && !!primaryActionLabel;
  const hasBulkActions = !!bulkActionGroups?.some((group) => group.actions.length > 0);
  const hasRowActionMenu = actions.length > 0 || !!customActions?.length || !hideEdit;

  useEffect(() => {
    if (!showToolsDropdown && !showPrimaryDropdown && !rowActionOpen) return;
    const handleClose = () => {
      setShowToolsDropdown(false);
      setShowPrimaryDropdown(false);
      setRowActionOpen(null);
    };
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [showPrimaryDropdown, showToolsDropdown, rowActionOpen]);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [path, rawQuery = ''] = endpoint.split('?');
      const params = new URLSearchParams(rawQuery);
      params.set('page', String(page));
      params.set('limit', String(DEFAULT_PAGE_SIZE));
      if (appliedSearch) params.set('q', appliedSearch);
      else params.delete('q');
      if (quickFilter) params.set('status', quickFilter);
      else params.delete('status');
      const response = await http.get(`${path}?${params.toString()}`, { signal });
      const responseItems = Array.isArray(response.data) ? response.data : response.data.items ?? [];
      setItems(responseItems);
      setTotal(Array.isArray(response.data) ? responseItems.length : Number(response.data.total ?? responseItems.length));
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED') return;
      setError(err.response?.data?.message ?? 'Không tải được dữ liệu.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [endpoint, quickFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [endpoint, page, appliedSearch, quickFilter, refreshKey]);

  const filteredItems = useMemo(() => {
    return items;
  }, [items]);
  const exportColumns: ColumnOption[] = useMemo(
    () => fields.map((field) => ({
      label: field.label,
      key: field.key,
      getValue: (item: Record<string, any>) => formatValue(getValue(item, field.key), field.type),
    })),
    [fields],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: Record<string, any>[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const [path, rawQuery = ''] = endpoint.split('?');
        const buildParams = (nextPage: number, nextLimit: number) => {
          const params = new URLSearchParams(rawQuery);
          params.set('page', String(nextPage));
          params.set('limit', String(nextLimit));
          if (appliedSearch) params.set('q', appliedSearch); else params.delete('q');
          if (quickFilter) params.set('status', quickFilter); else params.delete('status');
          return params;
        };
        const pageSize = 100;
        const firstResponse = await http.get(`${path}?${buildParams(1, pageSize).toString()}`);
        const firstItems = Array.isArray(firstResponse.data) ? firstResponse.data : firstResponse.data.items ?? [];
        let allItems = [...firstItems];
        const totalItems = Array.isArray(firstResponse.data) ? firstItems.length : Number(firstResponse.data.total ?? firstItems.length);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) =>
              http.get(`${path}?${buildParams(index + 2, pageSize).toString()}`),
            ),
          );
          responses.forEach((response) => {
            const responseItems = Array.isArray(response.data) ? response.data : response.data.items ?? [];
            allItems = allItems.concat(responseItems);
          });
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
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(filteredItems.map((item) => item._id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredItems]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => {
      const field = formFields.find((item) => item.key === key);
      if (field?.type === 'number') return [key, Number(value || 0)];
      return [key, value];
    }));

    try {
      const finalPayload = normalizePayload ? normalizePayload(payload) : payload;
      const baseEndpoint = endpoint.split('?')[0];
      if (editingId) await http.patch(`${baseEndpoint}/${editingId}`, finalPayload);
      else await http.post(baseEndpoint, finalPayload);
      setShowModal(false);
      setEditingId(null);
      setForm(createDefaults);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không lưu được dữ liệu.');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(createDefaults);
    setShowModal(true);
  };

  const runPrimaryCreate = () => {
    setShowPrimaryDropdown(false);
    if (onPrimaryActionClick) onPrimaryActionClick();
    else openCreate();
  };

  const openEdit = (item: Record<string, any>) => {
    const nextForm = { ...createDefaults };
    formFields.forEach((field) => {
      const value = getValue(item, field.key);
      nextForm[field.key] = field.type === 'date' && value ? String(value).slice(0, 10) : (value ?? createDefaults[field.key] ?? '');
    });
    setEditingId(item._id);
    setForm(nextForm);
    setRowActionOpen(null);
    setShowModal(true);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi này?')) return;
    const baseEndpoint = endpoint.split('?')[0];
    setError('');
    try {
      await http.delete(`${baseEndpoint}/${id}`);
      setRowActionOpen(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không xóa được bản ghi.');
    }
  };

  const runAction = async (item: Record<string, any>, action: RowAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    const baseEndpoint = endpoint.split('?')[0];
    setError('');
    try {
      await http[action.method ?? 'post'](`${baseEndpoint}/${item._id}/${action.endpointSuffix}`);
      setRowActionOpen(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? `Không thực hiện được "${action.label}".`);
    }
  };

  const exportCsv = () => {
    const csv = [
      fields.map((field) => `"${field.label.replace(/"/g, '""')}"`).join(','),
      ...filteredItems.map((item) => fields.map((field) => `"${String(getValue(item, field.key) ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowToolsDropdown(false);
  };

  const handleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(new Set(filteredItems.map((item) => item._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const runBulkAction = (action: BulkAction) => {
    const itemsForAction = filteredByIds(filteredItems, selectedIds);
    action.onClick(itemsForAction, () => {
      setSelectedIds(new Set());
      load();
    });
  };

  return (
    <div className="page-stack compact-stack compact-page-module">
      <section className="compact-toolbar-card">
        <div className="compact-header page-heading">
          <span className="compact-badge">MODULE</span>
          <div className="page-title-block">
            <div className="page-icon">{icon}</div>
            <div>
              <h1 className="compact-title">{title}</h1>
              <p className="compact-desc">{subtitle}</p>
            </div>
          </div>
          <div className="compact-header-actions page-actions">
            {extraHeaderButtons}
            {canCreate && (
              <div className={`primary-action-split ${hasPrimaryActions ? 'has-menu' : ''}`}>
                <button className="btn btn-primary compact-btn compact-btn-primary primary-action-main" type="button" onClick={runPrimaryCreate}>
                  <Plus size={14} /> {primaryActionLabel}
                </button>
                {hasPrimaryActions && (
                  <>
                    <button
                      className="btn btn-primary compact-btn compact-btn-primary primary-action-toggle"
                      type="button"
                      aria-label="Mở lựa chọn tạo mới"
                      aria-expanded={showPrimaryDropdown}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowPrimaryDropdown((current) => !current);
                        setShowToolsDropdown(false);
                        if (onImportExcel) {
                          onImportExcel();
                          return;
                        }
                      }}
                    >
                      <ChevronDown size={14} />
                    </button>
                    {showPrimaryDropdown && (
                      <div className="dropdown-menu primary-action-menu">
                        <button className="dropdown-item" type="button" onClick={runPrimaryCreate}>
                          <Plus size={14} />
                          <span>{primaryActionLabel}</span>
                        </button>
                        <div className="dropdown-separator" />
                        {primaryActions?.map((action, index) => (
                          <button
                            key={`${action.label}-${index}`}
                            className="dropdown-item"
                            type="button"
                            onClick={() => {
                              setShowPrimaryDropdown(false);
                              action.onClick();
                            }}
                          >
                            {action.icon}
                            <span>{action.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="dropdown-container">
              <button
                className="btn btn-light compact-btn compact-btn-secondary"
                type="button"
                aria-expanded={showToolsDropdown}
                onClick={(event) => {
                  event.stopPropagation();
                  setShowToolsDropdown((current) => !current);
                  setShowPrimaryDropdown(false);
                }}
              >
                <Wrench size={14} /> Công cụ
              </button>
              {showToolsDropdown && (
                <div className="dropdown-menu tools-menu">
                  <button className="dropdown-item" type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setQuickFilter(''); setPage(1); setRefreshKey((value) => value + 1); }}>
                    <RefreshCw size={14} /> Làm mới
                  </button>
                  <button className="dropdown-item" type="button" onClick={() => setShowExportModal(true)}>
                    <FileDown size={14} /> Xuất dữ liệu
                  </button>
                  {!hideImport && (
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() => {
                        setShowToolsDropdown(false);
                        alert('Dùng API CRUD hoặc npm run load để nạp dữ liệu mẫu lên MongoDB Atlas.');
                      }}
                    >
                      <FileUp size={14} /> Nhập dữ liệu
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {metrics.length > 0 && (
          <div className="compact-kpi-row metric-row">
            {metrics.map((metric) => (
              <div className={`compact-kpi-card metric-card ${metric.tone ?? 'neutral'}`} key={metric.label}>
                <span className="compact-kpi-label">{metric.label}</span>
                <strong className="compact-kpi-value">{metric.value}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="compact-filter-bar filter-panel">
          <div className="compact-search search-box">
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã, tên, số điện thoại..." />
          </div>
          {quickFilters.length > 0 && (
            <div className="compact-pills quick-filter-list" role="list" aria-label="Lọc nhanh">
              <button className={`compact-pill ${!quickFilter ? 'compact-pill-active active' : ''}`} type="button" onClick={() => setQuickFilter('')}>Tất cả</button>
              {quickFilters.map((filter) => (
                <button
                  className={`compact-pill ${quickFilter === filter.value ? 'compact-pill-active active' : ''}`}
                  key={filter.value}
                  type="button"
                  onClick={() => setQuickFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="module-grid compact-stack">
        <section className="data-card compact-table-card">
          <div className="data-card-header compact-table-header">
            <div>
              <h2 className="compact-table-title">{title}</h2>
              <div className="data-card-meta">
                <span className="record-badge compact-table-count">{total} bản ghi</span>
                {selectedIds.size > 0 && <span className="selected-badge">{selectedIds.size} đã chọn</span>}
              </div>
            </div>
          </div>

          {error && (
            <div className="data-alert" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>Thử lại</button>
            </div>
          )}

          {hasBulkActions && selectedIds.size > 0 && (
            <div className="bulk-action-bar">
              <div>
                <strong>{selectedIds.size} bản ghi đã chọn</strong>
                <span>Chọn thao tác hàng loạt để xử lý nhanh.</span>
              </div>
              <div className="bulk-action-list">
                {bulkActionGroups?.map((group, groupIndex) => (
                  <div className="bulk-action-group" key={groupIndex}>
                    {group.label && <span className="bulk-action-label">{group.label}</span>}
                    {group.actions.map((action, actionIndex) => (
                      <button
                        className={`btn btn-light ${action.danger ? 'btn-danger-soft' : ''}`}
                        key={`${action.label}-${actionIndex}`}
                        type="button"
                        onClick={() => runBulkAction(action)}
                      >
                        {action.icon}
                        {action.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="table-scroll compact-table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả"
                      checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  {fields.map((field) => <th key={field.key}>{field.label}</th>)}
                  <th className="action-cell">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr className="skeleton-row" key={`loading-${rowIndex}`}>
                    <td className="check-cell"><span /></td>
                    {fields.map((field) => <td key={field.key}><span /></td>)}
                    <td className="action-cell"><span /></td>
                  </tr>
                ))}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={fields.length + 2} className="empty-cell">
                      <div className="empty-state">
                        <div className="empty-state-icon"><Inbox size={24} /></div>
                        <strong>Chưa có dữ liệu phù hợp</strong>
                        <span>Thử đổi từ khóa, bỏ bộ lọc hoặc tạo bản ghi mới.</span>
                        {canCreate && (
                          <button className="btn btn-primary" type="button" onClick={runPrimaryCreate}>
                            <Plus size={16} /> {primaryActionLabel}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && filteredItems.map((item) => (
                  <tr key={item._id}>
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${item.name ?? item.code ?? item._id}`}
                        checked={selectedIds.has(item._id)}
                        onChange={(event) => handleSelectRow(item._id, event.target.checked)}
                      />
                    </td>
                    {fields.map((field) => {
                      const value = getValue(item, field.key);
                      const type = field.type;
                      return (
                        <td key={field.key}>
                          {type === 'badge' || type === 'status'
                            ? <span className={`status-badge ${type === 'status' ? statusClass(value) : 'primary'}`}>{formatValue(value, type)}</span>
                            : <span>{formatValue(value, type)}</span>}
                        </td>
                      );
                    })}
                    <td className="action-cell">
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Mở thao tác cho ${item.name ?? item.code ?? item._id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setRowActionOpen(rowActionOpen === item._id ? null : item._id);
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {rowActionOpen === item._id && (
                          <div className="dropdown-menu row-action-menu">
                            {actions.map((action) => (
                              <button className="dropdown-item" type="button" key={action.label} onClick={() => runAction(item, action)}>
                                {action.label}
                              </button>
                            ))}
                            {customActions?.map((action, index) => (
                              <button className={`dropdown-item ${action.variant || ''}`} type="button" key={`${action.label}-${index}`} onClick={() => { setRowActionOpen(null); action.onClick(item); }}>
                                {action.icon} {action.label}
                              </button>
                            ))}
                            {hasRowActionMenu && (actions.length > 0 || customActions?.length) && <div className="dropdown-separator" />}
                           {!hideEdit && (
                             <button className="dropdown-item" type="button" onClick={() => openEdit(item)}>
                               <Pencil size={16} /> Sửa
                             </button>
                           )}
                           {!hideDelete && (
                             <button className="dropdown-item danger" type="button" onClick={() => remove(item._id)}>
                               <Trash2 size={16} /> Xóa
                             </button>
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
          <Pagination page={page} total={total} limit={DEFAULT_PAGE_SIZE} onPageChange={setPage} />
        </section>
      </div>

      {showModal && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-header">
              <div>
                <h2>{editingId ? 'Cập nhật' : primaryActionLabel}</h2>
                <p>{editingId ? 'Cập nhật bản ghi' : title}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowModal(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              {formFields.map((field) => (
                <label className={field.type === 'textarea' ? 'form-field wide' : 'form-field'} key={field.key}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  {field.type === 'textarea' ? (
                    <textarea
                      name={field.key}
                      value={String(form[field.key] ?? '')}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                      rows={4}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      name={field.key}
                      value={String(form[field.key] ?? '')}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    >
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input
                      name={field.key}
                      required={field.required}
                      type={field.type ?? 'text'}
                      value={String(form[field.key] ?? '')}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Lưu</button>
            </div>
          </form>
        </div>
      )}
      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title={`Xuất Excel - ${title}`}
          defaultFilename={`${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}

function filteredByIds(items: Record<string, any>[], selectedIds: Set<string>) {
  return items.filter((item) => selectedIds.has(item._id));
}

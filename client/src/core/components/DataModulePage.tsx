import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { FileDown, FileUp, Filter, Plus, RefreshCw, Search, Trash2, X, ChevronDown } from 'lucide-react';
import { http } from '../api/http';

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
  onPrimaryActionClick?: () => void;
  bulkActionGroups?: BulkActionGroup[];
  extraHeaderButtons?: ReactNode;
  hideImport?: boolean;
  hideCreate?: boolean;
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
  bulkActionGroups,
  extraHeaderButtons,
  hideImport,
  hideCreate,
}: DataModulePageProps) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(createDefaults);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showQuickDropdown, setShowQuickDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);

  useEffect(() => {
    if (!showDropdown && !showQuickDropdown && !showBulkDropdown) return;
    const handleClose = () => {
      setShowDropdown(false);
      setShowQuickDropdown(false);
      setShowBulkDropdown(false);
    };
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [showDropdown, showQuickDropdown]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await http.get(endpoint);
      setItems(response.data.items ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không tải được dữ liệu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [endpoint]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const textMatch = q
        ? fields.some((field) => String(getValue(item, field.key) ?? '').toLowerCase().includes(q))
        : true;
      const quickMatch = quickFilter
        ? Object.values(item).some((value) => {
            const strVal = String(value).toLowerCase();
            const filterVals = quickFilter.toLowerCase().split(',');
            return filterVals.some(fv => strVal === fv.trim());
          })
        : true;
      return textMatch && quickMatch;
    });
  }, [fields, items, quickFilter, search]);

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

  const openEdit = (item: Record<string, any>) => {
    const nextForm = { ...createDefaults };
    formFields.forEach((field) => {
      const value = getValue(item, field.key);
      nextForm[field.key] = field.type === 'date' && value ? String(value).slice(0, 10) : (value ?? createDefaults[field.key] ?? '');
    });
    setEditingId(item._id);
    setForm(nextForm);
    setShowModal(true);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi này?')) return;
    const baseEndpoint = endpoint.split('?')[0];
    await http.delete(`${baseEndpoint}/${id}`);
    await load();
  };

  const runAction = async (item: Record<string, any>, action: RowAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    const baseEndpoint = endpoint.split('?')[0];
    await http[action.method ?? 'post'](`${baseEndpoint}/${item._id}/${action.endpointSuffix}`);
    await load();
  };

  const exportCsv = () => {
    const csv = [
      fields.map((field) => `"${field.label.replace(/"/g, '""')}"`).join(','),
      ...filteredItems.map((item) => fields.map((field) => `"${String(getValue(item, field.key) ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredItems.map(item => item._id)));
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

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon">{icon}</div>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={load} title="Làm mới">
            <RefreshCw size={16} /> Làm mới
          </button>
          <button className="btn btn-success" type="button" onClick={exportCsv} title="Xuất CSV">
            <FileDown size={16} /> Xuất CSV
          </button>
          {!hideImport && (
            <button className="btn btn-outline" type="button" onClick={() => alert('Dùng API CRUD hoặc npm run load để nạp dữ liệu mẫu lên MongoDB Atlas.')} title="Nhập dữ liệu">
              <FileUp size={16} /> Nhập
            </button>
          )}
          {bulkActionGroups && bulkActionGroups.length > 0 && (
            <div className="dropdown-container">
              <button
                className="btn btn-outline"
                type="button"
                disabled={selectedIds.size === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBulkDropdown(!showBulkDropdown);
                }}
              >
                Thao tác ({selectedIds.size}) <ChevronDown size={16} style={{ marginLeft: 4 }} />
              </button>
              {showBulkDropdown && (
                <div className="dropdown-menu" style={{ width: 280, right: 0, left: 'auto' }}>
                  {bulkActionGroups.map((group, gIdx) => (
                    <div key={gIdx}>
                      {group.label && <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{group.label}</div>}
                      {group.actions.map((action, aIdx) => (
                        <button
                          key={aIdx}
                          className={`dropdown-item`}
                          style={action.danger ? { color: '#ef4444' } : {}}
                          type="button"
                          onClick={() => {
                            setShowBulkDropdown(false);
                            const items = filteredItems.filter(i => selectedIds.has(i._id));
                            action.onClick(items, () => {
                              setSelectedIds(new Set());
                              load();
                            });
                          }}
                        >
                          {action.icon}
                          <span>{action.label}</span>
                        </button>
                      ))}
                      {gIdx < bulkActionGroups.length - 1 && <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }}></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {extraHeaderButtons}
          {!hideCreate && primaryActionLabel && (
            <button className="btn btn-primary" type="button" onClick={onPrimaryActionClick ? onPrimaryActionClick : openCreate}>
              <Plus size={16} /> {primaryActionLabel}
            </button>
          )}
          {primaryActions && primaryActions.length > 0 && (
            <div className="dropdown-container">
              <button
                className="btn btn-outline"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown(!showDropdown);
                }}
              >
                Hành động nhanh
              </button>
              {showDropdown && (
                <div className="dropdown-menu">
                  {primaryActions.map((action, idx) => (
                    <button
                      key={idx}
                      className="dropdown-item"
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        action.onClick();
                      }}
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="metric-row">
          {metrics.map((metric) => (
            <div className={`metric-card ${metric.tone ?? 'neutral'}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="module-grid">
        <aside className="filter-panel">
          <div className="panel-title">
            <Filter size={18} />
            <span>Bộ lọc</span>
          </div>
          <label className="field-label">Tìm kiếm</label>
          <div className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã, tên, số điện thoại..." />
          </div>
          {quickFilters.length > 0 && (
            <>
              <label className="field-label">Lọc nhanh</label>
              <div className="quick-filter-list">
                <button className={!quickFilter ? 'active' : ''} type="button" onClick={() => setQuickFilter('')}>Tất cả</button>
                {quickFilters.map((filter) => (
                  <button className={quickFilter === filter.value ? 'active' : ''} key={filter.value} type="button" onClick={() => setQuickFilter(filter.value)}>
                    {filter.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {!hideCreate && (
            <div className="quick-actions">
              <span>Thao tác nhanh</span>
              {primaryActions && primaryActions.length > 0 ? (
                <div className="dropdown-container full-width">
                  <button
                    className="btn btn-primary full"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuickDropdown(!showQuickDropdown);
                    }}
                  >
                    <Plus size={16} /> Tạo mới
                  </button>
                  {showQuickDropdown && (
                    <div className="dropdown-menu left-align">
                      {primaryActions.map((action, idx) => (
                        <button
                          key={idx}
                          className="dropdown-item"
                          type="button"
                          onClick={() => {
                            setShowQuickDropdown(false);
                            action.onClick();
                          }}
                        >
                          {action.icon}
                          <span>{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button className="btn btn-primary full" type="button" onClick={onPrimaryActionClick ? onPrimaryActionClick : openCreate}>
                  <Plus size={16} /> Tạo mới
                </button>
              )}
            </div>
          )}
        </aside>

        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>{title}</h2>
              <span className="record-badge">{filteredItems.length} bản ghi</span>
            </div>
            {error && <span className="error-chip">{error}</span>}
          </div>
          <div className="table-scroll">
            <table className="data-table">
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
                {loading && (
                  <tr>
                    <td colSpan={fields.length + 2} className="empty-cell">Đang tải dữ liệu...</td>
                  </tr>
                )}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={fields.length + 2} className="empty-cell">Chưa có dữ liệu phù hợp.</td>
                  </tr>
                )}
                {!loading && filteredItems.map((item) => (
                  <tr key={item._id}>
                    <td className="check-cell">
                      <input 
                        type="checkbox" 
                        aria-label={`Chọn ${item.name ?? item.code ?? item._id}`}
                        checked={selectedIds.has(item._id)}
                        onChange={(e) => handleSelectRow(item._id, e.target.checked)} 
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
                      {actions.map((action) => (
                        <button className="mini-action" type="button" key={action.label} onClick={() => runAction(item, action)}>
                          {action.label}
                        </button>
                      ))}
                      <button className="mini-action" type="button" onClick={() => openEdit(item)}>
                        Sửa
                      </button>
                      <button className="icon-button danger" type="button" onClick={() => remove(item._id)} title="Xóa">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}

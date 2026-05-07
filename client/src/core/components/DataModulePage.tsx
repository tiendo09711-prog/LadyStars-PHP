import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { FileDown, FileUp, Filter, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
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

type DataModulePageProps = {
  title: string;
  subtitle: string;
  endpoint: string;
  icon: ReactNode;
  fields: DataField[];
  formFields: FormField[];
  createDefaults: Record<string, unknown>;
  primaryActionLabel: string;
  quickFilters?: { label: string; value: string }[];
  metrics?: ModuleMetric[];
  normalizePayload?: (payload: Record<string, unknown>) => Record<string, unknown>;
};

function getValue(item: Record<string, any>, key: string) {
  return key.split('.').reduce((value, part) => value?.[part], item);
}

function formatValue(value: unknown, type: DataField['type']) {
  if (value === undefined || value === null || value === '') return '-';
  if (type === 'money') return `${Number(value).toLocaleString('vi-VN')} đ`;
  if (type === 'date') return new Date(String(value)).toLocaleDateString('vi-VN');
  if (type === 'number') return Number(value).toLocaleString('vi-VN');
  return String(value);
}

function statusClass(value: unknown) {
  const status = String(value ?? '').toLowerCase();
  if (['completed', 'success', 'done', 'paid', 'active'].includes(status)) return 'success';
  if (['draft', 'todo', 'temp', 'wait'].includes(status)) return 'warning';
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
  quickFilters = [],
  metrics = [],
  normalizePayload,
}: DataModulePageProps) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>(createDefaults);
  const [error, setError] = useState('');

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
        ? Object.values(item).some((value) => String(value).toLowerCase() === quickFilter.toLowerCase())
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
      await http.post(endpoint, normalizePayload ? normalizePayload(payload) : payload);
      setShowModal(false);
      setForm(createDefaults);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không lưu được dữ liệu.');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi này?')) return;
    await http.delete(`${endpoint}/${id}`);
    await load();
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
          <button className="btn btn-light" type="button" onClick={load}>
            <RefreshCw size={16} /> Làm mới
          </button>
          <button className="btn btn-success" type="button">
            <FileDown size={16} /> Xuất Excel
          </button>
          <button className="btn btn-outline" type="button">
            <FileUp size={16} /> Nhập Excel
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>
            <Plus size={16} /> {primaryActionLabel}
          </button>
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
          <div className="quick-actions">
            <span>Thao tác nhanh</span>
            <button className="btn btn-primary full" type="button" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Tạo mới
            </button>
          </div>
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
                  <th className="check-cell"><input type="checkbox" aria-label="Chọn tất cả" /></th>
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
                    <td className="check-cell"><input type="checkbox" aria-label={`Chọn ${item.name ?? item.code ?? item._id}`} /></td>
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
                <h2>{primaryActionLabel}</h2>
                <p>{title}</p>
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
                    <textarea value={String(form[field.key] ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} rows={4} />
                  ) : field.type === 'select' ? (
                    <select value={String(form[field.key] ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input
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

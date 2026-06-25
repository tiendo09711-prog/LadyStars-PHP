import { useEffect, useMemo, useState } from 'react';
import { Eye, FileDown, Filter, RefreshCw, Table2 } from 'lucide-react';
import { http } from '../../core/api/http';
import './warehouseRecords.css';

type TabKey = 'vouchers' | 'products';
type ApiResult = {
  items: any[];
  total: number;
  page: number;
  limit: number;
  meta?: Record<string, string[]>;
};

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
const fmt = (value: any) => Number(value || 0).toLocaleString('vi-VN');
const rangeText = (page: number, limit: number, total: number) => {
  if (!total) return '0 - 0 / 0';
  return `${(page - 1) * limit + 1} - ${Math.min(page * limit, total)} / ${total}`;
};

function downloadCsv(name: string, rows: any[], columns: { key: string; label: string }[]) {
  const lines = [
    columns.map((column) => column.label).join(','),
    ...rows.map((row) => columns.map((column) => `"${String(row[column.key] ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function SelectFilter({ value, onChange, options, placeholder }: { value: string; onChange: (value: string) => void; options: string[]; placeholder: string }) {
  return (
    <select className="wr-filter" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

export function WarehouseHistoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('vouchers');
  const [data, setData] = useState<ApiResult>({ items: [], total: 0, page: 1, limit: 15, meta: {} });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    warehouse: '',
    voucherId: '',
    productId: '',
    logType: '',
    xnkCategory: '',
    xnkType: '',
    product: '',
    ...defaultDateRange(),
  });

  const endpoint = activeTab === 'vouchers' ? '/warehouse/history-vouchers' : '/warehouse/history-products';
  const page = data.page || 1;
  const limit = data.limit || 15;
  const totalPages = Math.max(Math.ceil((data.total || 0) / limit), 1);
  const meta = data.meta || {};

  const params = useMemo(() => {
    const next = new URLSearchParams();
    next.set('page', String(page));
    next.set('limit', String(limit));
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (activeTab === 'vouchers' && (key === 'productId' || key === 'product')) return;
      next.set(key, value);
    });
    return next;
  }, [activeTab, filters, limit, page]);

  const load = async (targetPage = page) => {
    setLoading(true);
    const next = new URLSearchParams(params);
    next.set('page', String(targetPage));
    try {
      const response = await http.get(`${endpoint}?${next.toString()}`);
      setData(response.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData((current) => ({ ...current, page: 1 }));
  }, [activeTab]);

  useEffect(() => {
    load(1);
  }, [activeTab, filters]);

  const exportRows = () => {
    const columns = activeTab === 'vouchers'
      ? [
          { key: 'draftVoucherId', label: 'ID hóa đơn đơn nháp' },
          { key: 'logType', label: 'Kiểu log' },
          { key: 'xnkCategory', label: 'Loại XNK' },
          { key: 'xnkType', label: 'Kiểu XNK' },
          { key: 'xnkDate', label: 'Ngày XNK' },
          { key: 'customer', label: 'Khách hàng' },
          { key: 'actor', label: 'Người thao tác' },
          { key: 'createdAtStr', label: 'Thời gian tạo' },
        ]
      : [
          { key: 'voucherId', label: 'ID phiếu XNK' },
          { key: 'inventoryProductId', label: 'ID sản phẩm XNK' },
          { key: 'logType', label: 'Kiểu log' },
          { key: 'xnkCategory', label: 'Loại XNK' },
          { key: 'xnkType', label: 'Kiểu XNK' },
          { key: 'productName', label: 'Sản phẩm' },
          { key: 'imei', label: 'IMEI' },
          { key: 'qty', label: 'Số lượng' },
          { key: 'price', label: 'Giá' },
          { key: 'actor', label: 'Người thao tác' },
          { key: 'createdAtStr', label: 'Thời gian tạo' },
        ];
    downloadCsv(activeTab === 'vouchers' ? 'log-sua-xoa-phieu-xnk.csv' : 'log-sua-xoa-san-pham-xnk.csv', data.items, columns);
  };

  return (
    <div className="workspace-page warehouse-records">
      <div className="workspace-tabs" role="tablist" aria-label="Warehouse history tabs">
        <button className={activeTab === 'vouchers' ? 'active' : ''} onClick={() => setActiveTab('vouchers')}>Log sửa xóa phiếu XNK</button>
        <button className={activeTab === 'products' ? 'active' : ''} onClick={() => setActiveTab('products')}>Log sửa xóa sản phẩm XNK</button>
      </div>

      <section className="wr-card">
        <div className="wr-filters">
          <SelectFilter value={filters.warehouse} onChange={(value) => setFilters((current) => ({ ...current, warehouse: value }))} options={meta.xnkType || []} placeholder="Kho hàng" />
          {activeTab === 'products' ? (
            <input className="wr-filter" value={filters.productId} onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))} placeholder="ID sản phẩm XNK" />
          ) : null}
          <input className="wr-filter" value={filters.voucherId} onChange={(event) => setFilters((current) => ({ ...current, voucherId: event.target.value }))} placeholder="ID phiếu XNK" />
          <SelectFilter value={filters.logType} onChange={(value) => setFilters((current) => ({ ...current, logType: value }))} options={meta.logType || []} placeholder="Kiểu log" />
          <SelectFilter value={filters.xnkCategory} onChange={(value) => setFilters((current) => ({ ...current, xnkCategory: value }))} options={meta.xnkCategory || []} placeholder="Loại" />
          <SelectFilter value={filters.xnkType} onChange={(value) => setFilters((current) => ({ ...current, xnkType: value }))} options={meta.xnkType || []} placeholder="Kiểu" />
          {activeTab === 'products' ? (
            <input className="wr-filter wide" value={filters.product} onChange={(event) => setFilters((current) => ({ ...current, product: event.target.value }))} placeholder="Sản phẩm" />
          ) : null}
          <input className="wr-filter" type="date" value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} />
          <input className="wr-filter" type="date" value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} />
          <button className="btn btn-primary" type="button" onClick={() => load(1)}><Filter size={15} /> Lọc</button>
        </div>

        <div className="wr-actions">
          <div className="wr-action-left">
            <button className="btn btn-light" type="button" onClick={exportRows}><FileDown size={15} /> Xuất dữ liệu</button>
          </div>
          <div className="wr-action-right">
            <span className="wr-count">{rangeText(page, limit, data.total)}</span>
            <button className="icon-button" type="button" onClick={() => load(page)} title="Làm mới"><RefreshCw size={15} /></button>
            <button className="icon-button" type="button" title="Cột"><Table2 size={15} /></button>
          </div>
        </div>

        <div className="wr-table-wrap">
          {activeTab === 'vouchers' ? (
            <table className="wr-table">
              <thead>
                <tr>
                  <th>ID hóa đơn<br />đơn nháp</th>
                  <th>Kiểu log</th>
                  <th>Loại XNK</th>
                  <th>Kiểu XNK</th>
                  <th>Ngày XNK</th>
                  <th>Khách hàng</th>
                  <th>Người thao tác</th>
                  <th>Thời gian tạo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length ? data.items.map((item) => (
                  <tr key={item._id}>
                    <td className="center wr-link">{item.draftVoucherId}</td>
                    <td className="center">{item.logType}</td>
                    <td className="center">{item.xnkCategory}</td>
                    <td>{item.xnkType}</td>
                    <td className="center">{item.xnkDate}</td>
                    <td>{item.customer}</td>
                    <td className="center">{item.actor}</td>
                    <td className="center">{item.createdAtStr}</td>
                    <td className="center"><Eye size={15} className="wr-link" /></td>
                  </tr>
                )) : <tr><td colSpan={9} className="wr-empty">{loading ? 'Đang tải...' : 'Không có dữ liệu'}</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="wr-table">
              <thead>
                <tr>
                  <th>ID phiếu<br />XNK</th>
                  <th>ID sản phẩm<br />XNK</th>
                  <th>Kiểu log</th>
                  <th>Loại XNK</th>
                  <th>Kiểu XNK</th>
                  <th>Sản phẩm</th>
                  <th>IMEI</th>
                  <th>Số lượng</th>
                  <th>Giá</th>
                  <th>Người thao tác</th>
                  <th>Thời gian tạo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length ? data.items.map((item) => (
                  <tr key={item._id}>
                    <td className="center wr-link">{item.voucherId}</td>
                    <td className="center wr-link">{item.inventoryProductId}</td>
                    <td className="center">{item.logType}</td>
                    <td className="center">{item.xnkCategory}</td>
                    <td>{item.xnkType}</td>
                    <td><span className="wr-product">{item.productName}</span></td>
                    <td className="center">{item.imei}</td>
                    <td className="center wr-link">{fmt(item.qty)}</td>
                    <td className="right">{item.price ? fmt(item.price) : ''}</td>
                    <td className="center">{item.actor}</td>
                    <td className="center">{item.createdAtStr}</td>
                    <td className="center"><Eye size={15} className="wr-link" /></td>
                  </tr>
                )) : <tr><td colSpan={12} className="wr-empty">{loading ? 'Đang tải...' : 'Không có dữ liệu'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        <div className="wr-footer">
          <button className="icon-button" type="button" disabled={page <= 1} onClick={() => load(page - 1)}>‹</button>
          <span style={{ padding: '8px 12px' }}>{rangeText(page, limit, data.total)}</span>
          <button className="icon-button" type="button" disabled={page >= totalPages} onClick={() => load(page + 1)}>›</button>
        </div>
      </section>
    </div>
  );
}

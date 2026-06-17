import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileDown, Filter, Menu, Plus, RefreshCw, Table2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

export function WarehouseDraftPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('vouchers');
  const [data, setData] = useState<ApiResult>({ items: [], total: 0, page: 1, limit: 50, meta: {} });
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState({
    fromWarehouse: '',
    toWarehouse: '',
    id: '',
    voucherId: '',
    product: '',
    fromDate: '',
    toDate: '',
  });

  const endpoint = activeTab === 'vouchers' ? '/warehouse/draft-vouchers' : '/warehouse/draft-products';
  const page = data.page || 1;
  const limit = data.limit || 50;
  const totalPages = Math.max(Math.ceil((data.total || 0) / limit), 1);
  const meta = data.meta || {};

  const params = useMemo(() => {
    const next = new URLSearchParams();
    next.set('page', String(page));
    next.set('limit', String(limit));
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (activeTab === 'vouchers' && (key === 'voucherId' || key === 'product')) return;
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

  const voucherTotals = useMemo(() => data.items.reduce((acc, item) => ({
    spCount: acc.spCount + Number(item.spCount || 0),
    qty: acc.qty + Number(item.qty || 0),
  }), { spCount: 0, qty: 0 }), [data.items]);

  const exportRows = () => {
    const columns = activeTab === 'vouchers'
      ? [
          { key: 'externalId', label: 'ID' },
          { key: 'date', label: 'Ngày' },
          { key: 'warehouse', label: 'Kho hàng' },
          { key: 'spCount', label: 'SP' },
          { key: 'qty', label: 'SL' },
          { key: 'totalAmount', label: 'Tổng tiền' },
          { key: 'creator', label: 'Người tạo' },
          { key: 'approvedBy', label: 'Duyệt' },
          { key: 'confirmedBy', label: 'Xác nhận' },
        ]
      : [
          { key: 'externalId', label: 'ID' },
          { key: 'requestId', label: 'ID phiếu yêu cầu' },
          { key: 'warehouse', label: 'Kho hàng' },
          { key: 'creator', label: 'Người lập' },
          { key: 'productName', label: 'Sản phẩm' },
          { key: 'requestedQty', label: 'SL YC' },
          { key: 'approvedQty', label: 'SL duyệt' },
          { key: 'xnkQty', label: 'SL XNK' },
          { key: 'amount', label: 'Tổng tiền' },
        ];
    downloadCsv(activeTab === 'vouchers' ? 'phieu-xnk-nhap.csv' : 'san-pham-xnk-nhap.csv', data.items, columns);
  };

  return (
    <div className="workspace-page warehouse-records">
      <div className="workspace-tabs" role="tablist" aria-label="Warehouse draft tabs">
        <button className={activeTab === 'vouchers' ? 'active' : ''} onClick={() => setActiveTab('vouchers')}>Phiếu XNK nháp</button>
        <button className={activeTab === 'products' ? 'active' : ''} onClick={() => setActiveTab('products')}>Sản phẩm XNK nháp</button>
      </div>

      <section className="wr-card">
        <div className="wr-filters">
          <SelectFilter value={filters.fromWarehouse} onChange={(value) => setFilters((current) => ({ ...current, fromWarehouse: value }))} options={meta.fromWarehouse || []} placeholder="Từ kho" />
          <SelectFilter value={filters.toWarehouse} onChange={(value) => setFilters((current) => ({ ...current, toWarehouse: value }))} options={meta.toWarehouse || []} placeholder="Đến kho" />
          <input className="wr-filter" value={filters.id} onChange={(event) => setFilters((current) => ({ ...current, id: event.target.value }))} placeholder="ID" />
          {activeTab === 'products' ? (
            <>
              <input className="wr-filter" value={filters.voucherId} onChange={(event) => setFilters((current) => ({ ...current, voucherId: event.target.value }))} placeholder="ID phiếu XNK" />
              <input className="wr-filter wide" value={filters.product} onChange={(event) => setFilters((current) => ({ ...current, product: event.target.value }))} placeholder="Sản phẩm" />
            </>
          ) : null}
          <input className="wr-filter" type="date" value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} />
          <input className="wr-filter" type="date" value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} />
          <button className="btn btn-primary" type="button" onClick={() => load(1)}><Filter size={15} /> Lọc</button>
        </div>

        <div className="wr-actions">
          <div className="wr-action-left">
            <div className="wr-menu">
              <button className="btn btn-success" type="button" onClick={() => setShowCreate((value) => !value)}>
                <Plus size={15} /> Thêm mới <ChevronDown size={14} />
              </button>
              {showCreate ? (
                <div className="wr-menu-panel">
                  <button type="button" onClick={() => navigate('/warehouse/transactions/vouchers/import')}>Phiếu nhập kho</button>
                  <button type="button" onClick={() => navigate('/warehouse/transactions/vouchers/export')}>Phiếu xuất kho</button>
                </div>
              ) : null}
            </div>
            <button className="btn btn-light" type="button" onClick={exportRows}><FileDown size={15} /> Thao tác</button>
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
                  <th><input type="checkbox" aria-label="Chọn tất cả" /></th>
                  <th>ID | Ngày</th>
                  <th>Kho hàng</th>
                  <th>SP</th>
                  <th>SL</th>
                  <th>Tổng tiền</th>
                  <th>Người tạo</th>
                  <th>Duyệt</th>
                  <th>Xác nhận</th>
                  <th><Menu size={14} /></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length ? data.items.map((item) => (
                  <tr key={item._id}>
                    <td className="center"><input type="checkbox" aria-label={`Chọn ${item.externalId}`} /></td>
                    <td className="center"><span className="wr-link">{item.externalId}</span><span className="wr-sub">{item.date}</span></td>
                    <td>{item.fromWarehouse && item.toWarehouse ? <>{item.fromWarehouse} <span className="wr-danger">→</span> {item.toWarehouse}</> : item.warehouse}<span className="wr-sub wr-danger">{item.type}</span></td>
                    <td className="center wr-link">{fmt(item.spCount)}</td>
                    <td className="center">{fmt(item.qty)}</td>
                    <td className="right">{item.totalAmount ? fmt(item.totalAmount) : ''}</td>
                    <td className="center">{item.creator}<span className="wr-sub">{item.timeCreated}</span></td>
                    <td className="center wr-success">{item.approvedBy}<span className="wr-sub">{item.approvedAt}</span></td>
                    <td className="center wr-success">{item.confirmedBy}<span className="wr-sub">{item.confirmedAt}</span></td>
                    <td className="center"><Menu size={15} /></td>
                  </tr>
                )) : <tr><td colSpan={10} className="wr-empty">{loading ? 'Đang tải...' : 'Không có dữ liệu'}</td></tr>}
                {data.items.length ? (
                  <tr className="wr-total-row">
                    <td colSpan={3} className="right">Tổng</td>
                    <td className="center">{fmt(voucherTotals.spCount)}</td>
                    <td className="center">{fmt(voucherTotals.qty)}</td>
                    <td colSpan={5}></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <table className="wr-table">
              <thead>
                <tr>
                  <th>ID | Ngày</th>
                  <th>Kho hàng</th>
                  <th>Người lập</th>
                  <th>Sản phẩm</th>
                  <th>SL tồn</th>
                  <th>SL YC</th>
                  <th>Giá YC</th>
                  <th>Tiền YC</th>
                  <th>SL duyệt</th>
                  <th>Giá duyệt</th>
                  <th>SL XNK</th>
                  <th>Tổng tiền</th>
                  <th><Menu size={14} /></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length ? data.items.map((item) => (
                  <tr key={item._id}>
                    <td className="center"><span className="wr-link">{item.externalId}</span><span className="wr-sub">{item.date}</span></td>
                    <td>{item.type}<span className="wr-sub">{item.fromWarehouse} <span className="wr-danger">→</span> {item.toWarehouse}</span></td>
                    <td className="center">{item.creator}</td>
                    <td><span className="wr-product">{item.productCode}</span><small>{item.productName}</small></td>
                    <td className="center"></td>
                    <td className="center wr-danger">{fmt(item.requestedQty)}</td>
                    <td className="right">{item.requestedPrice ? fmt(item.requestedPrice) : ''}</td>
                    <td className="right">{item.amount ? fmt(item.amount) : ''}</td>
                    <td className="center">{fmt(item.approvedQty)}</td>
                    <td className="right">{item.approvedValue ? fmt(item.approvedValue) : ''}</td>
                    <td className="center wr-link">{fmt(item.xnkQty)}</td>
                    <td className="right">{item.confirmedValue ? fmt(item.confirmedValue) : ''}</td>
                    <td className="center"><Menu size={15} /></td>
                  </tr>
                )) : <tr><td colSpan={13} className="wr-empty">{loading ? 'Đang tải...' : 'Không có dữ liệu'}</td></tr>}
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

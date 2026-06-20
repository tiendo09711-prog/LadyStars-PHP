import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Download, Eye, FileSpreadsheet, Filter, MoreHorizontal, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';
import { Pagination } from '../../core/components/Pagination';
import './warehouseRecords.css';

type TabKey = 'all' | 'draft' | 'outgoing' | 'incoming';
type Option = { value: string; label: string; code?: string };

type TransferRow = {
  _id: string;
  id?: string;
  code?: string;
  date?: string;
  createdAt?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  sourceWarehouseName?: string;
  destinationWarehouseName?: string;
  warehouse?: string;
  type?: string;
  spCount?: number;
  qty?: number;
  totalAmount?: number;
  creator?: string;
  createdById?: { name?: string; email?: string } | string;
  requestApprovedById?: { name?: string; email?: string } | string;
  dispatchConfirmedById?: { name?: string; email?: string } | string;
  dispatchApprovedById?: { name?: string; email?: string } | string;
  receiptConfirmedById?: { name?: string; email?: string } | string;
  receiptApprovedById?: { name?: string; email?: string } | string;
  requestApprovedAt?: string;
  dispatchConfirmedAt?: string;
  dispatchApprovedAt?: string;
  receiptConfirmedAt?: string;
  receiptApprovedAt?: string;
  status?: string;
  statusLabel?: string;
  statusTone?: string;
  note?: string;
  requestVoucher?: string;
  transferRequestId?: string;
  availableActions?: Array<{ action: string; label: string; needsReason?: boolean; danger?: boolean }>;
};

type ImportPreview = {
  importSessionId: string;
  fileName: string;
  summary: { validTransferCount: number; validItemCount: number; errorRowCount: number; totalRowCount: number };
  rows: Array<{ excelRow: number; groupCode: string; sourceText: string; destinationText: string; productText: string; requestedQuantity: string; errors: Array<{ column: string; message: string }> }>;
};

const LIMIT = 20;
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Phiếu nháp' },
  { key: 'outgoing', label: 'Đang chuyển đi' },
  { key: 'incoming', label: 'Sắp chuyển đến' },
];

const emptyFilters = { id: '', sourceWarehouseId: '', destinationWarehouseId: '', status: '', fromDate: '', toDate: '' };

function displayDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function displayDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function displayMoney(value?: number) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function displayUser(value: TransferRow['createdById'], fallback = '-') {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return value.name || value.email || fallback;
}

function rowCode(row: TransferRow) {
  return row.id || row.code || row.requestVoucher || row._id;
}

function direction(row: TransferRow) {
  if (row.sourceWarehouseName || row.destinationWarehouseName) return `${row.sourceWarehouseName || 'Kho nguồn'} → ${row.destinationWarehouseName || 'Kho đích'}`;
  return row.warehouse || '-';
}

function actionLabel(row: TransferRow, tab: TabKey, role: string) {
  const status = row.status;
  if (role === 'ADMIN') {
    if (status === 'PENDING_REQUEST_APPROVAL') return 'Duyệt / từ chối yêu cầu';
    if (status === 'PENDING_DISPATCH_APPROVAL') return 'Duyệt xuất kho';
    if (status === 'PENDING_RECEIPT_APPROVAL') return 'Duyệt nhận kho';
    if (status === 'PENDING_RETURN_APPROVAL') return 'Duyệt hoàn tồn';
  }
  if (tab === 'outgoing' && status === 'APPROVED_TO_DISPATCH') return 'Xác nhận đã xuất hàng';
  if (tab === 'incoming' && status === 'IN_TRANSIT') return 'Xác nhận nhận / từ chối';
  if (status === 'DRAFT') return 'Gửi duyệt';
  return '';
}

export function WarehouseTransferPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [meta, setMeta] = useState<{ role: string; warehouses: Option[]; statuses: Option[] }>({ role: 'EMPLOYEE', warehouses: [], statuses: [] });
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ row: TransferRow; action: string; title: string; needsReason?: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importSubmit, setImportSubmit] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const visibleColumns = activeTab === 'all' ? 9 : activeTab === 'draft' ? 12 : 7;

  const loadMeta = async () => {
    const response = await http.get('/warehouse/transfers/meta');
    setMeta(response.data);
  };

  const load = async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await http.get('/warehouse/transfers', { params: { tab: activeTab, page, limit: LIMIT, ...appliedFilters }, signal });
      setRows(response.data.items || []);
      setTotal(Number(response.data.total || 0));
    } catch (err: any) {
      if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Không tải được danh sách chuyển kho.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => { void loadMeta().catch(() => setError('Không tải được thông tin kho/quyền.')); }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [activeTab, page, appliedFilters]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer); }, [notice]);

  const applyFilters = (event: FormEvent) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); };
  const resetFilters = () => { setPage(1); setFilters(emptyFilters); setAppliedFilters(emptyFilters); };
  const changeTab = (tab: TabKey) => { setActiveTab(tab); setPage(1); setOpenMenu(null); };

  const runAction = async () => {
    if (!confirm) return;
    if (confirm.needsReason && !reason.trim()) { setError('Vui lòng nhập lý do.'); return; }
    setActionLoading(true); setError('');
    try {
      await http.post(`/warehouse/transfers/${confirm.row._id}/actions/${confirm.action}`, { reason });
      setNotice('Đã cập nhật trạng thái phiếu chuyển kho.');
      setConfirm(null); setReason(''); await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thực hiện được thao tác.');
    } finally {
      setActionLoading(false);
    }
  };

  const openAction = (row: TransferRow, action: string, title: string, needsReason = false) => {
    setOpenMenu(null); setReason(''); setConfirm({ row, action, title, needsReason });
  };

  const validateImport = async () => {
    if (!importFile) { setError('Vui lòng chọn file import.'); return; }
    setImportLoading(true); setImportPreview(null); setError('');
    try {
      const form = new FormData(); form.append('file', importFile);
      const response = await http.post('/warehouse/transfers/import/validate', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportPreview(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không kiểm tra được file import.');
    } finally { setImportLoading(false); }
  };

  const commitImport = async () => {
    if (!importPreview) return;
    setImportLoading(true); setError('');
    try {
      const response = await http.post('/warehouse/transfers/import/commit', { importSessionId: importPreview.importSessionId, submitForApproval: importSubmit });
      setNotice(`Import thành công ${response.data.successTransferCount || 0} phiếu, lỗi ${response.data.failedTransferCount || 0} phiếu. Không thay đổi tồn kho.`);
      setImportOpen(false); setImportFile(null); setImportPreview(null); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Không import được phiếu chuyển kho.'); }
    finally { setImportLoading(false); }
  };

  const downloadTemplate = async () => {
    const response = await http.get('/warehouse/transfers/import-template', { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a'); link.href = url; link.download = 'warehouse-transfer-import-template.xlsx'; link.click(); URL.revokeObjectURL(url);
  };

  const actionButtons = (row: TransferRow) => row.availableActions || [];

  const totals = useMemo(() => rows.reduce((acc, row) => ({ sp: acc.sp + Number(row.spCount || 0), qty: acc.qty + Number(row.qty || 0) }), { sp: 0, qty: 0 }), [rows]);

  return (
    <div className="workspace-page warehouse-records" ref={rootRef}>
      <section className="wr-card">
        <div className="workspace-tabs wr-tabs" role="tablist" aria-label="Chuyển kho">
          {tabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => changeTab(tab.key)}>{tab.label}</button>)}
        </div>

        <form className="wr-filters" onSubmit={applyFilters}>
          <label className="wr-search-field"><Search size={14} /><input value={filters.id} onChange={(e) => setFilters({ ...filters, id: e.target.value })} placeholder="ID / mã phiếu" /></label>
          {activeTab !== 'all' && <select className="wr-filter" value={filters.sourceWarehouseId} onChange={(e) => setFilters({ ...filters, sourceWarehouseId: e.target.value })}><option value="">Kho nguồn</option>{meta.warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select>}
          {activeTab !== 'all' && <select className="wr-filter" value={filters.destinationWarehouseId} onChange={(e) => setFilters({ ...filters, destinationWarehouseId: e.target.value })}><option value="">Kho đích</option>{meta.warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select>}
          {activeTab !== 'all' && <select className="wr-filter wide" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Trạng thái</option>{meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}
          <label className="wr-date-field"><span>Từ</span><input type="date" value={filters.fromDate} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} /></label>
          <label className="wr-date-field"><span>Đến</span><input type="date" value={filters.toDate} onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} /></label>
          <button className="btn btn-primary wr-filter-button" type="submit"><Filter size={15} /> Lọc</button>
          <button className="btn btn-light wr-reset-button" type="button" onClick={resetFilters}>Đặt lại</button>
        </form>

        <div className="wr-actions">
          <div className="wr-action-left">
            <div className="wr-menu">
              <button className="btn wr-create-button" type="button" onClick={() => setOpenMenu(openMenu === 'create' ? null : 'create')}><Plus size={15} /> Thêm mới <ChevronDown size={14} /></button>
              {openMenu === 'create' && <div className="wr-menu-panel wr-action-menu">
                <button type="button" onClick={() => navigate('/warehouse/transfers/create')}><Plus size={15} /> Tạo phiếu chuyển kho</button>
                <button type="button" onClick={() => { setOpenMenu(null); setImportOpen(true); }}><FileSpreadsheet size={15} /> Import phiếu chuyển kho</button>
                <button type="button" onClick={() => void downloadTemplate()}><Download size={15} /> Tải file mẫu import</button>
              </div>}
            </div>
          </div>
          <div className="wr-action-right"><span className="wr-count">{total ? `${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} / ${total}` : '0 bản ghi'} · SP {totals.sp} · SL {totals.qty}</span><button className="wr-icon-button" type="button" onClick={() => void load()} title="Làm mới"><RefreshCw size={15} /></button></div>
        </div>

        {notice && <div className="wr-notice"><Check size={16} /> {notice}</div>}
        {error && <div className="wr-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button type="button" onClick={() => setError('')}>Đóng</button></div>}

        <div className="wr-table-wrap"><table className="wr-table"><thead><tr><th className="wr-checkbox-cell"><input type="checkbox" disabled /></th>{activeTab === 'all' ? <><th>ID | Ngày</th><th>Kho hàng/hướng chuyển</th><th>Kiểu</th><th>SP</th><th>SL</th><th>Tổng tiền</th><th>Người tạo</th><th>Ghi chú</th></> : <><th>ID | Ngày</th><th>Kho nguồn → kho đích</th><th>SP</th><th>SL yêu cầu</th>{activeTab === 'draft' && <><th>Người tạo</th><th>Người duyệt yêu cầu</th><th>Xác nhận xuất</th><th>Duyệt xuất</th><th>Xác nhận nhận</th><th>Duyệt nhận</th></>}<th>Trạng thái</th></>}<th className="wr-action-cell"><MoreHorizontal size={14} /></th></tr></thead><tbody>
          {loading && Array.from({ length: 6 }).map((_, i) => <tr className="wr-skeleton" key={i}><td colSpan={visibleColumns + 2}><span /></td></tr>)}
          {!loading && rows.length === 0 && <tr><td className="wr-empty" colSpan={visibleColumns + 2}>Chưa có dữ liệu phù hợp.</td></tr>}
          {!loading && rows.map((row) => <tr key={row._id}>
            <td className="wr-checkbox-cell"><input type="checkbox" /></td><td className="wr-identity-cell"><button type="button" className="wr-link" onClick={() => navigate(row.transferRequestId ? `/warehouse/transfers/${row.transferRequestId}` : `/warehouse/transfers/${row._id}`)}>{rowCode(row)}</button><span>{displayDate(row.date || row.createdAt)}</span></td>
            <td>{direction(row)}{row.type && <span className="wr-sub wr-danger">{row.type}</span>}</td>
            {activeTab === 'all' ? <><td><span className="wr-direction transfer">{row.type || '-'}</span></td><td className="right">{Number(row.spCount || 0).toLocaleString('vi-VN')}</td><td className="right">{Number(row.qty || 0).toLocaleString('vi-VN')}</td><td className="right">{displayMoney(row.totalAmount)}</td><td>{row.creator || '-'}</td><td className="wr-note-cell">{row.note || '-'}</td></> : <><td className="right">{Number(row.spCount || 0).toLocaleString('vi-VN')}</td><td className="right">{Number(row.qty || 0).toLocaleString('vi-VN')}</td>{activeTab === 'draft' && <><td>{row.creator || displayUser(row.createdById)}</td><td>{displayUser(row.requestApprovedById)}<span className="wr-sub">{displayDateTime(row.requestApprovedAt)}</span></td><td>{displayUser(row.dispatchConfirmedById)}<span className="wr-sub">{displayDateTime(row.dispatchConfirmedAt)}</span></td><td>{displayUser(row.dispatchApprovedById)}<span className="wr-sub">{displayDateTime(row.dispatchApprovedAt)}</span></td><td>{displayUser(row.receiptConfirmedById)}<span className="wr-sub">{displayDateTime(row.receiptConfirmedAt)}</span></td><td>{displayUser(row.receiptApprovedById)}<span className="wr-sub">{displayDateTime(row.receiptApprovedAt)}</span></td></>}<td><span className={`wr-direction ${row.statusTone || 'adjustment'}`}>{row.statusLabel || row.status}</span><small className="wr-kind">{actionLabel(row, activeTab, meta.role) || '—'}</small></td></>}
            <td className="wr-action-cell"><div className="wr-menu"><button className="wr-row-menu-button" type="button" onClick={() => setOpenMenu(openMenu === row._id ? null : row._id)}><MoreHorizontal size={17} /></button>{openMenu === row._id && <div className="wr-menu-panel wr-row-menu"><button type="button" onClick={() => navigate(row.transferRequestId ? `/warehouse/transfers/${row.transferRequestId}` : `/warehouse/transfers/${row._id}`)}><Eye size={15} /> Xem chi tiết</button>{activeTab !== 'all' && actionButtons(row).map((item) => <button key={item.action} className={item.danger ? 'danger' : ''} type="button" onClick={() => openAction(row, item.action, item.label, item.needsReason)}>{item.label}</button>)}</div>}</div></td>
          </tr>)}
        </tbody></table></div>
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </section>

      {confirm && <div className="modal-backdrop wr-modal-backdrop" role="presentation"><section className="wr-confirm-modal" role="dialog" aria-modal="true"><header><h2>{confirm.title}</h2><button className="wr-icon-button" type="button" onClick={() => setConfirm(null)}><X size={16} /></button></header><p>Bạn đang thao tác phiếu <strong>{rowCode(confirm.row)}</strong>. {confirm.needsReason ? 'Vui lòng nhập lý do.' : 'Xác nhận tiếp tục?'}</p>{confirm.needsReason && <div style={{ padding: '0 16px 16px' }}><textarea className="wr-filter wide" style={{ width: '100%', minHeight: 86, padding: 10 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." /></div>}<footer><button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Hủy</button><button className="btn btn-primary" type="button" disabled={actionLoading} onClick={() => void runAction()}>{actionLoading ? 'Đang xử lý...' : 'Xác nhận'}</button></footer></section></div>}

      {importOpen && <div className="modal-backdrop wr-modal-backdrop" role="presentation"><section className="wr-detail-modal" role="dialog" aria-modal="true"><header className="wr-detail-header"><div><span className="wr-detail-eyebrow">Import Excel</span><h2>Import phiếu chuyển kho</h2></div><div className="wr-detail-actions"><button className="btn btn-light" type="button" onClick={() => void downloadTemplate()}><Download size={15} /> Tải file mẫu</button><button className="wr-icon-button" type="button" onClick={() => setImportOpen(false)}><X size={17} /></button></div></header><div style={{ padding: 16, display: 'grid', gap: 12 }}><label className="form-field"><span>File .xlsx/.xlsm/.csv</span><input type="file" accept=".xlsx,.xlsm,.csv" onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); }} /></label>{importFile && <div className="wr-notice"><Upload size={15} /> {importFile.name} · {(importFile.size / 1024).toFixed(1)} KB</div>}<label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={importSubmit} onChange={(e) => setImportSubmit(e.target.checked)} /> Gửi duyệt sau khi import</label><div><button className="btn btn-primary" type="button" disabled={importLoading || !importFile} onClick={() => void validateImport()}><Filter size={15} /> {importLoading ? 'Đang kiểm tra...' : 'Kiểm tra dữ liệu'}</button></div>{importPreview && <><div className="wr-detail-summary"><div><span>Phiếu hợp lệ</span><strong>{importPreview.summary.validTransferCount}</strong></div><div><span>Dòng hợp lệ</span><strong>{importPreview.summary.validItemCount}</strong></div><div><span>Dòng lỗi</span><strong>{importPreview.summary.errorRowCount}</strong></div><div><span>Tổng dòng</span><strong>{importPreview.summary.totalRowCount}</strong></div></div><div className="wr-table-wrap"><table className="wr-table"><thead><tr><th>Dòng</th><th>Mã nhóm</th><th>Kho nguồn</th><th>Kho đích</th><th>Sản phẩm</th><th>SL</th><th>Lỗi</th></tr></thead><tbody>{importPreview.rows.map((row) => <tr key={row.excelRow}><td>{row.excelRow}</td><td>{row.groupCode}</td><td>{row.sourceText}</td><td>{row.destinationText}</td><td>{row.productText}</td><td>{row.requestedQuantity}</td><td>{row.errors.length ? row.errors.map((e) => `${e.column}: ${e.message}`).join('; ') : <span className="wr-success">Hợp lệ</span>}</td></tr>)}</tbody></table></div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-light" type="button" onClick={() => setImportOpen(false)}>Hủy</button><button className="btn btn-primary" type="button" disabled={importLoading || importPreview.summary.validTransferCount === 0} onClick={() => void commitImport()}><Check size={15} /> Import các phiếu hợp lệ</button></div></>}</div></section></div>}
    </div>
  );
}

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, Eye, FileClock, Filter, Layers, MoreHorizontal, Plus, Printer, RefreshCw, Search, X, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';
import { Pagination } from '../../core/components/Pagination';
import { printWarehouseTransfer } from './transferPrint';
import './warehouseRecords.css';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';

type TabKey = 'all' | 'draft' | 'outgoing' | 'incoming';
type Option = { value: string; label: string; code?: string };
type UserCell = { name?: string; email?: string } | string;
type TransferRow = { _id: string; id?: string; code?: string; date?: string; createdAt?: string; sourceWarehouseId?: string; destinationWarehouseId?: string; sourceWarehouseName?: string; destinationWarehouseName?: string; spCount?: number; qty?: number; creator?: string; createdById?: UserCell; sourceConfirmedBy?: UserCell; sourceConfirmedAt?: string; dispatchConfirmedById?: UserCell; dispatchConfirmedAt?: string; status?: string; statusLabel?: string; statusTone?: string; note?: string; kind?: string; originTransferId?: string; returnTransferId?: string; lockedQuantity?: number; canEdit?: boolean; canCancel?: boolean; canConfirmSource?: boolean; canConfirmDestination?: boolean; canReturn?: boolean; canPrint?: boolean; sourceExportBillId?: string };

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
const defaultTransferFilters = () => ({ id: '', sourceWarehouseId: '', destinationWarehouseId: '', status: '', ...defaultDateRange() });

const tabs: Array<{ key: TabKey; label: string; icon: typeof Layers }> = [{ key: 'all', label: 'Tất cả', icon: Layers }, { key: 'draft', label: 'Đơn cần duyệt', icon: FileClock }, { key: 'outgoing', label: 'Đang chuyển đi', icon: ArrowUpRight }, { key: 'incoming', label: 'Sắp chuyển đến', icon: ArrowDownLeft }];
const emptyFilters = defaultTransferFilters();

function displayDate(value?: string) { if (!value) return '-'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN'); }
function displayDateTime(value?: string) { if (!value) return '-'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN'); }
function displayUser(value?: UserCell, fallback = '-') { if (!value) return fallback; if (typeof value === 'string') return value || fallback; return value.name || value.email || fallback; }
function rowCode(row: TransferRow) { return row.id || row.code || row._id; }
function direction(row: TransferRow) { return `${row.sourceWarehouseName || '-'} → ${row.destinationWarehouseName || '-'}`; }
function quantity(value?: number) { return Number(value || 0).toLocaleString('vi-VN'); }

export function WarehouseTransferPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [meta, setMeta] = useState<{ role: string; warehouses: Option[]; statuses: Option[]; userWarehouseIds?: string[]; isRootOwner?: boolean }>({ role: 'EMPLOYEE', warehouses: [], statuses: [], userWarehouseIds: [], isRootOwner: false });
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ row: TransferRow; action: 'confirm-source' | 'confirm-destination' | 'return' | 'delete'; title: string; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const totals = useMemo(() => rows.reduce((acc, row) => ({ sp: acc.sp + Number(row.spCount || 0), qty: acc.qty + Number(row.qty || 0) }), { sp: 0, qty: 0 }), [rows]);

  const loadMeta = async () => { const response = await http.get('/warehouse/transfers/meta'); setMeta(response.data); };
  const load = async (signal?: AbortSignal) => { setLoading(true); setError(''); try { const response = await http.get('/warehouse/transfers', { params: { tab: activeTab, page, limit: LIMIT, ...appliedFilters }, signal }); setRows(response.data.items || []); setTotal(Number(response.data.total || 0)); } catch (err: any) { if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Không tải được danh sách chuyển kho.'); } finally { if (!signal?.aborted) setLoading(false); } };
  useEffect(() => { void loadMeta().catch(() => setError('Không tải được thông tin kho/quyền.')); }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [activeTab, page, appliedFilters]);
  useEffect(() => { const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer); }, [notice]);

  const applyFilters = (event: FormEvent) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); };
  const resetFilters = () => { const nextFilters = defaultTransferFilters(); setPage(1); setFilters(nextFilters); setAppliedFilters(nextFilters); };
  const changeTab = (tab: TabKey) => { setActiveTab(tab); setPage(1); setOpenMenu(null); };
  const ask = (row: TransferRow, action: 'confirm-source' | 'confirm-destination' | 'return' | 'delete') => { setOpenMenu(null); if (action === 'confirm-source') setConfirm({ row, action, title: 'Xác nhận xuất hàng cho đơn này?', message: 'Hệ thống sẽ KHÓA số lượng tại kho nguồn cho đến khi bên nhận xác nhận hoặc trả hàng. Tồn kho chưa bị trừ ở bước này.' }); if (action === 'confirm-destination') setConfirm({ row, action, title: 'Xác nhận đã nhận đủ hàng?', message: row.kind === 'RETURN_OF_TRANSFER' ? 'Số lượng khóa ở đơn gốc sẽ được giải phóng. Tồn kho không bị cộng/trừ thêm.' : 'Tồn kho nguồn sẽ bị trừ, tồn kho đích được cộng và số lượng khóa được giải phóng.' }); if (action === 'return') setConfirm({ row, action, title: 'Báo trả hàng / Không nhận?', message: 'Hệ thống sẽ tự tạo đơn trả hàng về kho nguồn. Số lượng khóa tại kho nguồn vẫn được giữ cho đến khi đơn trả hoàn tất.' }); if (action === 'delete') setConfirm({ row, action, title: 'Xóa đơn chuyển này?', message: 'Đơn sẽ được chuyển sang trạng thái Đã hủy và không thể xác nhận xuất.' }); };
  const runAction = async () => { if (!confirm) return; setActionLoading(true); setError(''); try { if (confirm.action === 'delete') await http.delete(`/warehouse/transfers/${confirm.row._id}`); else if (confirm.action === 'return') { const reason = window.prompt('Nhập lý do trả hàng / không nhận:')?.trim(); if (!reason) { setActionLoading(false); return; } const response = await http.post(`/warehouse/transfers/${confirm.row._id}/return`, { reason }); if (response.data?.returnTransfer?._id) navigate(`/warehouse/transfers/${response.data.returnTransfer._id}`); } else await http.post(`/warehouse/transfers/${confirm.row._id}/${confirm.action}`); const next = confirm; setNotice(next.action === 'confirm-source' ? 'Đã xác nhận xuất, số lượng đã được khóa tại kho nguồn. Có thể in phiếu chuyển kho ngay.' : next.action === 'confirm-destination' ? 'Đã xác nhận nhận, tồn kho và khóa đã được cập nhật.' : next.action === 'return' ? 'Đã tạo đơn trả hàng tự động.' : 'Đã xóa mềm đơn chuyển kho.'); setConfirm(null); await load(); if (next.action === 'confirm-destination') navigate(`/warehouse/transfers/${next.row._id}`); } catch (err: any) { setError(err.response?.data?.message || 'Không thực hiện được thao tác.'); } finally { setActionLoading(false); } };
  const printRow = async (row: TransferRow) => { setOpenMenu(null); setError(''); try { await printWarehouseTransfer(row as any); } catch (err: any) { setError(err.message || 'Không in được đơn chuyển kho.'); } };

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã phiếu', key: 'code', getValue: (row: TransferRow) => rowCode(row) },
      { label: 'Ngày', key: 'date', getValue: (row: TransferRow) => displayDate(row.date || row.createdAt) },
      { label: 'Kho nguồn → Kho đích', key: 'direction', getValue: (row: TransferRow) => direction(row) },
      { label: 'Số SP', key: 'spCount', getValue: (row: TransferRow) => row.spCount || 0 },
      { label: 'Tổng SL', key: 'qty', getValue: (row: TransferRow) => row.qty || 0 },
      { label: 'Người tạo', key: 'creator', getValue: (row: TransferRow) => row.creator || displayUser(row.createdById) },
      { label: 'Trạng thái', key: 'status', getValue: (row: TransferRow) => row.statusLabel || row.status || '' },
      { label: 'Ghi chú', key: 'note', getValue: (row: TransferRow) => row.note || '' },
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
    setError('');
    try {
      let dataToExport: TransferRow[] = [];
      if (exportType === 'current') {
        dataToExport = rows;
      } else {
        const fetchPage = (nextPage: number, nextLimit: number) =>
          http.get('/warehouse/transfers', { params: { tab: activeTab, page: nextPage, limit: nextLimit, ...appliedFilters } });
        const pageSize = 200;
        const firstResponse = await fetchPage(1, pageSize);
        let allItems: TransferRow[] = [...(firstResponse.data.items || [])];
        const totalItems = Number(firstResponse.data.total || 0);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => fetchPage(index + 2, pageSize)),
          );
          responses.forEach((response) => { allItems = allItems.concat(response.data.items || []); });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setNotice('Không có dữ liệu để xuất.');
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
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };
  return <div className="workspace-page warehouse-records compact-page" ref={rootRef}><section className="wr-card"><div className="wr-transfer-tabbar" role="tablist" aria-label="Chuyển kho">{tabs.map((tab) => { const Icon = tab.icon; const isActive = activeTab === tab.key; return <button key={tab.key} type="button" role="tab" aria-selected={isActive} className={`wr-transfer-tab ${isActive ? 'is-active' : ''}`} onClick={() => changeTab(tab.key)}><Icon size={17} /><span>{tab.label}</span></button>; })}</div><form className="wr-filters" onSubmit={applyFilters}><label className="wr-search-field"><Search size={14} /><input value={filters.id} onChange={(e) => setFilters({ ...filters, id: e.target.value })} placeholder="ID / mã phiếu" /></label><select className="wr-filter" value={filters.sourceWarehouseId} onChange={(e) => setFilters({ ...filters, sourceWarehouseId: e.target.value })}><option value="">Kho nguồn</option>{meta.warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select><select className="wr-filter" value={filters.destinationWarehouseId} onChange={(e) => setFilters({ ...filters, destinationWarehouseId: e.target.value })}><option value="">Kho đích</option>{meta.warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select>{activeTab === 'all' && <select className="wr-filter wide" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Trạng thái</option>{meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}<label className="wr-date-field"><span>Từ</span><input type="date" value={filters.fromDate} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} /></label><label className="wr-date-field"><span>Đến</span><input type="date" value={filters.toDate} onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} /></label><button className="btn btn-primary wr-filter-button" type="submit"><Filter size={15} /> Lọc</button><button className="btn btn-light wr-reset-button" type="button" onClick={resetFilters}>Đặt lại</button></form><div className="wr-actions"><button className="btn wr-create-button" type="button" onClick={() => navigate('/warehouse/transfers/create')}><Plus size={15} /> Tạo đơn chuyển kho</button><button className="btn btn-light" type="button" onClick={() => navigate(`/products/storage-duration${filters.sourceWarehouseId ? `?branchId=${filters.sourceWarehouseId}` : ''}`)}>Hàng bán chậm tại chi nhánh này</button><button className="btn btn-light" type="button" onClick={() => setShowExportModal(true)}><FileDown size={15} /> Xuất dữ liệu</button><div className="wr-action-right"><span className="wr-count">{total ? `${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} / ${total}` : '0 bản ghi'} · Số SP {totals.sp} · Tổng SL {totals.qty}</span><button className="wr-icon-button" type="button" onClick={resetFilters} title="Làm mới"><RefreshCw size={15} /></button></div></div>{notice && <div className="wr-notice"><Check size={16} /> {notice}</div>}{error && <div className="wr-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button type="button" onClick={() => setError('')}>Đóng</button></div>}<div className="wr-table-wrap"><table className="wr-table"><thead><tr><th>ID / Ngày</th><th>Kho nguồn → Kho đích</th><th className="right">Số SP</th><th className="right">Tổng SL</th><th>Người tạo</th>{activeTab === 'draft' && <th>Xác nhận</th>}{activeTab === 'outgoing' && <th>Đã xác nhận xuất</th>}{activeTab === 'incoming' && <th>Xác nhận</th>}<th>Trạng thái</th><th className="wr-action-cell"><MoreHorizontal size={14} /></th></tr></thead><tbody>{loading && Array.from({ length: 6 }).map((_, i) => <tr className="wr-skeleton" key={i}><td colSpan={8}><span /></td></tr>)}{!loading && rows.length === 0 && <tr><td className="wr-empty" colSpan={8}>Chưa có dữ liệu phù hợp.</td></tr>}{!loading && rows.map((row) => <tr key={row._id}><td className="wr-identity-cell"><button type="button" className="wr-link" onClick={() => navigate(`/warehouse/transfers/${row._id}`)}>{rowCode(row)}</button><span>{displayDate(row.date || row.createdAt)}</span></td><td>{direction(row)}</td><td className="right">{quantity(row.spCount)}</td><td className="right">{quantity(row.qty)}</td><td>{row.creator || displayUser(row.createdById)}</td>{activeTab === 'draft' && <td>{row.canConfirmSource ? <button className="btn btn-primary" type="button" onClick={() => ask(row, 'confirm-source')}>Xác nhận xuất</button> : '—'}</td>}{activeTab === 'outgoing' && <td>{displayUser(row.sourceConfirmedBy || row.dispatchConfirmedById)}<span className="wr-sub">{displayDateTime(row.sourceConfirmedAt || row.dispatchConfirmedAt)}</span></td>}{activeTab === 'incoming' && <td>{row.canConfirmDestination ? <button className="btn btn-primary" type="button" onClick={() => ask(row, 'confirm-destination')}>Xác nhận nhận hàng</button> : '—'}</td>}<td><span className={`wr-direction ${row.statusTone || 'adjustment'}`}>{row.statusLabel || row.status}</span></td><td className="wr-action-cell"><div className="wr-menu"><button className="wr-row-menu-button" type="button" onClick={() => setOpenMenu(openMenu === row._id ? null : row._id)}><MoreHorizontal size={17} /></button>{openMenu === row._id && <div className="wr-menu-panel wr-row-menu"><button type="button" onClick={() => navigate(`/warehouse/transfers/${row._id}`)}><Eye size={15} /> Xem chi tiết</button>{row.canEdit && <button type="button" onClick={() => navigate(`/warehouse/transfers/${row._id}/edit`)}>Sửa đơn chuyển</button>}{row.canReturn && row.kind === 'NORMAL_TRANSFER' && <button className="danger" type="button" onClick={() => ask(row, 'return')}>Báo trả hàng / Hoàn chuyển</button>}{row.status === 'DRAFT' && row.canCancel && <button className="danger" type="button" onClick={() => ask(row, 'delete')}>Xóa đơn chuyển</button>}{row.canPrint && <button type="button" onClick={() => void printRow(row)}><Printer size={15} /> In đơn chuyển kho</button>}</div>}</div></td></tr>)}</tbody></table></div><Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} /></section>{confirm && <div className="modal-backdrop wr-modal-backdrop" role="presentation"><section className="wr-confirm-modal" role="dialog" aria-modal="true"><header><h2>{confirm.title}</h2><button className="wr-icon-button" type="button" onClick={() => setConfirm(null)}><X size={16} /></button></header><p>Bạn đang thao tác đơn <strong>{rowCode(confirm.row)}</strong>. {confirm.message}</p><footer><button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Hủy</button><button className="btn btn-primary" type="button" disabled={actionLoading} onClick={() => void runAction()}>{actionLoading ? 'Đang xử lý...' : 'Xác nhận'}</button></footer></section></div>}{showExportModal ? (<ExportExcelModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} title="Xuất Excel - Đơn chuyển kho" defaultFilename={`don-chuyen-kho-${new Date().toISOString().slice(0, 10)}`} columns={exportColumns} onExport={handleExcelExport} loading={exportLoading} />) : null}</div>;
}

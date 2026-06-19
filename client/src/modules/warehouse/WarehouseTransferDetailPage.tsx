import { useEffect, useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import './warehouseRecords.css';

function fmtDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function userName(value: any) {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  return value.name || value.email || '-';
}

function qty(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function WarehouseTransferDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ action: string; label: string; needsReason?: boolean; danger?: boolean } | null>(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const response = await http.get(`/warehouse/transfers/${id}`);
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được chi tiết phiếu chuyển kho.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [id]);

  const actions = () => {
    if (!data) return [];
    return data.availableActions || [];
  };

  const runAction = async () => {
    if (!confirm || !data) return;
    if (confirm.needsReason && !reason.trim()) { setError('Vui lòng nhập lý do.'); return; }
    try {
      await http.post(`/warehouse/transfers/${data._id}/actions/${confirm.action}`, { reason });
      setConfirm(null); setReason(''); await load();
    } catch (err: any) { setError(err.response?.data?.message || 'Không thực hiện được thao tác.'); }
  };

  if (loading) return <div className="workspace-page">Đang tải...</div>;
  if (error && !data) return <div className="workspace-page"><div className="wr-error">{error}</div><button className="btn btn-light" onClick={() => navigate('/warehouse/transfers')}>Quay lại</button></div>;
  if (!data) return <div className="workspace-page">Không tìm thấy phiếu.</div>;

  return (
    <div className="workspace-page warehouse-records">
      <section className="wr-card">
        <header className="wr-detail-header">
          <div><span className="wr-detail-eyebrow">{data.statusLabel || data.status}</span><h2>Chi tiết phiếu chuyển kho {data.id || data.code}</h2></div>
          <div className="wr-detail-actions"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}><ArrowLeft size={15} /> Quay lại</button>{actions().map((item: any) => <button key={item.action} className={`btn ${item.danger ? 'btn-light' : 'btn-primary'}`} type="button" onClick={() => setConfirm(item)}>{item.label}</button>)}</div>
        </header>
        {error && <div className="wr-error"><span>{error}</span><button type="button" onClick={() => setError('')}>Đóng</button></div>}
        <div className="wr-detail-summary">
          <div><span>Mã phiếu</span><strong>{data.id || data.code}</strong></div>
          <div><span>Kho nguồn</span><strong>{data.sourceWarehouseName}</strong></div>
          <div><span>Kho đích</span><strong>{data.destinationWarehouseName}</strong></div>
          <div><span>Tổng số lượng</span><strong>{qty(data.qty)}</strong></div>
          <div><span>Người tạo</span><strong>{data.creator || userName(data.createdById)}</strong></div>
          <div><span>Người duyệt yêu cầu</span><strong>{userName(data.requestApprovedById)} · {fmtDate(data.requestApprovedAt)}</strong></div>
          <div><span>Người xác nhận xuất</span><strong>{userName(data.dispatchConfirmedById)} · {fmtDate(data.dispatchConfirmedAt)}</strong></div>
          <div><span>Người duyệt xuất</span><strong>{userName(data.dispatchApprovedById)} · {fmtDate(data.dispatchApprovedAt)}</strong></div>
          <div><span>Người xác nhận nhận</span><strong>{userName(data.receiptConfirmedById)} · {fmtDate(data.receiptConfirmedAt)}</strong></div>
          <div><span>Người duyệt nhận</span><strong>{userName(data.receiptApprovedById)} · {fmtDate(data.receiptApprovedAt)}</strong></div>
          <div><span>Người hủy/từ chối/hoàn</span><strong>{userName(data.cancelledById || data.rejectedById || data.returnedById)}</strong></div>
          <div><span>Chứng từ liên kết</span><strong>{[data.sourceExportBillId, data.destinationImportBillId, data.returnBillId].filter(Boolean).length} chứng từ</strong></div>
          <div className="wide"><span>Ghi chú</span><strong>{data.note || '-'}</strong></div>
          <div className="wide"><span>Lý do</span><strong>{data.rejectionReason || data.cancelReason || data.returnReason || '-'}</strong></div>
        </div>
        <div className="wr-detail-table-wrap"><table className="wr-table wr-detail-table"><thead><tr><th>#</th><th>Sản phẩm</th><th>Mã</th><th>SL yêu cầu</th><th>SL được duyệt</th><th>SL đã xuất</th><th>SL đã nhận</th><th>Ghi chú</th></tr></thead><tbody>{(data.lines || []).map((line: any, index: number) => <tr key={line._id || index}><td className="center">{index + 1}</td><td className="wr-product"><strong>{line.productName}</strong><small>{line.barcode || ''}</small></td><td>{line.productCode || '-'}</td><td className="right">{qty(line.requestedQuantity)}</td><td className="right">{qty(line.approvedQuantity)}</td><td className="right">{qty(line.dispatchedQuantity)}</td><td className="right">{qty(line.receivedQuantity)}</td><td>{line.note || '-'}</td></tr>)}</tbody></table></div>
        <div className="wr-detail-table-wrap"><h3>Audit log</h3><table className="wr-table"><thead><tr><th>Thời gian</th><th>Action</th><th>Trước</th><th>Sau</th><th>Actor</th><th>Lý do</th></tr></thead><tbody>{(data.audits || []).map((log: any) => <tr key={log._id}><td>{fmtDate(log.createdAt)}</td><td>{log.actionType}</td><td>{log.previousStatus || '-'}</td><td>{log.nextStatus || '-'}</td><td>{userName(log.actorId)}</td><td>{log.reason || '-'}</td></tr>)}{!(data.audits || []).length && <tr><td className="wr-empty" colSpan={6}>Chưa có audit log.</td></tr>}</tbody></table></div>
      </section>

      {confirm && <div className="modal-backdrop wr-modal-backdrop"><section className="wr-confirm-modal"><header><h2>{confirm.label}</h2><button className="wr-icon-button" type="button" onClick={() => setConfirm(null)}><X size={16} /></button></header><p>Xác nhận thao tác với phiếu {data.id || data.code}?</p>{confirm.needsReason && <div style={{ padding: '0 16px 16px' }}><textarea className="wr-filter wide" style={{ width: '100%', minHeight: 90, padding: 10 }} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nhập lý do..." /></div>}<footer><button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Hủy</button><button className="btn btn-primary" type="button" onClick={() => void runAction()}><Check size={15} /> Xác nhận</button></footer></section></div>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, FileSpreadsheet, LoaderCircle, AlertCircle } from 'lucide-react';
import { http } from '../../core/api/http';
import { buildRefundReceiptHtml, writeAndPrintPopup, receiptMoney } from './invoicePrint';
import './refund-detail.css';

const PRINT_WINDOW_FEATURES = 'popup=yes,width=420,height=720';

type RefundDetail = Record<string, any>;

function safeDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusMeta(status: unknown) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return { label: 'Hoàn tất', tone: 'success' };
  if (value === 'cancelled') return { label: 'Đã hủy', tone: 'danger' };
  if (value === 'draft') return { label: 'Nháp', tone: 'warning' };
  return { label: status ? String(status) : '—', tone: 'neutral' };
}

function originalCode(refund: RefundDetail) {
  const payment = refund?.paymentId;
  return (payment && typeof payment === 'object' ? payment.code : payment) || '—';
}

function customerText(refund: RefundDetail) {
  const customer = refund?.paymentId?.customerId;
  if (customer && typeof customer === 'object') {
    const name = customer.name || '';
    const phone = customer.phone || '';
    return [name, phone ? `(${phone})` : ''].filter(Boolean).join(' ') || '—';
  }
  return '—';
}

function branchName(refund: RefundDetail) {
  const b = refund?.branchId || refund?.warehouseId || refund?.paymentId?.branchId;
  if (b && typeof b === 'object') return b.name || '';
  return (typeof b === 'string' ? b : '') || '—';
}

export function RefundInvoiceDetailPage() {
  const { channel = 'store', id = '' } = useParams<{ channel: string; id: string }>();
  const navigate = useNavigate();
  const [refund, setRefund] = useState<RefundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    http
      .get(`/products/refunds/${id}`, { signal: controller.signal })
      .then((res) => setRefund(res.data))
      .catch((err: any) => {
        if (err.code === 'ERR_CANCELED') return;
        setError(err.response?.data?.message ?? 'Không tả được chi tiết đơn trả hàng.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  const handlePrint = () => {
    if (!refund) return;
    const popup = window.open('about:blank', 'refund-invoice-print', PRINT_WINDOW_FEATURES);
    if (!popup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn. Hãy cho phép pop-up và thử lại.');
      return;
    }
    writeAndPrintPopup(popup, buildRefundReceiptHtml(refund));
  };

  const items = Array.isArray(refund?.items) ? refund.items : [];
  const status = statusMeta(refund?.status);
  const totalQuantity = items.reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0);

  return (
    <div className="page-stack refund-detail">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><FileSpreadsheet size={24} /></div>
          <div>
            <h1>Chi tiết đơn trả hàng</h1>
            <p>{refund?.code || '—'}</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={() => navigate(`/sales-channels/${channel}/refund`)}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <button className="btn btn-primary" type="button" disabled={!refund || loading} onClick={handlePrint}>
            <Printer size={16} /> In
          </button>
        </div>
      </div>

      {loading && (
        <div className="refund-detail-state"><LoaderCircle size={18} className="spin" /> Đang tải...</div>
      )}
      {error && (
        <div className="refund-detail-error"><AlertCircle size={16} /> {error}</div>
      )}

      {refund && !loading && (
        <>
          <section className="refund-detail-card">
            <h3>Thông tin chung</h3>
            <div className="refund-detail-grid">
              <span><small>Mã trả hàng</small><strong>{refund.code || '—'}</strong></span>
              <span><small>Hóa đơn gốc</small><strong>{originalCode(refund)}</strong></span>
              <span><small>Khách hàng</small><strong>{customerText(refund)}</strong></span>
              <span><small>Kho thực hiện</small><strong>{branchName(refund)}</strong></span>
              <span><small>Ngày tạo</small><strong>{safeDate(refund.createdAt)}</strong></span>
              <span><small>Ngày hoàn tất</small><strong>{safeDate(refund.completedAt)}</strong></span>
              <span><small>Trạng thái</small><strong className={`status-badge ${status.tone}`}>{status.label}</strong></span>
              <span><small>Lý do / ghi chú</small><strong>{refund.note || '—'}</strong></span>
            </div>
          </section>

          <section className="refund-detail-card">
            <h3>Sản phẩm trả</h3>
            <div className="refund-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tên sản phẩm</th>
                    <th>Số lượng</th>
                    <th>Đơn giá</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={5} className="refund-detail-empty">Không có sản phẩm trả.</td></tr>
                  ) : (
                    items.map((item: any, index: number) => (
                      <tr key={index}>
                        <td>{item?.productId?.code || '—'}</td>
                        <td>{item?.productId?.name || '—'}</td>
                        <td>{Number(item?.amount) || 0}</td>
                        <td>{receiptMoney(item?.price)}</td>
                        <td>{receiptMoney(item?.value)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="refund-detail-card">
            <h3>Tổng hợp</h3>
            <dl className="refund-detail-summary">
              <div><dt>Tổng số lượng trả</dt><dd>{totalQuantity}</dd></div>
              <div><dt>Giá trị trả</dt><dd>{receiptMoney(refund.value)}</dd></div>
              <div><dt>Thu khách / bù trừ đổi hàng</dt><dd>{receiptMoney(refund.settlementValue)}</dd></div>
              <div className="grand"><dt>Tiền trả khách</dt><dd>{receiptMoney(refund.totalPayableAmount)}</dd></div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}


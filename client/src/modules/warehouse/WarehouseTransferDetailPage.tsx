import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { http } from '../../core/api/http';

export function WarehouseTransferDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    http.get(`/warehouse/transfers/${id}`)
      .then((res) => {
        setData(res);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-container p-4">Đang tải...</div>;
  if (!data) return <div className="page-container p-4">Không tìm thấy phiếu chuyển kho</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="btn btn-outline" onClick={() => navigate('/warehouse/transfers')} style={{ marginRight: '1rem', padding: '0.25rem 0.5rem' }}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <div className="header-content">
          <h1 className="page-title">Chi tiết phiếu chuyển kho #{data.id}</h1>
          <p className="page-subtitle">Xem thông tin chi tiết</p>
        </div>
      </div>

      <div className="page-content p-4">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <p><strong>Ngày:</strong> {data.date}</p>
            <p><strong>Từ kho:</strong> {data.fromWarehouse}</p>
            <p><strong>Đến kho:</strong> {data.toWarehouse}</p>
            <p><strong>Loại:</strong> {data.type}</p>
          </div>
          <div>
            <p><strong>Tổng SL:</strong> {data.qty}</p>
            <p><strong>Số mặt hàng:</strong> {data.spCount}</p>
            <p><strong>Ghi chú:</strong> {data.note}</p>
            <p><strong>Người tạo:</strong> {data.creator}</p>
          </div>
        </div>

        <h3>Chi tiết sản phẩm</h3>
        <div className="table-container mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã SP / ID</th>
                <th>Số lượng</th>
                <th>ĐVT</th>
                <th>Số lô</th>
                <th>IMEI</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {data.lines?.length > 0 ? data.lines.map((line: any, i: number) => (
                <tr key={i}>
                  <td>{line.productId}</td>
                  <td>{line.quantity}</td>
                  <td>{line.unit || '-'}</td>
                  <td>{line.batchCode || '-'}</td>
                  <td>{line.imei || '-'}</td>
                  <td>{line.note || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center' }}>Không có chi tiết sản phẩm</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

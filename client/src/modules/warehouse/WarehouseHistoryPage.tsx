import { History } from 'lucide-react';

export function WarehouseHistoryPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><History size={22} /></div>
          <div>
            <h1>Lịch sử sửa xóa</h1>
            <p>Xem nhật ký các thao tác chỉnh sửa và xóa trong kho</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <History size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng xem lịch sử sửa xóa sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

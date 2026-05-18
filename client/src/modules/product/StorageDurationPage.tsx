import { Clock } from 'lucide-react';

export function StorageDurationPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Clock size={22} /></div>
          <div>
            <h1>Thời gian lưu kho</h1>
            <p>Theo dõi thời gian lưu trữ hàng hóa trong kho</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <Clock size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng theo dõi thời gian lưu kho sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

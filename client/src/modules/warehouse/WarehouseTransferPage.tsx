import { Shuffle } from 'lucide-react';

export function WarehouseTransferPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Shuffle size={22} /></div>
          <div>
            <h1>Chuyển kho</h1>
            <p>Điều chuyển hàng hóa giữa các kho</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <Shuffle size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng chuyển kho sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

import { Layers } from 'lucide-react';

export function BatchPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Layers size={22} /></div>
          <div>
            <h1>Lô sản phẩm</h1>
            <p>Quản lý các lô hàng nhập vào theo từng đợt</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <Layers size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng quản lý lô sản phẩm sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

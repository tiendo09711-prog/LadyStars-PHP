import { FileEdit } from 'lucide-react';

export function WarehouseDraftPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><FileEdit size={22} /></div>
          <div>
            <h1>Phiếu nháp</h1>
            <p>Quản lý các phiếu kho chưa hoàn tất</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <FileEdit size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng quản lý phiếu nháp sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

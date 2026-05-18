import { ArrowLeftRight } from 'lucide-react';

export function WarehouseTransactionPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><ArrowLeftRight size={22} /></div>
          <div>
            <h1>Xuất nhập kho</h1>
            <p>Quản lý phiếu nhập hàng và xuất hàng khỏi kho</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <ArrowLeftRight size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng quản lý xuất nhập kho sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

import { Tag } from 'lucide-react';

export function AttributesPage() {
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Tag size={22} /></div>
          <div>
            <h1>Thuộc tính</h1>
            <p>Quản lý các thuộc tính sản phẩm (màu sắc, kích cỡ, chất liệu...)</p>
          </div>
        </div>
      </div>
      <div className="data-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <Tag size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} />
        <h2 style={{ color: 'var(--muted)', fontWeight: 700, margin: '0 0 8px' }}>Trang đang được xây dựng</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Chức năng quản lý thuộc tính sản phẩm sẽ sớm được hoàn thiện.</p>
      </div>
    </div>
  );
}

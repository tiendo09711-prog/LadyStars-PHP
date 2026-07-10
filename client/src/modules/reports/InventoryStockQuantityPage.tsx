export function InventoryStockQuantityPage() {
  return (
    <div className="compact-page report-placeholder-page">
      <section className="compact-toolbar-card">
        <div className="compact-header">
          <span className="compact-badge">REPORT</span>
          <h1 className="compact-title">Số lượng hàng tồn kho</h1>
          <p className="compact-desc">Trang đang trống, chờ xây dựng.</p>
        </div>
      </section>
      <section className="compact-table-card" style={{ padding: '14px 16px' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
          Nội dung báo cáo sẽ được bổ sung sau. Giao diện đã đồng bộ compact inventory.
        </p>
        <a className="btn btn-primary" href="/products/storage-duration">Xem hàng tồn lâu & bán chậm</a>
      </section>
    </div>
  );
}

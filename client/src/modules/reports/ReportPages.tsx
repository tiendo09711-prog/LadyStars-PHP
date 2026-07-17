type ReportPlaceholderPageProps = {
  title: string;
};

function ReportPlaceholderPage({ title }: ReportPlaceholderPageProps) {
  return (
    <main className="compact-page report-placeholder-page">
      <section className="compact-table-card" aria-labelledby="report-page-title">
        <div className="compact-table-card-head">
          <div>
            <h1 id="report-page-title">{title}</h1>
            <p>Nội dung báo cáo sẽ được xây dựng sau.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export { RevenueByTimePage } from './revenue-time/RevenueByTimePage';
export { RevenueByStorePage } from './revenue-store/RevenueByStorePage';
export { RevenueByProductsPage } from './revenue-products/RevenueByProductsPage';
export { InventoryInOutStockPage as InventoryInOutStockReportPage } from './inventory/InventoryInOutStockPage';
export const ProductPerformanceReportPage = () => <ReportPlaceholderPage title="Hiệu suất sản phẩm" />;

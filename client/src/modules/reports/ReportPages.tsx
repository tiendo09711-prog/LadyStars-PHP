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
export { RevenueByStaffPage } from './revenue-staff/RevenueByStaffPage';
export { RevenueByProductsPage } from './revenue-products/RevenueByProductsPage';
export const RevenueByCustomersPage = () => <ReportPlaceholderPage title="Doanh thu theo khách hàng" />;
export const SalesOverviewReportPage = () => <ReportPlaceholderPage title="Tổng quan bán hàng" />;
export const SalesShiftClosingReportPage = () => <ReportPlaceholderPage title="Kết ca bán hàng" />;
export const InventoryInOutStockReportPage = () => <ReportPlaceholderPage title="Xuất nhập tồn" />;
export const InventoryPendingTransfersReportPage = () => <ReportPlaceholderPage title="Chuyển kho chưa xác nhận" />;
export const ProductPerformanceReportPage = () => <ReportPlaceholderPage title="Hiệu suất sản phẩm" />;
export const CustomersOverviewReportPage = () => <ReportPlaceholderPage title="Tổng quan khách hàng" />;
export const CustomersPurchaseBehaviorReportPage = () => <ReportPlaceholderPage title="Hành vi mua của khách hàng" />;
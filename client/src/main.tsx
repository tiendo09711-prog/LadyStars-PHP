import React from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './core/layout/AppLayout';
import { LoginPage } from './modules/auth/LoginPage';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { ProductsPage } from './modules/product/ProductsPage';
import { BatchPage } from './modules/product/BatchPage';
import { StorageDurationPage } from './modules/product/StorageDurationPage';
import { InventoryPage } from './modules/product/InventoryPage';
import { CategoriesPage } from './modules/product/CategoriesPage';
import { SalesPage } from './modules/product/SalesPage';
import { CustomerPage } from './modules/customer/CustomerPage';
import { CustomerListPage } from './modules/customer/CustomerListPage';
import { CustomerCarePage } from './modules/customer/CustomerCarePage';
import { CustomerLevelPage } from './modules/customer/CustomerLevelPage';
import { CustomerGroupPage } from './modules/customer/CustomerGroupPage';
import { CustomerCareTypePage } from './modules/customer/CustomerCareTypePage';
import { CustomerCareReasonPage } from './modules/customer/CustomerCareReasonPage';
import { AccountingPage } from './modules/accounting/AccountingPage';
import { CashReceiptsPage } from './modules/accounting/CashReceiptsPage';
import { CashReceiptCreatePage } from './modules/accounting/CashReceiptCreatePage';
import { BankReceiptsPage } from './modules/accounting/BankReceiptsPage';
import { BankReceiptCreatePage } from './modules/accounting/BankReceiptCreatePage';
import { ReceiptsSummaryPage } from './modules/accounting/ReceiptsSummaryPage';
import { CustomerDebtPage } from './modules/accounting/CustomerDebtPage';
import { StaffDebtPage } from './modules/accounting/StaffDebtPage';
import { VendorDebtPage } from './modules/accounting/VendorDebtPage';
import { InitialDebtPage } from './modules/accounting/InitialDebtPage';
import { JournalEntriesPage } from './modules/accounting/JournalEntriesPage';
import { JournalPage } from './modules/accounting/JournalPage';
import { InstallmentCollectionPage } from './modules/accounting/InstallmentCollectionPage';
import { AccountingHistoryPage } from './modules/accounting/AccountingHistoryPage';
import { AccountingAccountsPage } from './modules/accounting/AccountingAccountsPage';
import { InstallmentServicesPage } from './modules/accounting/InstallmentServicesPage';
import { TaskPage } from './modules/task/TaskPage';
import { PrintFormsPage } from './modules/printForms/PrintFormsPage';
import { StaffPage } from './modules/staff/StaffPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { WarehouseTransactionPage } from './modules/warehouse/WarehouseTransactionPage';
import { WarehouseTransferPage } from './modules/warehouse/WarehouseTransferPage';
import { WarehouseTransferCreatePage } from './modules/warehouse/WarehouseTransferCreatePage';
import { WarehouseTransferDetailPage } from './modules/warehouse/WarehouseTransferDetailPage';
import { WarehouseAuditPage } from './modules/warehouse/WarehouseAuditPage';
import { WarehouseAuditCreatePage } from './modules/warehouse/WarehouseAuditCreatePage';
import { WarehouseDraftPage } from './modules/warehouse/WarehouseDraftPage';
import { WarehouseHistoryPage } from './modules/warehouse/WarehouseHistoryPage';
import { VoucherImportPage } from './modules/warehouse/VoucherImportPage';
import { VoucherExportPage } from './modules/warehouse/VoucherExportPage';
import { VoucherExcelImportPage } from './modules/warehouse/VoucherExcelImportPage';
import { RevenueByTimePage } from './modules/reports/RevenueByTimePage';
import { RevenueByStorePage } from './modules/reports/RevenueByStorePage';
import { RevenueByBrandPage } from './modules/reports/RevenueByBrandPage';
import { RevenueByStaffPage } from './modules/reports/RevenueByStaffPage';
import { RevenueByDepartmentPage } from './modules/reports/RevenueByDepartmentPage';
import { RevenueByCategoryPage } from './modules/reports/RevenueByCategoryPage';
import { RevenueByInternalCategoryPage } from './modules/reports/RevenueByInternalCategoryPage';
import { RevenueByProductPage } from './modules/reports/RevenueByProductPage';
import { RevenueByVendorPage } from './modules/reports/RevenueByVendorPage';
import { RevenueByCustomerPage } from './modules/reports/RevenueByCustomerPage';
import { RevenueInventoryRatioPage } from './modules/reports/RevenueInventoryRatioPage';
import { OrdersByChannelPage } from './modules/reports/OrdersByChannelPage';
import { OrdersCreatedPage } from './modules/reports/OrdersCreatedPage';
import { OrdersSuccessPage } from './modules/reports/OrdersSuccessPage';
import { OrdersByValuePage } from './modules/reports/OrdersByValuePage';
import { OrdersByCategoryPage } from './modules/reports/OrdersByCategoryPage';
import { OrdersByProductPage } from './modules/reports/OrdersByProductPage';
import { OrdersByStatusPage } from './modules/reports/OrdersByStatusPage';
import { OrdersByAddressPage } from './modules/reports/OrdersByAddressPage';
import { OrdersByReasonPage } from './modules/reports/OrdersByReasonPage';
import { OrdersByStaffPage } from './modules/reports/OrdersByStaffPage';
import { OrdersByAdsPage } from './modules/reports/OrdersByAdsPage';
import { OrdersCodReconciliationPage } from './modules/reports/OrdersCodReconciliationPage';
import { OrdersByCarrierPage } from './modules/reports/OrdersByCarrierPage';
import { RetailOverviewPage } from './modules/reports/RetailOverviewPage';
import { RetailByCustomerSourcePage } from './modules/reports/RetailByCustomerSourcePage';
import { RetailByStaffPage } from './modules/reports/RetailByStaffPage';
import { RetailByStorePage } from './modules/reports/RetailByStorePage';
import { RetailCardSwipeDetailsPage } from './modules/reports/RetailCardSwipeDetailsPage';
import { RetailByInvoiceValuePage } from './modules/reports/RetailByInvoiceValuePage';
import { RetailInvoiceVisitorRatioPage } from './modules/reports/RetailInvoiceVisitorRatioPage';
import { RetailShiftEndPage } from './modules/reports/RetailShiftEndPage';
import { WholesaleOverviewPage } from './modules/reports/WholesaleOverviewPage';
import { WholesaleByStaffPage } from './modules/reports/WholesaleByStaffPage';
import { InventoryInOutByProductPage } from './modules/reports/InventoryInOutByProductPage';
import { InventoryInOutDetailsPage } from './modules/reports/InventoryInOutDetailsPage';
import { InventoryInOutTotalPage } from './modules/reports/InventoryInOutTotalPage';
import { InventoryInOutByStorePage } from './modules/reports/InventoryInOutByStorePage';
import { InventoryByVendorPage } from './modules/reports/InventoryByVendorPage';
import { InventoryProductCategoryPage } from './modules/reports/InventoryProductCategoryPage';
import { InventoryStockQuantityPage } from './modules/reports/InventoryStockQuantityPage';
import { InventoryUnconfirmedTransfersPage } from './modules/reports/InventoryUnconfirmedTransfersPage';
import { InventoryByStoreStatusPage } from './modules/reports/InventoryByStoreStatusPage';
import { InventoryByProductStatusPage } from './modules/reports/InventoryByProductStatusPage';
import { InventoryByBatchPage } from './modules/reports/InventoryByBatchPage';
import { InventoryTransfersByProductPage } from './modules/reports/InventoryTransfersByProductPage';
import { SalesChannelPage } from './modules/sales/SalesChannelPage';
import { SalesChannelSubPage } from './modules/sales/SalesChannelSubPage';
import { RetailInvoiceCreatePage } from './modules/sales/RetailInvoiceCreatePage';
import { WholesaleInvoiceCreatePage } from './modules/sales/WholesaleInvoiceCreatePage';
import { RefundInvoiceCreatePage } from './modules/sales/RefundInvoiceCreatePage';
import { OrdersManagePage } from './modules/orders/OrdersManagePage';
import { OrdersPackagingPage } from './modules/orders/OrdersPackagingPage';
import { OrdersHandoverPage } from './modules/orders/OrdersHandoverPage';
import { OrdersShippingPendingPage } from './modules/orders/OrdersShippingPendingPage';
import { OrdersDisputesPage } from './modules/orders/OrdersDisputesPage';
import { OrdersCodControlPage } from './modules/orders/OrdersCodControlPage';
import { OrdersSourcesPage } from './modules/orders/OrdersSourcesPage';
import { OrdersHistoryPage } from './modules/orders/OrdersHistoryPage';
import './styles/app.css';
import './styles/phase-rescue.css';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },

      // ── Sản phẩm ───────────────────────────────────────────────
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/batches', element: <BatchPage /> },
      { path: 'products/storage-duration', element: <StorageDurationPage /> },
      { path: 'products/inventory', element: <InventoryPage /> },
      { path: 'products/categories', element: <CategoriesPage /> },

      // ── Kho hàng ───────────────────────────────────────────────
      { path: 'warehouse/transactions', element: <WarehouseTransactionPage /> },
      { path: 'warehouse/transactions/vouchers/import', element: <VoucherImportPage /> },
      { path: 'warehouse/transactions/vouchers/export', element: <VoucherExportPage /> },
      { path: 'warehouse/transactions/vouchers/excel', element: <VoucherExcelImportPage /> },
      { path: 'warehouse/transactions/products/import', element: <Navigate to="/warehouse/transactions/vouchers/import" replace /> },
      { path: 'warehouse/transactions/products/export', element: <Navigate to="/warehouse/transactions/vouchers/export" replace /> },
      { path: 'warehouse/transfers', element: <WarehouseTransferPage /> },
      { path: 'warehouse/transfers/create', element: <WarehouseTransferCreatePage /> },
      { path: 'warehouse/transfers/:id', element: <WarehouseTransferDetailPage /> },
      { path: 'warehouse/audit', element: <WarehouseAuditPage /> },
      { path: 'warehouse/audit/create', element: <WarehouseAuditCreatePage /> },
      { path: 'warehouse/drafts', element: <WarehouseDraftPage /> },
      { path: 'warehouse/history', element: <WarehouseHistoryPage /> },

      // ── Bán hàng & Đối tác ─────────────────────────────────────
      { path: 'sales', element: <SalesPage /> },
      { path: 'customers', element: <CustomerPage /> },
      { path: 'customers/list', element: <CustomerListPage /> },
      { path: 'customers/care', element: <CustomerCarePage /> },
      { path: 'vendors', element: <Navigate to="/products" replace /> },

      // ── Kênh bán ───────────────────────────────────────────────
      { path: 'sales-channels/:channel', element: <SalesChannelPage /> },
      { path: 'sales-channels/:channel/retail/confirm', element: <Navigate to=".." relative="path" replace /> },
      { path: 'sales-channels/:channel/retail/payment-confirmation', element: <Navigate to=".." relative="path" replace /> },
      { path: 'sales-channels/:channel/retail/payment-confirm', element: <Navigate to=".." relative="path" replace /> },
      { path: 'sales-channels/:channel/retail/create', element: <RetailInvoiceCreatePage /> },
      { path: 'sales-channels/:channel/wholesale/create', element: <WholesaleInvoiceCreatePage /> },
      { path: 'sales-channels/:channel/refund/create', element: <RefundInvoiceCreatePage /> },
      { path: 'sales-channels/:channel/find', element: <Navigate to="/sales-channels/store" replace /> },
      { path: 'sales-channels/:channel/:action', element: <SalesChannelSubPage /> },

      // ── Vận hành ────────────────────────────────────────────
      { path: 'accounting', element: <AccountingPage /> },
      { path: 'accounting/cash', element: <CashReceiptsPage /> },
      { path: 'accounting/cash/create', element: <CashReceiptCreatePage /> },
      { path: 'accounting/bank', element: <BankReceiptsPage /> },
      { path: 'accounting/bank/create', element: <BankReceiptCreatePage /> },
      { path: 'accounting/summary', element: <ReceiptsSummaryPage /> },
      { path: 'accounting/debt/customers', element: <CustomerDebtPage /> },
      { path: 'accounting/debt/staff', element: <StaffDebtPage /> },
      { path: 'accounting/debt/vendors', element: <VendorDebtPage /> },
      { path: 'accounting/debt/initial', element: <InitialDebtPage /> },
      { path: 'accounting/entries', element: <JournalEntriesPage /> },
      { path: 'accounting/journal', element: <JournalPage /> },
      { path: 'accounting/installment-collection', element: <InstallmentCollectionPage /> },
      { path: 'accounting/history', element: <AccountingHistoryPage /> },
      { path: 'accounting/accounts', element: <AccountingAccountsPage /> },
      { path: 'accounting/installment', element: <InstallmentServicesPage /> },
      { path: 'tasks', element: <TaskPage /> },
      { path: 'print-forms', element: <PrintFormsPage /> },

      // ── Đơn hàng ────────────────────────────────────────────
      { path: 'orders/manage', element: <OrdersManagePage /> },
      { path: 'orders/packing', element: <OrdersPackagingPage /> },
      { path: 'orders/handover', element: <OrdersHandoverPage /> },
      { path: 'orders/shipping-pending', element: <OrdersShippingPendingPage /> },
      { path: 'orders/disputes', element: <OrdersDisputesPage /> },
      { path: 'orders/cod-control', element: <OrdersCodControlPage /> },
      { path: 'orders/sources', element: <OrdersSourcesPage /> },
      { path: 'orders/history', element: <OrdersHistoryPage /> },

      // ── Nhân viên & Cài đặt ────────────────────────────────────
      { path: 'staff', element: <StaffPage /> },
      { path: 'staff/create', element: <StaffPage /> },
      { path: 'staff/accounts', element: <StaffPage /> },
      { path: 'staff/stats', element: <StaffPage /> },
      { path: 'settings', element: <SettingsPage /> },

      // ── Báo Cáo ──────────────────────────────────────────────
      { path: 'reports/revenue/time', element: <RevenueByTimePage /> },
      { path: 'reports/revenue/store', element: <RevenueByStorePage /> },
      { path: 'reports/revenue/brand', element: <RevenueByBrandPage /> },
      { path: 'reports/revenue/staff', element: <RevenueByStaffPage /> },
      { path: 'reports/revenue/department', element: <RevenueByDepartmentPage /> },
      { path: 'reports/revenue/category', element: <RevenueByCategoryPage /> },
      { path: 'reports/revenue/internal-category', element: <RevenueByInternalCategoryPage /> },
      { path: 'reports/revenue/product', element: <RevenueByProductPage /> },
      { path: 'reports/revenue/vendor', element: <RevenueByVendorPage /> },
      { path: 'reports/revenue/customer', element: <RevenueByCustomerPage /> },
      { path: 'reports/revenue/inventory-ratio', element: <RevenueInventoryRatioPage /> },
      { path: 'reports/orders/channel', element: <OrdersByChannelPage /> },
      { path: 'reports/orders/created', element: <OrdersCreatedPage /> },
      { path: 'reports/orders/success', element: <OrdersSuccessPage /> },
      { path: 'reports/orders/value', element: <OrdersByValuePage /> },
      { path: 'reports/orders/category', element: <OrdersByCategoryPage /> },
      { path: 'reports/orders/product', element: <OrdersByProductPage /> },
      { path: 'reports/orders/status', element: <OrdersByStatusPage /> },
      { path: 'reports/orders/address', element: <OrdersByAddressPage /> },
      { path: 'reports/orders/reason', element: <OrdersByReasonPage /> },
      { path: 'reports/orders/staff', element: <OrdersByStaffPage /> },
      { path: 'reports/orders/ads', element: <OrdersByAdsPage /> },
      { path: 'reports/orders/cod-reconciliation', element: <OrdersCodReconciliationPage /> },
      { path: 'reports/orders/carrier', element: <OrdersByCarrierPage /> },
      { path: 'reports/retail/overview', element: <RetailOverviewPage /> },
      { path: 'reports/retail/customer-source', element: <RetailByCustomerSourcePage /> },
      { path: 'reports/retail/staff', element: <RetailByStaffPage /> },
      { path: 'reports/retail/store', element: <RetailByStorePage /> },
      { path: 'reports/retail/card-swipe', element: <RetailCardSwipeDetailsPage /> },
      { path: 'reports/retail/invoice-value', element: <RetailByInvoiceValuePage /> },
      { path: 'reports/retail/invoice-visitor-ratio', element: <RetailInvoiceVisitorRatioPage /> },
      { path: 'reports/retail/shift-end', element: <RetailShiftEndPage /> },
      { path: 'reports/wholesale/overview', element: <WholesaleOverviewPage /> },
      { path: 'reports/wholesale/staff', element: <WholesaleByStaffPage /> },
      { path: 'reports/inventory/inout-product', element: <InventoryInOutByProductPage /> },
      { path: 'reports/inventory/inout-details', element: <InventoryInOutDetailsPage /> },
      { path: 'reports/inventory/inout-total', element: <InventoryInOutTotalPage /> },
      { path: 'reports/inventory/inout-store', element: <InventoryInOutByStorePage /> },
      { path: 'reports/inventory/vendor', element: <InventoryByVendorPage /> },
      { path: 'reports/inventory/product-category', element: <InventoryProductCategoryPage /> },
      { path: 'reports/inventory/stock-quantity', element: <InventoryStockQuantityPage /> },
      { path: 'reports/inventory/unconfirmed-transfers', element: <InventoryUnconfirmedTransfersPage /> },
      { path: 'reports/inventory/store-status', element: <InventoryByStoreStatusPage /> },
      { path: 'reports/inventory/product-status', element: <InventoryByProductStatusPage /> },
      { path: 'reports/inventory/batch', element: <InventoryByBatchPage /> },
      { path: 'reports/inventory/transfers-product', element: <InventoryTransfersByProductPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

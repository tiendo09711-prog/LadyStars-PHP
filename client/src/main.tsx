import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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
import { CustomerCardPage } from './modules/customer/CustomerCardPage';
import { CustomerCarePage } from './modules/customer/CustomerCarePage';
import { CustomerLevelPage } from './modules/customer/CustomerLevelPage';
import { CustomerGroupPage } from './modules/customer/CustomerGroupPage';
import { CustomerCareTypePage } from './modules/customer/CustomerCareTypePage';
import { CustomerCareReasonPage } from './modules/customer/CustomerCareReasonPage';
import { VendorPage } from './modules/vendor/VendorPage';
import { AccountingPage } from './modules/accounting/AccountingPage';
import { TaskPage } from './modules/task/TaskPage';
import { PrintFormsPage } from './modules/printForms/PrintFormsPage';
import { StaffPage } from './modules/staff/StaffPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { WarehouseTransactionPage } from './modules/warehouse/WarehouseTransactionPage';
import { WarehouseTransferPage } from './modules/warehouse/WarehouseTransferPage';
import { WarehouseTransferCreatePage } from './modules/warehouse/WarehouseTransferCreatePage';
import { WarehouseAuditPage } from './modules/warehouse/WarehouseAuditPage';
import { WarehouseAuditCreatePage } from './modules/warehouse/WarehouseAuditCreatePage';
import { WarehouseDraftPage } from './modules/warehouse/WarehouseDraftPage';
import { WarehouseHistoryPage } from './modules/warehouse/WarehouseHistoryPage';
import { VoucherImportPage } from './modules/warehouse/VoucherImportPage';
import { VoucherExportPage } from './modules/warehouse/VoucherExportPage';
import { VoucherExcelImportPage } from './modules/warehouse/VoucherExcelImportPage';
import { ProductImportPage } from './modules/warehouse/ProductImportPage';
import { ProductExportPage } from './modules/warehouse/ProductExportPage';
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
      { path: 'warehouse/transactions/products/import', element: <ProductImportPage /> },
      { path: 'warehouse/transactions/products/export', element: <ProductExportPage /> },
      { path: 'warehouse/transfers', element: <WarehouseTransferPage /> },
      { path: 'warehouse/transfers/create', element: <WarehouseTransferCreatePage /> },
      { path: 'warehouse/audit', element: <WarehouseAuditPage /> },
      { path: 'warehouse/audit/create', element: <WarehouseAuditCreatePage /> },
      { path: 'warehouse/drafts', element: <WarehouseDraftPage /> },
      { path: 'warehouse/history', element: <WarehouseHistoryPage /> },

      // ── Bán hàng & Đối tác ─────────────────────────────────────
      { path: 'sales', element: <SalesPage /> },
      { path: 'customers', element: <CustomerPage /> },
      { path: 'customers/list', element: <CustomerListPage /> },
      { path: 'customers/cards', element: <CustomerCardPage /> },
      { path: 'customers/care', element: <CustomerCarePage /> },
      { path: 'customers/levels', element: <CustomerLevelPage /> },
      { path: 'customers/groups', element: <CustomerGroupPage /> },
      { path: 'customers/care-types', element: <CustomerCareTypePage /> },
      { path: 'customers/care-reasons', element: <CustomerCareReasonPage /> },
      { path: 'vendors', element: <VendorPage /> },

      // ── Kênh bán ───────────────────────────────────────────────
      { path: 'sales-channels/:channel', element: <SalesChannelPage /> },
      { path: 'sales-channels/:channel/retail/create', element: <RetailInvoiceCreatePage /> },
      { path: 'sales-channels/:channel/wholesale/create', element: <WholesaleInvoiceCreatePage /> },
      { path: 'sales-channels/:channel/refund/create', element: <RefundInvoiceCreatePage /> },
      { path: 'sales-channels/:channel/:action', element: <SalesChannelSubPage /> },

      // ── Vận hành ────────────────────────────────────────────
      { path: 'accounting', element: <AccountingPage /> },
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
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

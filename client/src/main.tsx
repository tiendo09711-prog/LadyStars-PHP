import React from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './core/layout/AppLayout';
import { LoginPage } from './modules/auth/LoginPage';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { ProductsPage } from './modules/product/ProductsPage';
import { StorageDurationPage } from './modules/product/StorageDurationPage';
import { InventoryPage } from './modules/product/InventoryPage';
import { CategoriesPage } from './modules/product/CategoriesPage';
import { SalesPage } from './modules/product/SalesPage';
import { CustomerPage } from './modules/customer/CustomerPage';
import { CustomerListPage } from './modules/customer/CustomerListPage';
import { CustomerDetailPage } from './modules/customer/CustomerDetailPage';
import { CustomerCarePage } from './modules/customer/CustomerCarePage';
import { CustomerLevelPage } from './modules/customer/CustomerLevelPage';
import { CustomerGroupPage } from './modules/customer/CustomerGroupPage';
import { CustomerCareTypePage } from './modules/customer/CustomerCareTypePage';
import { CustomerCareReasonPage } from './modules/customer/CustomerCareReasonPage';
import { StaffPage } from './modules/staff/StaffPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { WarehouseTransactionPage } from './modules/warehouse/WarehouseTransactionPage';
import { WarehouseTransferPage } from './modules/warehouse/WarehouseTransferPage';
import { WarehouseTransferCreatePage } from './modules/warehouse/WarehouseTransferCreatePage';
import { WarehouseTransferDetailPage } from './modules/warehouse/WarehouseTransferDetailPage';
import { WarehouseAuditPage } from './modules/warehouse/WarehouseAuditPage';
import { WarehouseAuditCreatePage } from './modules/warehouse/WarehouseAuditCreatePage';
import { WarehouseBranchesPage } from './modules/warehouse/WarehouseBranchesPage';
import { VoucherImportPage } from './modules/warehouse/VoucherImportPage';
import { VoucherExportPage } from './modules/warehouse/VoucherExportPage';
import { VoucherExcelImportPage } from './modules/warehouse/VoucherExcelImportPage';
import {
  InventoryInOutStockReportPage,
  InventoryPendingTransfersReportPage,
  ProductPerformanceReportPage,
  RevenueByProductsPage,
  RevenueByStorePage,
  RevenueByTimePage,
  SalesOverviewReportPage,
  SalesShiftClosingReportPage,
} from './modules/reports/ReportPages';
import { SalesChannelPage } from './modules/sales/SalesChannelPage';
import { SalesChannelSubPage } from './modules/sales/SalesChannelSubPage';
import { RetailInvoiceCreatePage } from './modules/sales/RetailInvoiceCreatePage';
import { WholesaleInvoiceCreatePage } from './modules/sales/WholesaleInvoiceCreatePage';
import { RefundInvoiceCreatePage } from './modules/sales/RefundInvoiceCreatePage';
import { RefundInvoiceDetailPage } from './modules/sales/RefundInvoiceDetailPage';
import './styles/ls-theme.css';
import './styles/app.css';
import './styles/phase-rescue.css';
import './styles/ui-contract.css';
import './styles/inventory-compact-theme.css';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },

      // ── Sản phẩm ───────────────────────────────────────────────
      { path: 'products', element: <ProductsPage /> },
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
      { path: 'warehouse/transfers/:id/edit', element: <WarehouseTransferCreatePage /> },
      { path: 'warehouse/transfers/:id', element: <WarehouseTransferDetailPage /> },
      { path: 'warehouse/audit', element: <WarehouseAuditPage /> },
      { path: 'warehouse/audit/create', element: <WarehouseAuditCreatePage /> },
      { path: 'warehouse/audit/:id', element: <WarehouseAuditCreatePage /> },
      { path: 'warehouse/branches', element: <WarehouseBranchesPage /> },

      // ── Bán hàng & Đối tác ─────────────────────────────────────
      { path: 'sales', element: <SalesPage /> },
      { path: 'customers', element: <CustomerPage /> },
      { path: 'customers/list', element: <CustomerListPage /> },
      { path: 'customers/list/:id', element: <CustomerDetailPage /> },
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
      { path: 'sales-channels/:channel/refund/:id', element: <RefundInvoiceDetailPage /> },
      { path: 'sales-channels/:channel/find', element: <Navigate to="/sales-channels/store" replace /> },
      { path: 'sales-channels/:channel/:action', element: <SalesChannelSubPage /> },


      // ── Đơn hàng ────────────────────────────────────────────

      // ── Nhân viên & Cài đặt ────────────────────────────────────
      { path: 'staff', element: <StaffPage /> },
      { path: 'staff/create', element: <StaffPage /> },
      { path: 'staff/accounts', element: <StaffPage /> },
      { path: 'staff/stats', element: <StaffPage /> },
      { path: 'settings', element: <SettingsPage /> },

      // ── Báo Cáo ──────────────────────────────────────────────
      { path: 'reports/revenue/time', element: <RevenueByTimePage /> },
      { path: 'reports/revenue/store', element: <RevenueByStorePage /> },
      { path: 'reports/revenue/products', element: <RevenueByProductsPage /> },
      { path: 'reports/sales/overview', element: <SalesOverviewReportPage /> },
      { path: 'reports/sales/shift-closing', element: <SalesShiftClosingReportPage /> },
      { path: 'reports/inventory/in-out-stock', element: <InventoryInOutStockReportPage /> },
      { path: 'reports/inventory/pending-transfers', element: <InventoryPendingTransfersReportPage /> },
      { path: 'reports/products/performance', element: <ProductPerformanceReportPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

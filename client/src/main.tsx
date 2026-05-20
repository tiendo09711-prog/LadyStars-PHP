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
import { VendorPage } from './modules/vendor/VendorPage';
import { AccountingPage } from './modules/accounting/AccountingPage';
import { TaskPage } from './modules/task/TaskPage';
import { PrintFormsPage } from './modules/printForms/PrintFormsPage';
import { StaffPage } from './modules/staff/StaffPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { WarehouseTransactionPage } from './modules/warehouse/WarehouseTransactionPage';
import { WarehouseTransferPage } from './modules/warehouse/WarehouseTransferPage';
import { WarehouseAuditPage } from './modules/warehouse/WarehouseAuditPage';
import { WarehouseDraftPage } from './modules/warehouse/WarehouseDraftPage';
import { WarehouseHistoryPage } from './modules/warehouse/WarehouseHistoryPage';
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
      { path: 'warehouse/transfers', element: <WarehouseTransferPage /> },
      { path: 'warehouse/audit', element: <WarehouseAuditPage /> },
      { path: 'warehouse/drafts', element: <WarehouseDraftPage /> },
      { path: 'warehouse/history', element: <WarehouseHistoryPage /> },

      // ── Bán hàng & Đối tác ─────────────────────────────────────
      { path: 'sales', element: <SalesPage /> },
      { path: 'customers', element: <CustomerPage /> },
      { path: 'vendors', element: <VendorPage /> },

      // ── Vận hành ───────────────────────────────────────────────
      { path: 'accounting', element: <AccountingPage /> },
      { path: 'tasks', element: <TaskPage /> },
      { path: 'print-forms', element: <PrintFormsPage /> },

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

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './core/layout/AppLayout';
import { LoginPage } from './modules/auth/LoginPage';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { ProductMainPage } from './modules/product/ProductMainPage';
import { SalesPage } from './modules/product/SalesPage';
import { CustomerPage } from './modules/customer/CustomerPage';
import { VendorPage } from './modules/vendor/VendorPage';
import { AccountingPage } from './modules/accounting/AccountingPage';
import { TaskPage } from './modules/task/TaskPage';
import { PrintFormsPage } from './modules/printForms/PrintFormsPage';
import { StaffPage } from './modules/staff/StaffPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import './styles/app.css';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'products', element: <ProductMainPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'customers', element: <CustomerPage /> },
      { path: 'vendors', element: <VendorPage /> },
      { path: 'accounting', element: <AccountingPage /> },
      { path: 'tasks', element: <TaskPage /> },
      { path: 'print-forms', element: <PrintFormsPage /> },
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

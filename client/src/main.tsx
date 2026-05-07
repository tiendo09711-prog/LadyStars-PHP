import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './core/layout/AppLayout';
import { LoginPage } from './modules/auth/LoginPage';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { ProductListPage } from './modules/product/ListPage';
import { SalesPage } from './modules/product/SalesPage';
import { CustomerPage } from './modules/customer/CustomerPage';
import { VendorPage } from './modules/vendor/VendorPage';
import { AccountingPage } from './modules/accounting/AccountingPage';
import { TaskPage } from './modules/task/TaskPage';
import { PrintFormsPage } from './modules/printForms/PrintFormsPage';
import './styles/app.css';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'products', element: <ProductListPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'customers', element: <CustomerPage /> },
      { path: 'vendors', element: <VendorPage /> },
      { path: 'accounting', element: <AccountingPage /> },
      { path: 'tasks', element: <TaskPage /> },
      { path: 'print-forms', element: <PrintFormsPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

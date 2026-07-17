export type InventoryReportTabId =
  | 'in-out-stock'
  | 'stock'
  | 'age';

export type InventoryReportTab = {
  id: InventoryReportTabId;
  to: string;
  label: string;
  description: string;
};

export const INVENTORY_REPORT_TABS: InventoryReportTab[] = [
  {
    id: 'in-out-stock',
    to: '/reports/inventory/in-out-stock',
    label: 'Xuất nhập tồn',
    description: 'Biến động kho theo thời gian: nhập, xuất, điều chỉnh và chuyển kho.',
  },
  {
    id: 'stock',
    to: '/products/inventory',
    label: 'Tồn kho',
    description: 'Tồn hiện tại, tồn khả dụng, giá trị vốn và phân bổ theo kho.',
  },
  {
    id: 'age',
    to: '/products/storage-duration',
    label: 'Tuổi tồn',
    description: 'Sản phẩm chưa bán lâu, bán chậm và vốn đang bị giữ.',
  },
];

export const INVENTORY_REPORT_PATHS = [
  '/reports/inventory',
  '/reports/inventory/in-out-stock',
  '/products/inventory',
  '/products/storage-duration',
] as const;

export function isInventoryReportPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (
    path === '/reports/inventory' ||
    path.startsWith('/reports/inventory/') ||
    path === '/products/inventory' ||
    path.startsWith('/products/inventory/') ||
    path === '/products/storage-duration' ||
    path.startsWith('/products/storage-duration/')
  );
}

export function resolveInventoryReportTab(pathname: string): InventoryReportTab {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = INVENTORY_REPORT_TABS.find((tab) => tab.to === path);
  if (exact) return exact;
  if (path.startsWith('/products/inventory')) {
    return INVENTORY_REPORT_TABS.find((tab) => tab.id === 'stock')!;
  }
  if (path.startsWith('/products/storage-duration')) {
    return INVENTORY_REPORT_TABS.find((tab) => tab.id === 'age')!;
  }
  return INVENTORY_REPORT_TABS[0];
}

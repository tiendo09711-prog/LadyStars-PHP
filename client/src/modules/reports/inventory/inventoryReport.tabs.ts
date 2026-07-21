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

/**
 * Admin-only report navigation. Product ops pages stay under /products/* without this shell.
 * - /products/inventory → standalone tồn kho (EMPLOYEE + ADMIN)
 * - /reports/inventory/stock → same list inside report chrome (ADMIN reports menu)
 */
export const INVENTORY_REPORT_TABS: InventoryReportTab[] = [
  {
    id: 'in-out-stock',
    to: '/reports/inventory/in-out-stock',
    label: 'Xuất nhập tồn',
    description: 'Biến động kho theo thời gian: nhập, xuất, điều chỉnh và chuyển kho.',
  },
  {
    id: 'stock',
    to: '/reports/inventory/stock',
    label: 'Tồn kho',
    description: 'Tồn hiện tại, tồn khả dụng, giá trị vốn và phân bổ theo kho.',
  },
  {
    id: 'age',
    to: '/reports/inventory/age',
    label: 'Tuổi tồn',
    description: 'Sản phẩm chưa bán lâu, bán chậm và vốn đang bị giữ.',
  },
];

export const INVENTORY_REPORT_PATHS = [
  '/reports/inventory',
  '/reports/inventory/in-out-stock',
  '/reports/inventory/stock',
  '/reports/inventory/age',
] as const;

export function isInventoryReportPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === '/reports/inventory' || path.startsWith('/reports/inventory/');
}

export function resolveInventoryReportTab(pathname: string): InventoryReportTab {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = INVENTORY_REPORT_TABS.find((tab) => tab.to === path);
  if (exact) return exact;
  if (path.startsWith('/reports/inventory/stock')) {
    return INVENTORY_REPORT_TABS.find((tab) => tab.id === 'stock')!;
  }
  if (path.startsWith('/reports/inventory/age')) {
    return INVENTORY_REPORT_TABS.find((tab) => tab.id === 'age')!;
  }
  return INVENTORY_REPORT_TABS[0];
}

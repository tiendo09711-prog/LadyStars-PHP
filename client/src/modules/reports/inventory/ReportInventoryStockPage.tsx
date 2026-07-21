import { InventoryList } from '../../product/components/InventoryList';
import '../../product/inventory-page.css';
import '../../product/inventory-soft-type.css';
import { InventoryReportShell } from './components/InventoryReportShell';

/**
 * Admin report chrome for "Tồn kho".
 * Product ops page stays at /products/inventory without this shell.
 */
export function ReportInventoryStockPage() {
  return (
    <div className="inventory-soft-page">
      <InventoryReportShell>
        <div className="workspace-page inventory-root">
          <InventoryList />
        </div>
      </InventoryReportShell>
    </div>
  );
}

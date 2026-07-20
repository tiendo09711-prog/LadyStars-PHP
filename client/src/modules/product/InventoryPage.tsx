import './inventory-page.css';
import './inventory-soft-type.css';
import { InventoryReportShell } from '../reports/inventory/components/InventoryReportShell';
import { InventoryList } from './components/InventoryList';

export function InventoryPage() {
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

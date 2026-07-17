import './inventory-page.css';
import { InventoryReportShell } from '../reports/inventory/components/InventoryReportShell';
import { InventoryList } from './components/InventoryList';

export function InventoryPage() {
  return (
    <InventoryReportShell>
      <div className="workspace-page inventory-root">
        <InventoryList />
      </div>
    </InventoryReportShell>
  );
}

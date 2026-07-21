import { StorageDurationPage } from '../../product/StorageDurationPage';
import { InventoryReportShell } from './components/InventoryReportShell';

/**
 * Admin report chrome for "Tuổi tồn".
 * Product ops page stays at /products/storage-duration without this shell.
 */
export function ReportInventoryAgePage() {
  return (
    <InventoryReportShell>
      <StorageDurationPage />
    </InventoryReportShell>
  );
}

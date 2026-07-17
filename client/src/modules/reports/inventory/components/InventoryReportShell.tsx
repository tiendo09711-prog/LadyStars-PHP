import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveInventoryReportTab } from '../inventoryReport.tabs';
import { InventoryReportNav } from './InventoryReportNav';
import '../inventory-report-shell.css';

type InventoryReportShellProps = {
  children: ReactNode;
  /** ISO timestamp or pre-formatted label from a real API response only. */
  lastUpdatedLabel?: string | null;
};

export function InventoryReportShell({ children, lastUpdatedLabel }: InventoryReportShellProps) {
  const location = useLocation();
  const activeTab = resolveInventoryReportTab(location.pathname);

  return (
    <main className="inventory-report-shell" data-inventory-report-shell="true">
      <header className="inventory-report-shell__header">
        <div className="inventory-report-shell__title-block">
          <h1>Báo cáo kho hàng</h1>
          <p>{activeTab.description}</p>
        </div>
        {lastUpdatedLabel ? (
          <div className="inventory-report-shell__meta" aria-live="polite">
            Cập nhật: {lastUpdatedLabel}
          </div>
        ) : null}
      </header>

      <InventoryReportNav />

      <div className="inventory-report-shell__content">{children}</div>
    </main>
  );
}

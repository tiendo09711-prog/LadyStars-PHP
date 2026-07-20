import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveInventoryReportTab } from '../inventoryReport.tabs';
import { InventoryReportNav } from './InventoryReportNav';
import '../inventory-report-shell.css';

type InventoryReportShellProps = {
  children: ReactNode;
  /** ISO timestamp or pre-formatted label from a real API response only. */
  lastUpdatedLabel?: string | null;
  /** Optional page-scoped class (e.g. soft-type root) on the shell wrapper. */
  className?: string;
};

export function InventoryReportShell({ children, lastUpdatedLabel, className }: InventoryReportShellProps) {
  const location = useLocation();
  const activeTab = resolveInventoryReportTab(location.pathname);
  const shellClass = ['inventory-report-shell', className].filter(Boolean).join(' ');

  return (
    <main className={shellClass} data-inventory-report-shell="true">
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

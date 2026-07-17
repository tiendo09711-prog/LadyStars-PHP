import { NavLink, useLocation } from 'react-router-dom';
import { INVENTORY_REPORT_TABS, resolveInventoryReportTab } from '../inventoryReport.tabs';

export function InventoryReportNav() {
  const location = useLocation();
  const activeTab = resolveInventoryReportTab(location.pathname);

  return (
    <nav className="inventory-report-nav" aria-label="Báo cáo kho hàng">
      <div className="inventory-report-nav__tabs" role="tablist" aria-label="Các tab báo cáo kho hàng">
        {INVENTORY_REPORT_TABS.map((tab) => {
          const isActive = activeTab.id === tab.id;
          return (
            <NavLink
              key={tab.id}
              to={tab.to}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={() => `inventory-report-nav__tab${isActive ? ' is-active' : ''}`}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

import './inventory-page.css';
import './inventory-soft-type.css';
import { InventoryList } from './components/InventoryList';

/**
 * Standalone product inventory page (menu Sản phẩm → Tồn kho).
 * Not wrapped in InventoryReportShell so employees cannot jump into report tabs.
 * Admin report entry lives at /reports/inventory/stock.
 */
export function InventoryPage() {
  return (
    <div className="inventory-soft-page">
      <div className="workspace-page inventory-root">
        <header className="inventory-page-header">
          <div>
            <h1>Tồn kho</h1>
            <p>Tồn hiện tại, tồn khả dụng, giá trị vốn và phân bổ theo kho được phép xem.</p>
          </div>
        </header>
        <InventoryList />
      </div>
    </div>
  );
}

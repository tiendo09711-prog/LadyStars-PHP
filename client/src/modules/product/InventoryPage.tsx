import './inventory-page.css';
import { InventoryList } from './components/InventoryList';

export function InventoryPage() {
  return (
    <div className="workspace-page">
      <InventoryList />
    </div>
  );
}

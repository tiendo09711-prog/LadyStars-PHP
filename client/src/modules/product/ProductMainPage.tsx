import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Clock3 } from 'lucide-react';
import { ProductList } from './components/ProductList';
import { ProductHistory } from './components/ProductHistory';
import './inventory-page.css';
import './products-list-ui.css';
import './products-page.css';
import './products-soft-type.css';

type ProductTab = 'products' | 'history';

const TAB_LIST: { key: ProductTab; label: string; icon: typeof Boxes }[] = [
  { key: 'products', label: 'Sản phẩm', icon: Boxes },
  { key: 'history', label: 'Lịch sử sửa/xóa', icon: Clock3 },
];

export function ProductMainPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: ProductTab = searchParams.get('tab') === 'history' ? 'history' : 'products';
  const [barcodeWorkspaceOpen, setBarcodeWorkspaceOpen] = useState(false);

  const handleTabChange = (tab: ProductTab) => {
    setSearchParams(tab === 'products' ? {} : { tab }, { replace: true });
  };

  const currentTitle = activeTab === 'history' ? 'Lịch sử sửa/xóa sản phẩm' : 'Danh sách sản phẩm';

  const headerSlot = barcodeWorkspaceOpen ? null : (
    <div className="products-compact-head">
      <h1 className="products-compact-heading-sr">{currentTitle}</h1>

      <div className="products-tabs-row products-tabs-row--title-slot">
        <div className="products-tabbar is-compact" role="tablist" aria-label="Product tabs">
          {TAB_LIST.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`products-panel-${tab.key}`}
                className={`products-tab is-compact ${isActive ? 'is-active' : ''}`}
                onClick={() => handleTabChange(tab.key)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-stack inventory-page-shell products-root">
      {activeTab === 'products' ? (
        <div id="products-panel-products" role="tabpanel">
          <ProductList onBarcodeWorkspaceChange={setBarcodeWorkspaceOpen} headerSlot={headerSlot} />
        </div>
      ) : (
        <div id="products-panel-history" role="tabpanel">
          <ProductHistory headerSlot={headerSlot} />
        </div>
      )}
    </div>
  );
}

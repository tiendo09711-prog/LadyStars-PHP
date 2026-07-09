import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Clock3 } from 'lucide-react';
import { ProductList } from './components/ProductList';
import { ProductHistory } from './components/ProductHistory';
import './inventory-page.css';
import './products-list-ui.css';
import './products-page.css';

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

  return (
    <div className="page-stack inventory-page-shell products-root">
      {!barcodeWorkspaceOpen ? (
        <section className="data-card inventory-toolbar-card">
          <div className="inv-header">
            <span className="inv-badge">PRODUCTS</span>
            <h1 className="inv-title">
              {activeTab === 'history' ? 'Lịch sử sửa/xóa sản phẩm' : 'Danh sách sản phẩm'}
            </h1>
            <p className="inv-desc">
              {activeTab === 'history'
                ? 'Theo dõi người sửa, kiểu thao tác và thời điểm thay đổi sản phẩm.'
                : 'Quản lý sản phẩm, barcode, giá bán và trạng thái.'}
            </p>
          </div>

          <div className="products-tabs-row">
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
                    <Icon size={15} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'products' ? (
        <div id="products-panel-products" role="tabpanel">
          <ProductList onBarcodeWorkspaceChange={setBarcodeWorkspaceOpen} />
        </div>
      ) : (
        <div id="products-panel-history" role="tabpanel">
          <ProductHistory />
        </div>
      )}
    </div>
  );
}

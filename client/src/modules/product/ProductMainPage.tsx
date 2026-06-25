import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Clock3 } from 'lucide-react';
import { ProductList } from './components/ProductList';
import { ProductHistory } from './components/ProductHistory';
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
  const actionSlotRef = useRef<HTMLDivElement>(null);
  const [slotReady, setSlotReady] = useState(false);

  useLayoutEffect(() => {
    setSlotReady(true);
  }, []);

  useEffect(() => {
    document.title = activeTab === 'history' ? 'Lịch sử sửa/xóa sản phẩm' : 'Sản phẩm';
  }, [activeTab]);

  const handleTabChange = (tab: ProductTab) => {
    setSearchParams(tab === 'products' ? {} : { tab }, { replace: true });
  };

  return (
    <div className="products-workspace">
      <section className="products-workspace-card">
        <div className="products-toolbar-slot" hidden={barcodeWorkspaceOpen}>
          <header className="products-toolbar">
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
                    <Icon size={17} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="products-toolbar-actions" ref={actionSlotRef} />
          </header>
        </div>

        <div
          id="products-panel-products"
          role="tabpanel"
          hidden={activeTab !== 'products'}
        >
          {activeTab === 'products' && slotReady && (
            <ProductList
              actionSlot={actionSlotRef}
              onBarcodeWorkspaceChange={setBarcodeWorkspaceOpen}
            />
          )}
        </div>

        <div
          id="products-panel-history"
          role="tabpanel"
          hidden={activeTab !== 'history'}
        >
          {activeTab === 'history' && slotReady && <ProductHistory actionSlot={actionSlotRef} />}
        </div>
      </section>
    </div>
  );
}

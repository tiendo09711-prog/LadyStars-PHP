import { useMemo, useState } from 'react';
import { Boxes, Clock3, Sparkles } from 'lucide-react';
import { ProductList } from './components/ProductList';
import { ProductHistory } from './components/ProductHistory';
import './products-page.css';

type ProductTab = 'products' | 'history';

const TAB_META: Record<ProductTab, { label: string; description: string; icon: typeof Boxes }> = {
  products: {
    label: 'Sản phẩm',
    description: 'Quản lý danh sách sản phẩm, cập nhật thông tin, import và xuất dữ liệu nhanh.',
    icon: Boxes,
  },
  history: {
    label: 'Lịch sử sửa/xóa',
    description: 'Theo dõi mọi thay đổi sản phẩm để đối chiếu người sửa, thời điểm và kiểu tác động.',
    icon: Clock3,
  },
};

export function ProductMainPage() {
  const [activeTab, setActiveTab] = useState<ProductTab>('products');
  const activeMeta = useMemo(() => TAB_META[activeTab], [activeTab]);

  return (
    <div className="products-workspace">
      <section className="products-hero">
        <div className="products-hero-copy">
          <span className="products-hero-kicker">
            <Sparkles size={14} />
            Product Workspace
          </span>
          <h1>{activeMeta.label}</h1>
          <p>{activeMeta.description}</p>
        </div>

        <div className="products-tabbar" role="tablist" aria-label="Product tabs">
          {(Object.keys(TAB_META) as ProductTab[]).map((tabKey) => {
            const tab = TAB_META[tabKey];
            const Icon = tab.icon;
            const isActive = activeTab === tabKey;

            return (
              <button
                key={tabKey}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`products-panel-${tabKey}`}
                className={`products-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tabKey)}
              >
                <span className="products-tab-top">
                  <span className="products-tab-icon">
                    <Icon size={18} />
                  </span>
                  {tab.label}
                </span>
                <small>{tab.description}</small>
              </button>
            );
          })}
        </div>
      </section>

      <div
        id="products-panel-products"
        role="tabpanel"
        hidden={activeTab !== 'products'}
      >
        {activeTab === 'products' && <ProductList onShowHistory={() => setActiveTab('history')} />}
      </div>

      <div
        id="products-panel-history"
        role="tabpanel"
        hidden={activeTab !== 'history'}
      >
        {activeTab === 'history' && <ProductHistory />}
      </div>
    </div>
  );
}

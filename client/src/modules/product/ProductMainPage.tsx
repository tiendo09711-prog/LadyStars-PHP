import { useState } from 'react';
import { Boxes, Clock } from 'lucide-react';
import { ProductList } from './components/ProductList';
import { ProductHistory } from './components/ProductHistory';

export function ProductMainPage() {
  const [activeTab, setActiveTab] = useState('products');

  return (
    <div className="workspace-page">
      <div className="workspace-tabs" role="tablist" aria-label="Product tabs">
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Boxes size={16} /> Sản phẩm
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Clock size={16} /> Lịch sử sửa/xóa
        </button>
      </div>

      <div style={{ display: activeTab === 'products' ? 'block' : 'none' }}>
        <ProductList onShowHistory={() => setActiveTab('history')} />
      </div>
      <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
        <ProductHistory />
      </div>
    </div>
  );
}

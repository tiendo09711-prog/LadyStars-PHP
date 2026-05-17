import { useState } from 'react';
import { ProductList } from './components/ProductList';
import { InventoryList } from './components/InventoryList';
import { CategoryList } from './components/CategoryList';
import { ProductHistory } from './components/ProductHistory';
import { Boxes, Package, Layers3, Clock } from 'lucide-react';

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
          className={activeTab === 'inventory' ? 'active' : ''} 
          onClick={() => setActiveTab('inventory')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Package size={16} /> Tồn kho
        </button>
        <button 
          className={activeTab === 'categories' ? 'active' : ''} 
          onClick={() => setActiveTab('categories')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Layers3 size={16} /> Danh mục
        </button>
        <button 
          className={activeTab === 'history' ? 'active' : ''} 
          onClick={() => setActiveTab('history')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Clock size={16} /> Lịch sử sửa/xóa
        </button>
      </div>
      
      {/* Container to prevent flickering on tab switch */}
      <div style={{ display: activeTab === 'products' ? 'block' : 'none' }}>
        <ProductList />
      </div>
      <div style={{ display: activeTab === 'inventory' ? 'block' : 'none' }}>
        <InventoryList />
      </div>
      <div style={{ display: activeTab === 'categories' ? 'block' : 'none' }}>
        <CategoryList />
      </div>
      <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
        <ProductHistory />
      </div>
    </div>
  );
}

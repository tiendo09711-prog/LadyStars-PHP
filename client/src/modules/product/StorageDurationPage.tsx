import { useEffect, useState } from 'react';
import { 
  Boxes, 
  Calendar, 
  Clock, 
  DollarSign, 
  FileDown, 
  Filter, 
  Percent, 
  RefreshCw, 
  Search, 
  ArrowRight, 
  X, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { productApi } from '../../core/api/product.api';
import type { IStorageDuration, ICategory } from '../../types/product.type';
import { Pagination } from '../../core/components/Pagination';
import { http } from '../../core/api/http';

export function StorageDurationPage() {
  // Core lists & loading
  const [items, setItems] = useState<IStorageDuration[]>([]);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & counts
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Filters
  const [search, setSearch] = useState('');
  const [tempSearch, setTempSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unsold_long' | 'slow_selling'>('all');
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  
  // Advanced filters
  const [minStartDays, setMinStartDays] = useState('');
  const [minSoldDays, setMinSoldDays] = useState('');
  const [minStock, setMinStock] = useState('');
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // KPIs
  const [kpis, setKpis] = useState({
    totalProducts: 0,
    unsoldLong: 0,
    slowSelling: 0,
    totalValue: 0
  });

  // Action Dialogs
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Discount Modal state
  const [discountProduct, setDiscountProduct] = useState<IStorageDuration | null>(null);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountVal, setDiscountVal] = useState<string>('10');
  const [discountNote, setDiscountNote] = useState('');

  // Return Modal state
  const [returnProduct, setReturnProduct] = useState<IStorageDuration | null>(null);
  const [returnQty, setReturnQty] = useState<number>(1);
  const [returnPrice, setReturnPrice] = useState<number>(0);
  const [returnNote, setReturnNote] = useState('');

  // Auto clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load Categories and Branches on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await productApi.getCategories({ limit: 100 });
        setCategories(res.items || []);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    };
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const res = await http.get('/system/branches');
        setBranches(res.data?.items || []);
      } catch (err) {
        console.error('Failed to load branches', err);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadCategories();
    loadBranches();
  }, []);

  // Main Data Loading
  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {
        page,
        limit,
        q: search || undefined,
        categoryId: selectedCategory || undefined,
        tab: activeTab,
        minStartDays: minStartDays ? Number(minStartDays) : undefined,
        minSoldDays: minSoldDays ? Number(minSoldDays) : undefined,
        minStock: minStock ? Number(minStock) : undefined,
        branchId: selectedBranch || undefined
      };

      const res = await productApi.getStorageDuration(params);
      setItems(res.items || []);
      setTotal(res.total || 0);
      
      // Update KPIs if returned from backend
      if (res.kpis) {
        setKpis(res.kpis);
      }
    } catch (err) {
      console.error('Error fetching storage duration data', err);
      setToast({ message: 'Không thể tải dữ liệu thời gian lưu kho.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Reload when page, tab, category, search queries or branch change
  useEffect(() => {
    loadData();
  }, [page, activeTab, selectedCategory, search, selectedBranch, fetchTrigger]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(tempSearch);
    if (page === 1) {
      setFetchTrigger(prev => prev + 1);
    } else {
      setPage(1);
    }
  };

  const handleClearFilters = () => {
    setTempSearch('');
    setSearch('');
    setSelectedCategory('');
    setMinStartDays('');
    setMinSoldDays('');
    setMinStock('');
    setSelectedBranch('');
    setPage(1);
  };

  // Discount (Xả hàng) Action handlers
  const handleOpenDiscount = (product: IStorageDuration) => {
    setDiscountProduct(product);
    setDiscountType('percent');
    setDiscountVal('10');
    setDiscountNote(`Chương trình khuyến mãi giảm giá xả hàng lưu kho lâu ngày.`);
  };

  const calculatedNewPrice = () => {
    if (!discountProduct) return 0;
    const originalPrice = discountProduct.price || 0;
    const value = Number(discountVal) || 0;
    if (discountType === 'percent') {
      return Math.max(0, originalPrice * (1 - value / 100));
    } else {
      return Math.max(0, originalPrice - value);
    }
  };

  const handleSubmitDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountProduct) return;
    
    try {
      const newPrice = calculatedNewPrice();
      await productApi.updateProduct(discountProduct._id, {
        price: newPrice,
        note: discountProduct.supplierName ? `${discountProduct.supplierName} - ${discountNote}` : discountNote
      } as any);
      setToast({ 
        message: `Đã áp dụng giảm giá cho sản phẩm ${discountProduct.code}. Giá mới: ${newPrice.toLocaleString('vi-VN')} đ`, 
        type: 'success' 
      });
      setDiscountProduct(null);
      loadData();
    } catch (err) {
      console.error('Failed to apply discount', err);
      setToast({ message: 'Có lỗi xảy ra khi áp dụng giảm giá xả hàng.', type: 'error' });
    }
  };

  // Return to Vendor Action handlers
  const handleOpenReturn = (product: IStorageDuration) => {
    if (!selectedBranch) {
      setToast({ message: 'Vui lòng chọn một chi nhánh cụ thể ở bộ lọc trước khi trả hàng.', type: 'error' });
      return;
    }
    setReturnProduct(product);
    setReturnQty(1);
    setReturnPrice(product.cost || 0);
    setReturnNote(`Trả hàng lưu kho lâu ngày không bán được cho nhà cung cấp.`);
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnProduct) return;

    if (!selectedBranch) {
      setToast({ message: 'Vui lòng chọn một chi nhánh cụ thể ở bộ lọc để trả hàng.', type: 'error' });
      return;
    }

    if (returnQty <= 0 || returnQty > (returnProduct.qty || 0)) {
      setToast({ message: 'Số lượng trả hàng không hợp lệ.', type: 'error' });
      return;
    }

    try {
      const targetBranchId = selectedBranch;
      // Calculate target global stock after returning
      const newGlobalQty = Math.max(0, (returnProduct.globalQty || returnProduct.qty || 0) - returnQty);

      // Create a completed stock adjustment to adjust both the global and branch-specific stocks
      const res = await http.post('/products/stock-adjustments', {
        code: `TRA-NCC-${Date.now().toString().slice(-6)}`,
        branchId: targetBranchId || undefined,
        balanceDate: new Date().toISOString().slice(0, 10),
        status: 'draft',
        note: `[TRẢ HÀNG NCC] ${returnProduct.name} (NCC: ${returnProduct.supplierName || 'Mặc định'}). Lý do: ${returnNote}`,
        items: [{
          productId: returnProduct._id,
          actualStock: newGlobalQty
        }]
      });

      await http.post(`/products/stock-adjustments/${res.data._id}/complete`);

      setToast({ 
        message: `Đã tạo phiếu trả hàng NCC thành công cho ${returnQty} sản phẩm ${returnProduct.code}.`, 
        type: 'success' 
      });
      setReturnProduct(null);
      loadData();
    } catch (err) {
      console.error('Failed to submit vendor return', err);
      setToast({ message: 'Có lỗi xảy ra khi lập phiếu trả hàng nhà cung cấp.', type: 'error' });
    }
  };

  // Export CSV helper
  const handleExportCSV = async () => {
    if (total === 0) {
      setToast({ message: 'Không có dữ liệu để xuất file.', type: 'error' });
      return;
    }
    
    try {
      setToast({ message: 'Đang tải dữ liệu để xuất CSV...', type: 'success' });
      
      const params: any = {
        page: 1,
        limit: 5000,
        q: search || undefined,
        categoryId: selectedCategory || undefined,
        tab: activeTab,
        minStartDays: minStartDays ? Number(minStartDays) : undefined,
        minSoldDays: minSoldDays ? Number(minSoldDays) : undefined,
        minStock: minStock ? Number(minStock) : undefined,
        branchId: selectedBranch || undefined
      };

      const res = await productApi.getStorageDuration(params);
      const exportItems = res.items || [];

      if (exportItems.length === 0) {
        setToast({ message: 'Không có dữ liệu để xuất.', type: 'error' });
        return;
      }

      // Build CSV content
      const headers = ['Mã sản phẩm', 'Tên sản phẩm', 'Danh mục', 'Nhà cung cấp', 'Giá nhập', 'Giá bán', 'Số lượng tồn', 'Số ngày lưu kho từ đầu', 'Số ngày từ XNK cuối', 'Số ngày từ lần bán cuối'];
      const rows = exportItems.map(item => [
        item.code,
        `"${item.name.replace(/"/g, '""')}"`,
        item.categoryName || '',
        item.supplierName || '',
        item.cost || 0,
        item.price || 0,
        item.qty || 0,
        item.daysFromStart,
        item.daysFromLast,
        item.daysFromLastSold !== null ? item.daysFromLastSold : 'Chưa bán'
      ]);
      
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `bao_cao_thoi_gian_luu_kho_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setToast({ message: 'Xuất file dữ liệu CSV thành công!', type: 'success' });
    } catch (err) {
      console.error('Lỗi khi xuất CSV', err);
      setToast({ message: 'Có lỗi xảy ra khi xuất dữ liệu.', type: 'error' });
    }
  };

  // Format helper functions
  const formatMoney = (val?: number) => {
    return `${Number(val || 0).toLocaleString('vi-VN')} đ`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  const getDaysStartBadgeClass = (days: number) => {
    if (days >= 90) return 'danger';
    if (days >= 30) return 'warning';
    return 'success';
  };

  return (
    <div className="workspace-page">
      {/* Toast Notification Banner */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: toast.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: toast.type === 'success' ? '#047857' : '#b91c1c',
          animation: 'slideIn 0.3s ease'
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Clock size={22} /></div>
          <div>
            <h1>Thời gian lưu kho</h1>
            <p>Theo dõi thời gian tồn kho lâu ngày để kịp thời khuyến mãi xả hàng hoặc trả lại nhà cung cấp.</p>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="metric-row">
        <div className="metric-card">
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Tổng sản phẩm lưu kho
            <Boxes size={18} style={{ color: 'var(--primary)' }} />
          </span>
          <strong>{kpis.totalProducts.toLocaleString('vi-VN')}</strong>
          <span style={{ fontSize: '11px', marginTop: '4px' }}>Hàng hóa đang còn tồn kho</span>
        </div>

        <div className="metric-card danger">
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Nhập lâu - Chưa bán
            <Clock size={18} style={{ color: 'var(--danger)' }} />
          </span>
          <strong>{kpis.unsoldLong.toLocaleString('vi-VN')}</strong>
          <span style={{ fontSize: '11px', marginTop: '4px' }}>Tồn kho ≥ 30 ngày & chưa bán</span>
        </div>

        <div className="metric-card warning">
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Sản phẩm bán chậm
            <Calendar size={18} style={{ color: 'var(--warning)' }} />
          </span>
          <strong>{kpis.slowSelling.toLocaleString('vi-VN')}</strong>
          <span style={{ fontSize: '11px', marginTop: '4px' }}>Ít nhất 30 ngày chưa bán được thêm</span>
        </div>

        <div className="metric-card success">
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Tổng giá trị tồn kho
            <DollarSign size={18} style={{ color: 'var(--success)' }} />
          </span>
          <strong>{formatMoney(kpis.totalValue)}</strong>
          <span style={{ fontSize: '11px', marginTop: '4px' }}>Tính theo giá trị vốn hàng hóa</span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="module-grid">
        {/* Sidebar Filters */}
        <aside className="filter-panel">
          <div className="panel-title">
            <Filter size={18} />
            <span>Bộ lọc báo cáo</span>
          </div>
          
          <form onSubmit={handleSearchSubmit}>
            <label className="field-label">Tìm kiếm</label>
            <div className="search-box">
              <Search size={16} style={{ color: 'var(--muted)' }} />
              <input 
                value={tempSearch} 
                onChange={(e) => setTempSearch(e.target.value)} 
                placeholder="Tên SP, mã SP..." 
              />
            </div>

            <label className="field-label" style={{ marginTop: '16px' }}>Chi nhánh</label>
            <select 
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '9px 11px',
                outline: '0',
                background: '#fff'
              }}
              value={selectedBranch} 
              onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }}
            >
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
              ))}
            </select>

            <label className="field-label" style={{ marginTop: '16px' }}>Nhóm sản phẩm</label>
            <select 
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '9px 11px',
                outline: '0',
                background: '#fff'
              }}
              value={selectedCategory} 
              onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>

            <div style={{ borderTop: '1px solid var(--border-soft)', margin: '20px 0 10px' }} />

            <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 800 }}>Lọc nâng cao</h4>

            <label className="field-label">Số ngày nhập đầu (≥)</label>
            <input 
              type="number" 
              min="0"
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 10px',
                outline: '0',
                background: '#fff'
              }}
              value={minStartDays}
              onChange={(e) => { setMinStartDays(e.target.value); setPage(1); }}
              placeholder="Ví dụ: 30"
            />

            <label className="field-label" style={{ marginTop: '12px' }}>Ngày không bán được (≥)</label>
            <input 
              type="number" 
              min="0"
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 10px',
                outline: '0',
                background: '#fff'
              }}
              value={minSoldDays}
              onChange={(e) => { setMinSoldDays(e.target.value); setPage(1); }}
              placeholder="Ví dụ: 30"
            />

            <label className="field-label" style={{ marginTop: '12px' }}>Tồn kho lớn hơn (≥)</label>
            <input 
              type="number" 
              min="1"
              style={{
                width: '100%',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 10px',
                outline: '0',
                background: '#fff'
              }}
              value={minStock}
              onChange={(e) => { setMinStock(e.target.value); setPage(1); }}
              placeholder="Ví dụ: 1"
            />

            <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                className="btn btn-light full" 
                onClick={handleClearFilters}
              >
                Xóa lọc
              </button>
              <button 
                type="submit" 
                className="btn btn-primary full"
              >
                Lọc
              </button>
            </div>
          </form>
        </aside>

        {/* Data List Panel */}
        <section className="data-card">
          {/* Table Header and Tabs */}
          <div className="data-card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Chi tiết lưu kho hàng hóa</h2>
                <span className="record-badge">{total} sản phẩm thỏa mãn</span>
              </div>
              <div className="page-actions" style={{ gap: '8px', display: 'flex' }}>
                <button className="btn btn-light" type="button" onClick={loadData} title="Làm mới">
                  <RefreshCw size={16} /> Làm mới
                </button>
                <button className="btn btn-success" type="button" onClick={handleExportCSV}>
                  <FileDown size={16} /> Xuất CSV
                </button>
              </div>
            </div>
            
            {/* Tab switchers */}
            <div className="workspace-tabs" role="tablist" aria-label="Storage tabs" style={{ borderBottom: 'none', paddingBottom: 0, marginTop: '8px' }}>
              <button 
                className={activeTab === 'all' ? 'active' : ''} 
                onClick={() => { setActiveTab('all'); setPage(1); }}
              >
                Tất cả ({kpis.totalProducts})
              </button>
              <button 
                className={activeTab === 'unsold_long' ? 'active' : ''} 
                onClick={() => { setActiveTab('unsold_long'); setPage(1); }}
              >
                Nhập lâu - Chưa bán ({kpis.unsoldLong})
              </button>
              <button 
                className={activeTab === 'slow_selling' ? 'active' : ''} 
                onClick={() => { setActiveTab('slow_selling'); setPage(1); }}
              >
                Bán chậm ({kpis.slowSelling})
              </button>
            </div>
          </div>
          
          {/* Table Area */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ảnh</th>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Nhóm / NCC</th>
                  <th>Giá nhập | Giá bán</th>
                  <th>Tồn kho</th>
                  <th>XNK Đầu / Cuối</th>
                  <th>Bán cuối</th>
                  <th>Lưu từ đầu</th>
                  <th>Lưu từ XNK cuối</th>
                  <th>Chưa bán ra</th>
                  <th className="action-cell">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={12} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={12} className="empty-cell">Không tìm thấy sản phẩm lưu kho phù hợp.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td>
                      {/* Beautiful placeholder image */}
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                      }}>
                        {item.name ? item.name.slice(0, 2).toUpperCase() : 'SP'}
                      </div>
                    </td>
                    <td><strong>{item.code}</strong></td>
                    <td style={{ maxWidth: '240px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }} title={item.name}>
                        {item.name}
                      </div>
                    </td>
                    <td>
                      <span>{item.categoryName || 'Chưa phân loại'}</span>
                      <small style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>
                        NCC: {item.supplierName || 'Mặc định'}
                      </small>
                    </td>
                    <td>
                      <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{formatMoney(item.cost)}</span>
                      <span style={{ margin: '0 6px', color: '#cbd5e1' }}>|</span>
                      <strong style={{ color: '#0f172a' }}>{formatMoney(item.price)}</strong>
                    </td>
                    <td>
                      <strong style={{ color: '#1e293b' }}>{Number(item.qty || 0).toLocaleString('vi-VN')}</strong>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', display: 'block' }}>{formatDate(item.firstTransactionDate)}</span>
                      <small style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>
                        Cuối: {formatDate(item.lastTransactionDate)}
                      </small>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px' }}>{formatDate(item.lastSoldDate)}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${getDaysStartBadgeClass(item.daysFromStart)}`}>
                        {item.daysFromStart} ngày
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', color: '#475569' }}>
                        {item.daysFromLast} ngày
                      </span>
                    </td>
                    <td>
                      {item.daysFromLastSold === null ? (
                        <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '12px' }}>Chưa bán lần nào</span>
                      ) : (
                        <span style={{ 
                          fontWeight: 600, 
                          color: item.daysFromLastSold >= 30 ? 'var(--danger)' : '#475569',
                          fontSize: '13px'
                        }}>
                          {item.daysFromLastSold} ngày
                        </span>
                      )}
                    </td>
                    <td className="action-cell">
                      <button 
                        className="mini-action" 
                        type="button"
                        onClick={() => handleOpenDiscount(item)}
                        style={{ color: 'var(--primary)', borderColor: '#bfdbfe' }}
                      >
                        <Percent size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                        Xả hàng
                      </button>
                      <button 
                        className="mini-action" 
                        type="button"
                        onClick={() => handleOpenReturn(item)}
                        style={{ color: 'var(--muted)' }}
                      >
                        Trả hàng
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </section>
      </div>

      {/* MODAL 1: Discount (Khuyến mãi xả hàng) */}
      {discountProduct && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDiscountProduct(null)}>
          <form 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            onSubmit={handleSubmitDiscount}
          >
            <div className="modal-header">
              <div>
                <h2>Lập khuyến mãi giảm giá xả hàng</h2>
                <p>Điều chỉnh giá bán mới cho sản phẩm để đẩy nhanh việc xả hàng tồn kho.</p>
              </div>
              <button 
                className="icon-button" 
                type="button" 
                onClick={() => setDiscountProduct(null)} 
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="form-grid">
              <div className="form-field wide">
                <span>Sản phẩm</span>
                <input 
                  value={`${discountProduct.code} - ${discountProduct.name}`} 
                  disabled 
                  style={{ background: '#f8fafc', fontWeight: 600 }}
                />
              </div>

              <div className="form-field">
                <span>Giá bán hiện tại</span>
                <input 
                  value={formatMoney(discountProduct.price)} 
                  disabled 
                  style={{ background: '#f8fafc', fontWeight: 500 }}
                />
              </div>

              <div className="form-field">
                <span>Giá vốn (Nhập)</span>
                <input 
                  value={formatMoney(discountProduct.cost)} 
                  disabled 
                  style={{ background: '#f8fafc' }}
                />
              </div>

              <div className="form-field">
                <span>Mức giảm giá</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="number" 
                    min="1"
                    value={discountVal} 
                    required
                    onChange={(e) => setDiscountVal(e.target.value)} 
                    style={{ flex: 1 }}
                  />
                  <select 
                    value={discountType} 
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    style={{ width: '90px' }}
                  >
                    <option value="percent">%</option>
                    <option value="amount">VNĐ</option>
                  </select>
                </div>
              </div>

              <div className="form-field">
                <span>Giá bán sau giảm</span>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  height: '42px', 
                  padding: '0 12px',
                  borderRadius: '8px', 
                  background: 'var(--success-soft)', 
                  border: '1px solid #10b981',
                  color: '#047857',
                  fontWeight: 700
                }}>
                  {formatMoney(calculatedNewPrice())}
                </div>
              </div>

              <div className="form-field wide">
                <span>Ghi chú khuyến mãi</span>
                <textarea 
                  rows={2} 
                  value={discountNote} 
                  onChange={(e) => setDiscountNote(e.target.value)} 
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-light" 
                type="button" 
                onClick={() => setDiscountProduct(null)}
              >
                Hủy
              </button>
              <button 
                className="btn btn-primary" 
                type="submit"
              >
                Áp dụng giá mới
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Return to Vendor (Trả hàng nhà cung cấp) */}
      {returnProduct && (
        <div className="modal-backdrop" role="presentation" onClick={() => setReturnProduct(null)}>
          <form 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            onSubmit={handleSubmitReturn}
          >
            <div className="modal-header">
              <div>
                <h2>Lập phiếu nháp trả hàng nhà cung cấp</h2>
                <p>Xuất trả số lượng tồn kho lâu ngày cho nhà cung cấp để nhận lại chi phí.</p>
              </div>
              <button 
                className="icon-button" 
                type="button" 
                onClick={() => setReturnProduct(null)} 
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="form-grid">
              <div className="form-field wide">
                <span>Sản phẩm xuất trả</span>
                <input 
                  value={`${returnProduct.code} - ${returnProduct.name}`} 
                  disabled 
                  style={{ background: '#f8fafc', fontWeight: 600 }}
                />
              </div>

              <div className="form-field">
                <span>Nhà cung cấp</span>
                <input 
                  value={returnProduct.supplierName || 'Mặc định'} 
                  disabled 
                  style={{ background: '#f8fafc' }}
                />
              </div>

              <div className="form-field">
                <span>Tồn kho hiện tại</span>
                <input 
                  value={`${returnProduct.qty} sản phẩm`} 
                  disabled 
                  style={{ background: '#f8fafc', fontWeight: 700 }}
                />
              </div>

              <div className="form-field">
                <span>Số lượng xuất trả</span>
                <input 
                  type="number" 
                  min="1" 
                  max={returnProduct.qty} 
                  required
                  value={returnQty} 
                  onChange={(e) => setReturnQty(Math.min(Number(returnProduct.qty || 1), Math.max(1, Number(e.target.value))))} 
                />
              </div>

              <div className="form-field">
                <span>Đơn giá hoàn tiền (thỏa thuận)</span>
                <input 
                  type="number" 
                  min="0" 
                  required
                  value={returnPrice} 
                  onChange={(e) => setReturnPrice(Number(e.target.value))} 
                />
              </div>

              <div className="form-field wide">
                <span>Lý do xuất trả</span>
                <textarea 
                  rows={2} 
                  value={returnNote} 
                  onChange={(e) => setReturnNote(e.target.value)} 
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-light" 
                type="button" 
                onClick={() => setReturnProduct(null)}
              >
                Hủy
              </button>
              <button 
                className="btn btn-primary" 
                type="submit"
              >
                Tạo phiếu trả hàng
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

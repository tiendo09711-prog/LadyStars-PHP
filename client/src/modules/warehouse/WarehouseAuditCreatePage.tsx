import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Plus, Search, Trash2, Printer, ClipboardCheck, PackageSearch } from 'lucide-react';
import { http } from '../../core/api/http';

type Product = {
  _id: string;
  code: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
  totalStock?: number;
  stockCN?: number;
  stockHanoi?: number;
  stockHCM?: number;
  unit?: string;
};

const getStockForWarehouse = (prod: Product, wh: string) => {
  if (wh.includes('trung tâm')) return prod.stockCN ?? prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('Hà Nội') || wh.includes('chính')) return prod.stockHanoi ?? prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('HCM') || wh.includes('Hồ Chí Minh')) return prod.stockHCM ?? prod.totalStock ?? prod.qty ?? 0;
  return prod.totalStock ?? prod.qty ?? 0;
};

type CheckProductLine = {
  _id?: string;
  productCode: string;
  productName: string;
  cost: number;
  price: number;
  stock: number;
  transferring: number;
  actualStock: number;
  difference: number;
  description: string;
};

const MOCK_PRODUCTS: Product[] = [
  { _id: 'mock-1', code: 'SP001', name: 'Kem chống nắng LadyStars SPF 50+', price: 150000, cost: 90000, qty: 120, unit: 'tuýp' },
  { _id: 'mock-2', code: 'SP002', name: 'Sữa rửa mặt dịu nhẹ LadyStars', price: 120000, cost: 70000, qty: 85, unit: 'chai' },
  { _id: 'mock-3', code: 'SP003', name: 'Serum tế bào gốc trẻ hóa da', price: 450000, cost: 280000, qty: 40, unit: 'lọ' },
  { _id: 'mock-4', code: 'SP004', name: 'Son dưỡng môi nhung mịn LadyStars', price: 95000, cost: 55000, qty: 150, unit: 'thỏi' },
];

export function WarehouseAuditCreatePage() {
  const navigate = useNavigate();
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    id: `PKK${Math.floor(Date.now() / 1000)}`,
    date: new Date().toISOString().slice(0, 10),
    warehouse: 'Chi nhánh trung tâm',
    type: 'Theo sản phẩm',
    note: '',
  });

  const [lines, setLines] = useState<CheckProductLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch products for dropdown search
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await http.get('/products/inventories', { params: { limit: 100 } });
        const items = response.data?.items;
        setDbProducts(items?.length ? items : MOCK_PRODUCTS);
      } catch {
        setDbProducts(MOCK_PRODUCTS);
      }
    };
    fetchProducts();
  }, []);

  // Update stock when warehouse changes
  useEffect(() => {
    if (dbProducts.length > 0 && lines.length > 0) {
      setLines(prev => prev.map(line => {
        const prod = dbProducts.find(p => p.code === line.productCode);
        if (prod) {
          const newStock = getStockForWarehouse(prod, form.warehouse);
          if (line.stock !== newStock) {
            return {
              ...line,
              stock: newStock,
              difference: line.actualStock - newStock
            };
          }
        }
        return line;
      }));
    }
  }, [form.warehouse, dbProducts]);

  const filteredSearchProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return dbProducts.filter(
      p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [searchQuery, dbProducts]);

  const addProductToLines = (product: Product) => {
    // Check duplicate
    if (lines.some(l => l.productCode === product.code)) {
      setSearchQuery('');
      setShowDropdown(false);
      return;
    }
    const currentStock = getStockForWarehouse(product, form.warehouse);
    const newLine: CheckProductLine = {
      productCode: product.code,
      productName: product.name,
      cost: product.cost || 0,
      price: product.price || 0,
      stock: currentStock,
      transferring: 0,
      actualStock: currentStock,
      difference: 0,
      description: '',
    };
    setLines(prev => [...prev, newLine]);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const updateLine = (index: number, field: keyof CheckProductLine, value: any) => {
    setLines(prev => {
      const next = [...prev];
      if (field === 'actualStock') {
        const actual = Number(value);
        next[index] = {
          ...next[index],
          actualStock: actual,
          difference: actual - next[index].stock,
        };
      } else {
        next[index] = {
          ...next[index],
          [field]: value,
        };
      }
      return next;
    });
  };

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.warehouse) {
      setError('Vui lòng chọn cửa hàng/kho.');
      return;
    }
    if (!form.date) {
      setError('Vui lòng chọn ngày kiểm.');
      return;
    }
    if (lines.length === 0) {
      setError('Vui lòng thêm ít nhất một sản phẩm vào phiếu kiểm.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // 1. Save general check
      await http.post('/warehouse/checks', {
        id: form.id,
        date: form.date,
        type: form.type,
        warehouse: form.warehouse,
        creator: 'LÊ SỸ BÁCH',
        spCount: lines.length,
        qty: lines.reduce((acc, p) => acc + p.actualStock, 0),
        note: form.note,
        missingSp: String(lines.filter(p => p.difference < 0).length),
        balance: lines.some(p => p.difference !== 0) ? 'Có' : 'Không',
      });

      // 2. Save check products
      for (const line of lines) {
        await http.post('/warehouse/check-products', {
          date: form.date,
          warehouse: form.warehouse,
          productName: line.productName,
          cost: line.cost,
          price: line.price,
          stock: line.stock,
          transferring: line.transferring,
          actualStock: line.actualStock,
          difference: line.difference,
          description: line.description,
        });
      }

      alert('Tạo phiếu kiểm kho thành công!');
      navigate('/warehouse/audit');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi lưu phiếu kiểm kho.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack" style={{ background: '#f8fafc', minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-light" onClick={() => navigate(-1)} style={{ width: 42, height: 42, padding: 0, justifyContent: 'center', borderRadius: 10 }}>
            <ArrowLeft size={20} />
          </button>
          <div className="page-icon" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', color: 'var(--primary)' }}>
            <ClipboardCheck size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Thêm mới phiếu kiểm kho</h1>
            <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '13px' }}>Tạo phiếu và kiểm đếm số lượng thực tế tại kho</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {error && <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '13px', background: '#fef2f2', padding: '6px 12px', borderRadius: '6px' }}>{error}</span>}
          <button className="btn btn-outline" style={{ background: '#fff' }} onClick={() => window.print()}>
            <Printer size={16} /> In mẫu kiểm kho
          </button>
          <button className="btn btn-outline" style={{ background: '#fff' }} onClick={() => alert('Chức năng Excel sẽ được cập nhật sớm.')}>
            <FileDown size={16} /> Nhập Excel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
            <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu phiếu'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>
        
        {/* Cột trái: Danh sách sản phẩm */}
        <div className="data-card" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
          {/* Thanh tìm kiếm */}
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: '12px', alignItems: 'center', position: 'relative' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Nhập tên sản phẩm hoặc mã vạch để thêm (F2)..." 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' }}
              />
              
              {/* Dropdown tìm kiếm */}
              {showDropdown && searchQuery && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#fff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  zIndex: 50,
                  maxHeight: '280px',
                  overflowY: 'auto',
                  marginTop: '4px'
                }}>
                  {filteredSearchProducts.length === 0 ? (
                    <div style={{ padding: '12px', color: '#64748b', textAlign: 'center' }}>Không tìm thấy sản phẩm</div>
                  ) : (
                    filteredSearchProducts.map(p => (
                      <div 
                        key={p._id}
                        onClick={() => addProductToLines(p)}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Mã: {p.code}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>Tồn: {p.qty}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            
            {showDropdown && (
              <button 
                className="btn btn-light" 
                onClick={() => {
                  setSearchQuery('');
                  setShowDropdown(false);
                }}
                style={{ padding: '10px 14px' }}
              >
                Đóng
              </button>
            )}
          </div>

          {/* Bảng sản phẩm */}
          <div className="table-scroll" style={{ padding: '0' }}>
            <table className="data-table">
              <thead style={{ background: '#f1f5f9' }}>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                  <th>Ảnh</th>
                  <th style={{ minWidth: '220px' }}>Tên sản phẩm</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Tồn phần mềm</th>
                  <th style={{ textAlign: 'center', width: '120px', color: '#0ea5e9' }}>Tồn thực tế</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>Chênh lệch</th>
                  <th>Lý do chênh lệch</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Xóa</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                      <PackageSearch size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontWeight: 500, fontSize: '15px' }}>Chưa có sản phẩm nào được chọn.</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1' }}>Vui lòng tìm kiếm và thêm sản phẩm để kiểm kho.</p>
                    </td>
                  </tr>
                ) : (
                  lines.map((p, index) => (
                    <tr key={p.productCode}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{index + 1}</td>
                      <td>
                        <div style={{
                          width: 40, height: 40, borderRadius: 6,
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#94a3b8', fontSize: '10px', fontWeight: 700
                        }}>IMG</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.productName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Mã: {p.productCode}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '15px', fontWeight: 500 }}>{p.stock}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="number" 
                          value={p.actualStock} 
                          onChange={(e) => updateLine(index, 'actualStock', e.target.value)}
                          style={{ width: '80px', textAlign: 'center', padding: '6px', border: '2px solid #38bdf8', borderRadius: '6px', fontWeight: 600, color: '#0369a1', outline: 'none' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: p.difference < 0 ? '#ef4444' : p.difference > 0 ? '#10b981' : '#64748b' }}>
                        {p.difference > 0 ? `+${p.difference}` : p.difference}
                      </td>
                      <td>
                        <input 
                          type="text" 
                          placeholder="Lý do..."
                          value={p.description} 
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="icon-button danger" onClick={() => removeLine(index)} title="Xóa">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {lines.length > 0 && (
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '32px' }}>
               <div style={{ textAlign: 'right' }}>
                 <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '2px' }}>Tổng Tồn phần mềm</div>
                 <div style={{ fontWeight: 700, fontSize: '16px', color: '#334155' }}>{lines.reduce((acc, p) => acc + p.stock, 0)}</div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '2px' }}>Tổng Tồn thực tế</div>
                 <div style={{ fontWeight: 700, fontSize: '16px', color: '#0ea5e9' }}>{lines.reduce((acc, p) => acc + p.actualStock, 0)}</div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '2px' }}>Tổng Lệch</div>
                 <div style={{ fontWeight: 700, fontSize: '16px', color: lines.reduce((acc, p) => acc + p.difference, 0) < 0 ? '#ef4444' : lines.reduce((acc, p) => acc + p.difference, 0) > 0 ? '#10b981' : '#64748b' }}>
                   {lines.reduce((acc, p) => acc + p.difference, 0) > 0 ? `+${lines.reduce((acc, p) => acc + p.difference, 0)}` : lines.reduce((acc, p) => acc + p.difference, 0)}
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* Cột phải: Thông tin chung */}
        <div className="filter-panel" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
            Thông tin phiếu
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Cửa hàng / Kho *</span>
              <select 
                value={form.warehouse} 
                onChange={(e) => setForm({...form, warehouse: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
              >
                <option value="Chi nhánh trung tâm">Chi nhánh trung tâm</option>
                <option value="Kho Hà Nội">Kho Hà Nội</option>
                <option value="Kho HCM">Kho HCM</option>
              </select>
            </label>

            <label className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Ngày kiểm *</span>
              <input 
                type="date" 
                value={form.date} 
                onChange={(e) => setForm({...form, date: e.target.value})} 
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
              />
            </label>

            <label className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Loại kiểm kho</span>
              <select 
                value={form.type} 
                onChange={(e) => setForm({...form, type: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
              >
                <option value="Theo sản phẩm">Theo sản phẩm</option>
                <option value="Tất cả sản phẩm">Tất cả sản phẩm</option>
                <option value="Theo danh mục">Theo danh mục</option>
              </select>
            </label>

            <label className="form-field wide" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>Ghi chú</span>
              <textarea 
                rows={4} 
                placeholder="Nhập ghi chú..." 
                value={form.note} 
                onChange={(e) => setForm({...form, note: e.target.value})} 
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', resize: 'none' }}
              />
            </label>

            <button 
              className="btn btn-primary" 
              onClick={handleSave} 
              disabled={saving} 
              style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px', padding: '10px', fontSize: '14px', marginTop: '8px' }}
            >
              <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu phiếu'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

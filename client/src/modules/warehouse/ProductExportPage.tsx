import { type FormEvent, useEffect, useMemo, useState , useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowLeft, Plus, Trash2, Settings2 } from 'lucide-react';
import { http } from '../../core/api/http';
import { useProductScanTarget } from '../../core/hooks/productScanner';

type Branch = {
  _id: string;
  name: string;
  code?: string;
  isActive?: boolean;
};

type Product = {
  _id: string;
  code: string;
  barcode?: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
  totalStock?: number;
  stockCN?: number;
  stockHanoi?: number;
  stockHCM?: number;
  selectedStock?: number;
  unit?: string;
};

const getStockForWarehouse = (prod: Product, _wh?: string, branch?: Branch) => {
  if (branch && typeof prod.selectedStock === 'number') return prod.selectedStock;
  const wh = branch?.name || _wh || '';
  if (wh.includes('trung tâm')) return prod.stockCN ?? prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('Hà Nội') || wh.includes('chính')) return prod.stockHanoi ?? prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('HCM') || wh.includes('Hồ Chí Minh')) return prod.stockHCM ?? prod.totalStock ?? prod.qty ?? 0;
  return prod.totalStock ?? prod.qty ?? 0;
};

type ExportLine = {
  productId: string;
  batchCode: string;
  unit: string;
  remainQty: number;
  quantity: number;
  price: number;
  discountValue: number;
  discountType: '%' | 'đ';
  vatValue: number;
  vatType: '%' | 'đ';
  errorQuantity: number;
  weight: number;
  note: string;
};


export function ProductExportPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sysBranches, setSysBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [exportType, setExportType] = useState('Xuất trả hàng');
  const [supplierCustomer, setSupplierCustomer] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [showProductNoteAll, setShowProductNoteAll] = useState(false);
  const [afterSubmitAction, setAfterSubmitAction] = useState<'detail' | 'continue'>('detail');

  // Search query (F3)
  const [searchQuery, setSearchQuery] = useState('');
  const productSearchRef = useRef<HTMLInputElement>(null);

  // Column visibility states
  const [colVisible, setColVisible] = useState({
    stt: true,
    batch: true,
    unit: true,
    remain: true,
    totalPrice: true,
    discount: true,
    vat: true,
    errorQty: true,
    weight: true,
  });

  const [showConfig, setShowConfig] = useState(false);

  // Table rows
  const [lines, setLines] = useState<ExportLine[]>([]);

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const response = await http.get('/products/inventories', { params: { limit: 100 } });
        setProducts(response.data?.items ?? []);
      } catch (err) {
        console.warn('Failed to load products from API.', err);
        setProducts([]);
        setError('Không tải được danh sách sản phẩm từ máy chủ.');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
    http.get('/customers/customers').then(res => setCustomers(res.data.items || [])).catch(() => {});
    http.get('/system/branches').then(res => {
      const branches = res.data.items || [];
      setSysBranches(branches);
    }).catch(() => {});
  }, []);

  // Update remainQty when warehouse changes
  useEffect(() => {
    if (products.length > 0 && lines.length > 0) {
      setLines(current => current.map(line => {
        const prod = products.find(p => p._id === line.productId);
        if (prod) {
          const newQty = getStockForWarehouse(prod, warehouse, selectedBranch || undefined);
          if (line.remainQty !== newQty) {
            return { ...line, remainQty: newQty };
          }
        }
        return line;
      }));
    }
  }, [warehouse, products]);

  // Initialize with one line when products are loaded
  useEffect(() => {
    if (products.length > 0 && lines.length === 0) {
      const first = products[0];
      setLines([createLineObj(first)]);
    }
  }, [products]);

  const createLineObj = (prod: Product): ExportLine => ({
    productId: prod._id,
    batchCode: '',
    unit: prod.unit || 'cái',
    remainQty: getStockForWarehouse(prod, warehouse, selectedBranch || undefined),
    quantity: 1,
    price: prod.price || 0,
    discountValue: 0,
    discountType: '%',
    vatValue: 0,
    vatType: '%',
    errorQuantity: 0,
    weight: 0,
    note: '',
  });

  const addLine = () => {
    if (products.length === 0) return;
    const first = products[0];
    setLines(current => [...current, createLineObj(first)]);
  };

  const removeLine = (idx: number) => {
    setLines(current => current.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<ExportLine>) => {
    setLines(current => current.map((line, i) => {
      if (i !== idx) return line;
      const next = { ...line, ...patch };
      
      // If product changed, update fields
      if (patch.productId) {
        const prod = products.find(p => p._id === patch.productId);
        if (prod) {
          next.unit = prod.unit || 'cái';
          next.remainQty = getStockForWarehouse(prod, warehouse, selectedBranch || undefined);
          next.price = prod.price || 0;
        }
      }
      return next;
    }));
  };

  // F3 search handles adding products
  const handleProductScan = (rawBarcode: string) => {
    const lower = rawBarcode.trim().toLowerCase();
    const barcodeMatches = products.filter((p) => String(p.barcode || '').trim().toLowerCase() === lower);
    const codeMatches = barcodeMatches.length ? [] : products.filter((p) => String(p.code || '').trim().toLowerCase() === lower);
    const exactMatches = barcodeMatches.length ? barcodeMatches : codeMatches;
    if (exactMatches.length === 1) {
      setLines(current => [...current, createLineObj(exactMatches[0])]);
      setSearchQuery('');
      window.setTimeout(() => productSearchRef.current?.focus(), 0);
      return;
    }
    setSearchQuery(rawBarcode.trim());
  };

  useProductScanTarget(productSearchRef, handleProductScan);

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      e.preventDefault();
      const matched = products.find(p => 
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matched) {
        setLines(current => [...current, createLineObj(matched)]);
        setSearchQuery('');
      } else {
        alert('Không tìm thấy sản phẩm phù hợp!');
      }
    }
  };

  // Register Global Key Listeners for F3 Focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        const searchInput = document.getElementById('product-f3-search');
        if (searchInput) {
          searchInput.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute row total
  const getLineTotal = (line: ExportLine) => {
    const qty = Number(line.quantity || 0);
    const price = Number(line.price || 0);
    let amount = qty * price;
    
    // Apply discount
    if (line.discountType === '%') {
      amount -= amount * (Number(line.discountValue || 0) / 100);
    } else {
      amount -= Number(line.discountValue || 0);
    }

    // Apply VAT
    if (line.vatType === '%') {
      amount += amount * (Number(line.vatValue || 0) / 100);
    } else {
      amount += Number(line.vatValue || 0);
    }

    return Math.max(0, amount);
  };

  // Compute final totals
  const totals = useMemo(() => {
    return lines.reduce((sum, line) => {
      const lineTotal = getLineTotal(line);
      return {
        quantity: sum.quantity + Number(line.quantity || 0),
        weight: sum.weight + (Number(line.weight || 0) * Number(line.quantity || 0)),
        totalPrice: sum.totalPrice + lineTotal
      };
    }, { quantity: 0, weight: 0, totalPrice: 0 });
  }, [lines]);

  const money = (val: number) => {
    return `${val.toLocaleString('vi-VN')} đ`;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const validLines = lines.filter(l => l.productId && Number(l.quantity) > 0);
    if (!selectedBranch || !warehouse) {
      setError('Vui lòng chọn Kho thực hiện trước khi tạo phiếu xuất kho.');
      return;
    }
    if (validLines.length === 0) {
      setError('Phiếu xuất kho phải có ít nhất một sản phẩm với số lượng lớn hơn 0.');
      return;
    }

    // Validate stock levels
    for (const line of validLines) {
      const prod = products.find(p => p._id === line.productId);
      if (prod && Number(line.quantity) > Number(line.remainQty)) {
        setError(`Sản phẩm ${prod.code} không đủ tồn kho để xuất. Tồn kho hiện tại: ${line.remainQty}`);
        return;
      }
    }

    // Generate custom code (mock)
    const mockVoucherId = 'PXK-' + Math.floor(Math.random() * 900000 + 100000);

    try {
      // Post to our API
      await http.post('/warehouse/vouchers', {
        voucherId: mockVoucherId,
        date: new Date().toISOString().slice(0, 10),
        warehouse,
        type: exportType,
        supplier: supplierCustomer,
        spCount: validLines.length,
        qty: totals.quantity,
        totalAmount: totals.totalPrice,
        discount: lines.reduce((sum, l) => sum + (l.discountType === 'đ' ? l.discountValue : 0), 0),
        creator: 'Admin',
        note: note || `Xuất kho tự động - Loại: ${exportType}`,
      });

      setSuccessMsg(`Tạo thành công phiếu xuất kho ${mockVoucherId}!`);
      
      // Post actual product details
      for (const line of validLines) {
        const prod = products.find(p => p._id === line.productId);
        if (prod) {
          try {
            await http.post('/warehouse/products', {
              id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
              voucherId: mockVoucherId,
              date: new Date().toISOString().slice(0, 10),
              warehouse,
              productCode: prod.code,
              productName: prod.name,
              type: 'export',
              importQty: 0,
              exportQty: line.quantity,
              price: line.price,
              totalAmount: getLineTotal(line),
              creator: 'Admin',
            });
          } catch (lineErr) {
            console.error('Failed to post product detail', lineErr);
          }
        }
      }

      setTimeout(() => {
        if (afterSubmitAction === 'detail') {
          navigate('/warehouse/transactions');
        } else {
          // Reset page state to add another
          setLines([]);
          setNote('');
          setTags('');
          setSuccessMsg('');
        }
      }, 1500);

    } catch (err: any) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra khi lưu phiếu xuất kho.');
    }
  };

  return (
    <div className="workspace-page compact-page">
      {/* Page Heading */}
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
            <ArrowUpRight size={22} />
          </div>
          <div>
            <h1>Xuất kho (Sản phẩm xuất nhập kho)</h1>
            <p>Xuất sản phẩm từ kho</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transactions')}>
            <ArrowLeft size={16} /> Quay lại
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={!selectedBranch} style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}>
            Lưu phiếu xuất
          </button>
        </div>
      </div>

      {/* Main Form Section */}
      <form onSubmit={handleSave} className="page-stack">
        {successMsg && (
          <div className="status-badge success" style={{ padding: '12px 18px', borderRadius: '8px', display: 'block', width: '100%', fontSize: '14px' }}>
            {successMsg}
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="data-card">
          <div className="data-card-header">
            <h2>Thông tin phiếu xuất</h2>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span>Kho thực hiện *</span>
              <select value={warehouse} onChange={(e) => {
                setWarehouse(e.target.value);
                const branch = sysBranches.find(b => b.name === e.target.value) || null;
                setSelectedBranch(branch);
              }}>
                <option value="">-- Chọn kho thực hiện --</option>
                {sysBranches.filter(b => b.isActive !== false).map(b => (
                  <option key={b._id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Loại trả hàng *</span>
              <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
                <option value="Xuất trả hàng">Xuất trả hàng (Cho NCC)</option>
                <option value="Xuất bán lẻ">Xuất bán hàng / Bán lẻ</option>
                <option value="Xuất chuyển kho">Xuất chuyển kho nội bộ</option>
                <option value="Xuất hủy/Hao hụt">Xuất hủy / Hao hụt / Hỏng</option>
              </select>
            </label>

            {exportType === 'Xuất trả hàng' && (
              <label className="form-field">
                <span>Nhà cung cấp (Hoàn trả)</span>
                <input type="text" value={supplierCustomer} onChange={(e) => setSupplierCustomer(e.target.value)} placeholder="Nhập tên nhà cung cấp..." />
              </label>
            )}

            {exportType === 'Xuất bán lẻ' && (
              <label className="form-field">
                <span>Khách hàng</span>
                <select value={supplierCustomer} onChange={(e) => setSupplierCustomer(e.target.value)}>
                  <option value="">-- Chọn khách hàng --</option>
                  {customers.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
            )}

            {exportType === 'Xuất chuyển kho' && (
              <label className="form-field">
                <span>Đến kho hàng</span>
                <select value={supplierCustomer} onChange={(e) => setSupplierCustomer(e.target.value)}>
                  <option value="">-- Chọn kho nhập --</option>
                  {sysBranches.map(b => <option key={b._id} value={b.name}>{b.name}</option>)}
                </select>
              </label>
            )}

            {exportType === 'Xuất hủy/Hao hụt' && (
              <label className="form-field">
                <span>Đối tác / Lý do hủy</span>
                <input type="text" value={supplierCustomer} onChange={(e) => setSupplierCustomer(e.target.value)} placeholder="Nhập tên đối tác hoặc lý do..." />
              </label>
            )}

            <label className="form-field">
              <span>Nhãn</span>
              <input value={tags} placeholder="Nhãn phân loại phiếu (ngăn cách bằng dấu phẩy)" onChange={(e) => setTags(e.target.value)} />
            </label>

            <label className="form-field wide">
              <span>Ghi chú</span>
              <textarea rows={2} value={note} placeholder="Nhập ghi chú cho toàn bộ phiếu xuất" onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="form-field wide" style={{ flexDirection: 'row', gap: '20px', flexWrap: 'wrap', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                <input type="checkbox" checked={showProductNoteAll} onChange={(e) => setShowProductNoteAll(e.target.checked)} />
                Hiện ô nhập ghi chú cho tất cả sản phẩm
              </label>
            </div>
          </div>
        </div>

        {/* Product Details Section */}
        <div className="data-card">
          <div className="data-card-header" style={{ borderBottom: 'none', paddingBottom: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ marginBottom: '2px' }}>Chi tiết sản phẩm xuất</h2>
                <span className="record-badge">{lines.length} sản phẩm trong danh sách</span>
              </div>

              {/* F3 Search Bar */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: '320px' }}>
                <div className="search-box" style={{ flex: 1 }}>
                  <input
                    id="product-f3-search" ref={productSearchRef} data-product-search-scan="true" data-product-search-primary="true"
                    value={searchQuery}
                    placeholder="Gõ mã/tên hàng và nhấn Enter (F3)"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyPress}
                  />
                </div>
                
                {/* Column Config Dropdown Toggle */}
                <div className="dropdown-container">
                  <button 
                    type="button" 
                    className="btn btn-light" 
                    title="Ẩn/Hiện cột"
                    onClick={() => setShowConfig(!showConfig)}
                    style={{ minHeight: '38px', padding: '0 10px' }}
                  >
                    <Settings2 size={18} />
                  </button>

                  {showConfig && (
                    <div className="dropdown-menu" style={{ display: 'flex', padding: '10px', gap: '8px', width: '220px', zIndex: '99', right: '0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                        Cấu hình cột hiển thị
                      </span>
                      {Object.keys(colVisible).map((key) => {
                        const colKey = key as keyof typeof colVisible;
                        const labelMap: Record<string, string> = {
                          stt: 'Số thứ tự (#)',
                          batch: 'Lô hàng',
                          unit: 'Đơn vị tính',
                          remain: 'Số tồn',
                          totalPrice: 'Thành tiền',
                          discount: 'Chiết khấu',
                          vat: 'VAT',
                          errorQty: 'Số lượng lỗi',
                          weight: 'Khối lượng',
                        };
                        return (
                          <label key={colKey} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                            <input 
                              type="checkbox" 
                              checked={colVisible[colKey]} 
                              onChange={(e) => setColVisible(prev => ({ ...prev, [colKey]: e.target.checked }))} 
                            />
                            {labelMap[colKey]}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="line-editor" style={{ marginTop: '16px' }}>
            <div className="line-editor-header" style={{ marginBottom: '10px' }}>
              <strong>Danh sách hàng xuất</strong>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" type="button" onClick={() => navigate('/warehouse/transactions/vouchers/excel')}>
                  Thêm sản phẩm từ file Excel
                </button>
                <button className="btn btn-light" type="button" onClick={addLine}>
                  <Plus size={16} /> Thêm dòng
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    {colVisible.stt && <th style={{ width: '50px' }}>#</th>}
                    <th>Sản phẩm</th>
                    {colVisible.batch && <th>Lô hàng</th>}
                    {colVisible.unit && <th>ĐVT</th>}
                    {colVisible.remain && <th>Tồn</th>}
                    <th style={{ width: '100px' }}>Số lượng</th>
                    <th style={{ width: '130px' }}>Giá xuất</th>
                    {colVisible.discount && <th style={{ width: '130px' }}>Chiết khấu</th>}
                    {colVisible.vat && <th style={{ width: '110px' }}>VAT</th>}
                    {colVisible.errorQty && <th style={{ width: '100px' }}>SL lỗi</th>}
                    {colVisible.weight && <th style={{ width: '100px' }}>K.Lượng (g)</th>}
                    {colVisible.totalPrice && <th style={{ width: '130px', textAlign: 'right' }}>Thành tiền</th>}
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    return (
                      <tr key={idx}>
                        {colVisible.stt && <td>{idx + 1}</td>}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select 
                              value={line.productId} 
                              onChange={(e) => updateLine(idx, { productId: e.target.value })}
                              style={{ width: '100%', minWidth: '220px' }}
                            >
                              {products.map(p => (
                                <option key={p._id} value={p._id}>
                                  [{p.code}] {p.name}
                                </option>
                              ))}
                            </select>
                            {(showProductNoteAll || line.note) && (
                              <input
                                placeholder="Ghi chú cho sản phẩm này..."
                                value={line.note}
                                onChange={(e) => updateLine(idx, { note: e.target.value })}
                                style={{ fontSize: '12px', padding: '4px 8px', width: '100%', borderStyle: 'dashed' }}
                              />
                            )}
                          </div>
                        </td>
                        {colVisible.batch && (
                          <td>
                            <input 
                              placeholder="Mã lô" 
                              value={line.batchCode} 
                              onChange={(e) => updateLine(idx, { batchCode: e.target.value })} 
                              style={{ minWidth: '90px' }}
                            />
                          </td>
                        )}
                        {colVisible.unit && (
                          <td>
                            <input 
                              value={line.unit} 
                              onChange={(e) => updateLine(idx, { unit: e.target.value })} 
                              style={{ width: '60px', minWidth: '60px' }}
                            />
                          </td>
                        )}
                        {colVisible.remain && (
                          <td>
                            <span style={{ fontSize: '13px', color: Number(line.quantity) > Number(line.remainQty) ? 'var(--danger)' : 'var(--muted)', fontWeight: 600 }}>
                              {line.remainQty}
                            </span>
                          </td>
                        )}
                        <td>
                          <input 
                            type="number" 
                            min={1} 
                            max={line.remainQty}
                            value={line.quantity} 
                            onChange={(e) => updateLine(idx, { quantity: Number(e.target.value || 1) })} 
                            style={{ width: '70px', minWidth: '70px', padding: '6px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            min={0} 
                            value={line.price} 
                            onChange={(e) => updateLine(idx, { price: Number(e.target.value || 0) })} 
                            style={{ width: '100px', minWidth: '100px', padding: '6px' }}
                          />
                        </td>
                        {colVisible.discount && (
                          <td>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                              <input 
                                type="number" 
                                min={0} 
                                value={line.discountValue} 
                                onChange={(e) => updateLine(idx, { discountValue: Number(e.target.value || 0) })} 
                                style={{ width: '70px', minWidth: '70px', padding: '6px' }}
                              />
                              <select 
                                value={line.discountType} 
                                onChange={(e) => updateLine(idx, { discountType: e.target.value as '%' | 'đ' })}
                                style={{ width: '45px', minWidth: '45px', padding: '6px' }}
                              >
                                <option value="%">%</option>
                                <option value="đ">đ</option>
                              </select>
                            </div>
                          </td>
                        )}
                        {colVisible.vat && (
                          <td>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                              <input 
                                type="number" 
                                min={0} 
                                value={line.vatValue} 
                                onChange={(e) => updateLine(idx, { vatValue: Number(e.target.value || 0) })} 
                                style={{ width: '55px', minWidth: '55px', padding: '6px' }}
                              />
                              <select 
                                value={line.vatType} 
                                onChange={(e) => updateLine(idx, { vatType: e.target.value as '%' | 'đ' })}
                                style={{ width: '45px', minWidth: '45px', padding: '6px' }}
                              >
                                <option value="%">%</option>
                                <option value="đ">đ</option>
                              </select>
                            </div>
                          </td>
                        )}
                        {colVisible.errorQty && (
                          <td>
                            <input 
                              type="number" 
                              min={0} 
                              max={line.quantity}
                              value={line.errorQuantity} 
                              onChange={(e) => updateLine(idx, { errorQuantity: Number(e.target.value || 0) })} 
                              style={{ width: '65px', minWidth: '65px', padding: '6px' }}
                            />
                          </td>
                        )}
                        {colVisible.weight && (
                          <td>
                            <input 
                              type="number" 
                              min={0} 
                              value={line.weight} 
                              onChange={(e) => updateLine(idx, { weight: Number(e.target.value || 0) })} 
                              style={{ width: '70px', minWidth: '70px', padding: '6px' }}
                            />
                          </td>
                        )}
                        {colVisible.totalPrice && (
                          <td style={{ textAlign: 'right', fontWeight: '700', fontSize: '13px' }}>
                            {money(getLineTotal(line))}
                          </td>
                        )}
                        <td>
                          <button className="icon-button danger" type="button" onClick={() => removeLine(idx)}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td className="empty-cell" colSpan={13}>Chưa có sản phẩm nào được thêm. Nhấp vào "Thêm dòng" để bắt đầu.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Sumary strip */}
            <div className="summary-strip" style={{ marginTop: '16px' }}>
              <span>Tổng số lượng: <strong>{totals.quantity.toLocaleString('vi-VN')}</strong></span>
              {colVisible.weight && <span>Tổng khối lượng: <strong>{totals.weight.toLocaleString('vi-VN')} g</strong></span>}
              <span>Tổng tiền xuất: <strong style={{ color: 'var(--danger)', fontSize: '15px' }}>{money(totals.totalPrice)}</strong></span>
            </div>
          </div>
        </div>

        {/* Submission options and actions */}
        <div className="data-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--muted)' }}>Sau khi lưu phiếu:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                <input 
                  type="radio" 
                  name="afterSubmit" 
                  checked={afterSubmitAction === 'detail'} 
                  onChange={() => setAfterSubmitAction('detail')} 
                />
                Xem chi tiết danh sách phiếu
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                <input 
                  type="radio" 
                  name="afterSubmit" 
                  checked={afterSubmitAction === 'continue'} 
                  onChange={() => setAfterSubmitAction('continue')} 
                />
                Tiếp tục thêm phiếu mới
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transactions')}>
                Hủy bỏ
              </button>
              <button className="btn btn-primary" type="submit" disabled={!selectedBranch} style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}>
                Lưu & Hoàn tất
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { 
  Package, Search, Check, AlertTriangle, Trash2, Printer, 
  Plus, Save, FileText, ChevronRight, User, ShoppingBag, 
  MapPin, CreditCard, Scale, Box, Info, X, RotateCcw
} from 'lucide-react';
import { http } from '../../core/api/http';

export function OrdersPackagingPage() {
  // --- States ---
  const [warehouse, setWarehouse] = useState<string>('');
  const [branches, setBranches] = useState<any[]>([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  
  // Current scanning order state
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  
  // Packaging form fields
  const [packageWeight, setPackageWeight] = useState<number>(0.5);
  const [packagingMaterial, setPackagingMaterial] = useState<string>('Hộp carton');
  const [packer, setPacker] = useState<string>('Hệ thống');

  // Recently packed orders list
  const [packedOrders, setPackedOrders] = useState<any[]>([]);
  const [selectedPackedIds, setSelectedPackedIds] = useState<Set<string>>(new Set());

  // Handover records list
  const [handoverRecords, setHandoverRecords] = useState<any[]>([]);
  const [selectedHandoverId, setSelectedHandoverId] = useState<string>('');

  // Status message log for the workspace
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Create handover record modal state
  const [showNewHandoverModal, setShowNewHandoverModal] = useState<boolean>(false);
  const [newHandover, setNewHandover] = useState({
    carrier: 'Giao hàng nhanh',
    handoverStaff: 'Nhân viên kho',
    carrierStaff: '',
    handoverDate: new Date().toISOString().split('T')[0]
  });

  // --- Refs ---
  const orderInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  // --- Audio Feedback Synthesis ---
  const playAudioFeedback = (type: 'success' | 'error' | 'victory') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playBeep = (freq: number, duration: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      if (type === 'success') {
        playBeep(880, 0.08, now);
        playBeep(880, 0.08, now + 0.1);
      } else if (type === 'error') {
        playBeep(180, 0.35, now);
      } else if (type === 'victory') {
        // C-major arpeggio: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
        playBeep(523.25, 0.12, now);
        playBeep(659.25, 0.12, now + 0.12);
        playBeep(783.99, 0.12, now + 0.24);
        playBeep(1046.50, 0.25, now + 0.36);
      }
    } catch (e) {
      console.error('Audio synthesis failed:', e);
    }
  };

  // --- Log helper ---
  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    setLogs(prev => [`[${time}] ${text}`, ...prev.slice(0, 19)]);
  };

  // --- On Mount ---
  useEffect(() => {
    // 1. Fetch current packer name
    http.get('/auth/me')
      .then(res => {
        if (res.data && res.data.name) {
          setPacker(res.data.name);
        }
      })
      .catch(() => {});

    // 2. Fetch warehouses/branches
    http.get('/system/branches')
      .then(res => {
        const items = res.data.items || [];
        setBranches(items);
        if (items.length > 0) {
          setWarehouse(items[0].name);
        }
      })
      .catch(err => {
        console.error('Lỗi khi tải kho hàng:', err);
      });

    // 3. Load lists
    loadPackedData();
    loadHandovers();

    // 4. Hotkeys F3 and F4
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        orderInputRef.current?.focus();
        orderInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        productInputRef.current?.focus();
        productInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Data Loading ---
  const loadPackedData = async () => {
    try {
      const orderRes = await http.get('/orders/manage', { params: { status: 'Đã đóng gói' } });
      const ordersList = orderRes.data.items || [];
      
      const merged = ordersList.map((order: any) => {
        return {
          ...order,
          packer: order.packer || 'Hệ thống',
          packageWeight: order.packageWeight || 0.5,
          packagingMaterial: order.packagingMaterial || 'Hộp carton',
          packedAt: order.packedAt || new Date(order.updatedAt).toLocaleString('vi-VN')
        };
      }).sort((a: any, b: any) => b.orderCode.localeCompare(a.orderCode));
      
      setPackedOrders(merged);
    } catch (err) {
      console.error('Lỗi tải danh sách đóng gói:', err);
    }
  };

  const loadHandovers = async () => {
    try {
      const res = await http.get('/orders/handover');
      const list = res.data.items || [];
      setHandoverRecords(list);
      if (list.length > 0 && !selectedHandoverId) {
        setSelectedHandoverId(list[0]._id);
      }
    } catch (err) {
      console.error('Lỗi tải biên bản bàn giao:', err);
    }
  };

  // --- Barcode Scan Handlers ---
  const handleScanOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = orderSearchQuery.trim();
    if (!query) return;

    setStatusMessage(null);
    try {
      const res = await http.get('/orders/packaging/scan', { params: { query } });
      const order = res.data;

      if (order.status === 'Đã đóng gói') {
        playAudioFeedback('error');
        setStatusMessage({ text: `Đơn hàng ${order.orderCode} đã được đóng gói trước đó!`, type: 'error' });
        addLog(`Đơn hàng ${order.orderCode} đã ở trạng thái Đã đóng gói.`);
        return;
      }

      // Initialize scannedQuantity if missing or reset
      const products = (order.products || []).map((p: any) => ({
        ...p,
        scannedQuantity: p.scannedQuantity || 0
      }));

      setActiveOrder({
        ...order,
        products
      });

      playAudioFeedback('success');
      setStatusMessage({ text: `Đã nạp đơn hàng ${order.orderCode} thành công.`, type: 'success' });
      addLog(`Nạp đơn hàng ${order.orderCode} (Khách hàng: ${order.customerName}).`);
      
      // Auto focus product scanner input
      setProductSearchQuery('');
      setTimeout(() => {
        productInputRef.current?.focus();
      }, 80);
    } catch (err: any) {
      playAudioFeedback('error');
      const msg = err.response?.data?.message || 'Không tìm thấy mã đơn hàng này!';
      setStatusMessage({ text: msg, type: 'error' });
      addLog(`Lỗi quét đơn hàng: ${msg}`);
      setActiveOrder(null);
    }
  };

  const handleScanProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const sku = productSearchQuery.trim();
    if (!sku || !activeOrder) return;

    // Try exact sku match, fallback to case-insensitive match
    let foundIndex = activeOrder.products.findIndex((p: any) => p.sku === sku);
    if (foundIndex === -1) {
      foundIndex = activeOrder.products.findIndex(
        (p: any) => p.sku.toLowerCase() === sku.toLowerCase()
      );
    }

    if (foundIndex === -1) {
      playAudioFeedback('error');
      setStatusMessage({ text: `Sản phẩm SKU "${sku}" không thuộc đơn hàng này!`, type: 'error' });
      addLog(`Sản phẩm SKU "${sku}" không khớp với đơn hàng.`);
      return;
    }

    const targetProduct = activeOrder.products[foundIndex];
    if (targetProduct.scannedQuantity >= targetProduct.quantity) {
      playAudioFeedback('error');
      setStatusMessage({ 
        text: `Sản phẩm "${targetProduct.productName}" đã quét đủ số lượng cần nhặt!`, 
        type: 'error' 
      });
      addLog(`Sản phẩm SKU "${sku}" đã quét đủ (${targetProduct.quantity}/${targetProduct.quantity}).`);
      return;
    }

    // Update scanned quantity
    const updatedProducts = [...activeOrder.products];
    updatedProducts[foundIndex] = {
      ...targetProduct,
      scannedQuantity: targetProduct.scannedQuantity + 1
    };

    const newOrder = {
      ...activeOrder,
      products: updatedProducts
    };

    setActiveOrder(newOrder);
    playAudioFeedback('success');
    setStatusMessage({ 
      text: `Đã quét thêm 1 "${targetProduct.productName}" (${updatedProducts[foundIndex].scannedQuantity}/${targetProduct.quantity})`, 
      type: 'success' 
    });
    addLog(`Đã quét SKU ${sku} (${updatedProducts[foundIndex].scannedQuantity}/${targetProduct.quantity}).`);
    setProductSearchQuery('');

    // Check if fully scanned
    const allScanned = updatedProducts.every((p: any) => p.scannedQuantity >= p.quantity);
    if (allScanned) {
      addLog(`Tất cả sản phẩm trong đơn ${activeOrder.orderCode} đã quét đủ! Đang tiến hành lưu đóng gói tự động...`);
      handleSavePackaging(newOrder, false);
    }
  };

  const handleManualCompleteProduct = (sku: string) => {
    if (!activeOrder) return;
    const updatedProducts = activeOrder.products.map((p: any) => {
      if (p.sku === sku) {
        addLog(`Đánh dấu hoàn thành nhặt hàng SKU ${sku} (${p.quantity}/${p.quantity}).`);
        return { ...p, scannedQuantity: p.quantity };
      }
      return p;
    });

    const newOrder = { ...activeOrder, products: updatedProducts };
    setActiveOrder(newOrder);
    playAudioFeedback('success');

    const allScanned = updatedProducts.every((p: any) => p.scannedQuantity >= p.quantity);
    if (allScanned) {
      handleSavePackaging(newOrder, false);
    }
  };

  const handleResetProductScan = (sku: string) => {
    if (!activeOrder) return;
    const updatedProducts = activeOrder.products.map((p: any) => {
      if (p.sku === sku) {
        addLog(`Reset số lượng quét SKU ${sku} về 0.`);
        return { ...p, scannedQuantity: 0 };
      }
      return p;
    });
    setActiveOrder({ ...activeOrder, products: updatedProducts });
  };

  // --- Save / Packing Action ---
  const handleSavePackaging = async (orderToPack: any, force: boolean) => {
    if (!orderToPack) return;
    try {
      const res = await http.post(`/orders/packaging/${orderToPack._id}/pack`, {
        products: orderToPack.products,
        packageWeight,
        packagingMaterial,
        packer,
        forcePack: force
      });

      if (res.data.success) {
        playAudioFeedback('victory');
        setStatusMessage({ text: `Đã đóng gói thành công đơn hàng ${orderToPack.orderCode}!`, type: 'success' });
        addLog(`Đóng gói thành công đơn ${orderToPack.orderCode}.`);
        setActiveOrder(null);
        setOrderSearchQuery('');
        setProductSearchQuery('');
        
        // Refresh packing table
        loadPackedData();
        
        // Refocus order barcode field
        setTimeout(() => {
          orderInputRef.current?.focus();
        }, 150);
      }
    } catch (err: any) {
      playAudioFeedback('error');
      const msg = err.response?.data?.message || 'Có lỗi xảy ra khi đóng gói đơn hàng!';
      setStatusMessage({ text: msg, type: 'error' });
      addLog(`Lỗi lưu đóng gói: ${msg}`);
    }
  };

  // --- Print Invoice / Labels ---
  const handlePrint = (type: 'invoice' | 'shipping' | 'label' | 'k80') => {
    const selectedItems = packedOrders.filter(o => selectedPackedIds.has(o._id));
    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất một đơn hàng để in!');
      return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    let style = '';
    if (type === 'k80') {
      style = `
        body { font-family: monospace, sans-serif; width: 80mm; margin: 0; padding: 5px; font-size: 12px; line-height: 1.4; color: #000; }
        .ticket { border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; page-break-inside: avoid; }
        .header { text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .info-row { display: flex; justify-content: space-between; }
        .label { font-weight: normal; }
        .val { font-weight: bold; }
        .products-table { width: 100%; font-size: 11px; margin-top: 5px; }
        .products-table th { text-align: left; border-bottom: 1px solid #000; }
        .products-table td { padding: 3px 0; }
        @media print {
          body { width: 80mm; }
        }
      `;
    } else {
      style = `
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #1e293b; background: #fff; }
        .ticket { border: 2px dashed #334155; padding: 20px; margin-bottom: 30px; page-break-inside: avoid; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 15px; }
        .title { font-size: 22px; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .info-box { border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; background: #f8fafc; }
        .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .val { font-size: 14px; font-weight: 700; margin-top: 4px; color: #0f172a; }
        .products-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .products-table th, .products-table td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 13px; }
        .products-table th { background: #f1f5f9; color: #475569; font-weight: 700; }
        .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print {
          body { margin: 0; }
          .ticket { page-break-after: always; box-shadow: none; border-color: #000; }
        }
      `;
    }

    let html = `
      <html>
        <head>
          <title>In Phiếu Gửi - LadyStars</title>
          <style>${style}</style>
        </head>
        <body>
    `;
    
    selectedItems.forEach(order => {
      if (type === 'k80') {
        html += `
          <div class="ticket">
            <div class="header">LADYSTARS STORE</div>
            <div class="header" style="font-size: 12px;">PHIẾU GỬI HÀNG K80</div>
            <div class="divider"></div>
            <div class="info-row"><span class="label">Mã đơn:</span><span class="val">${order.orderCode}</span></div>
            <div class="info-row"><span class="label">Ngày:</span><span>${order.packedAt}</span></div>
            <div class="info-row"><span class="label">Kho:</span><span>${order.warehouse || 'HN'}</span></div>
            <div class="divider"></div>
            <div class="info-row"><span class="label">Khách:</span><span class="val">${order.customerName}</span></div>
            <div class="info-row"><span class="label">SĐT:</span><span>${order.customerPhone || ''}</span></div>
            <div style="font-size: 11px;">Đ/C: ${order.shippingAddress || ''}</div>
            <div class="divider"></div>
            <div class="info-row"><span class="label">T.Toán:</span><span class="val">${order.paymentMethod}</span></div>
            <div class="info-row"><span class="label">Cân nặng:</span><span>${order.packageWeight} kg</span></div>
            <div class="divider"></div>
            <table class="products-table">
              <thead>
                <tr>
                  <th>SP</th>
                  <th style="text-align: right;">SL</th>
                </tr>
              </thead>
              <tbody>
                ${(order.products || []).map((p: any) => `
                  <tr>
                    <td>${p.productName} (${p.sku})</td>
                    <td style="text-align: right;">${p.quantity}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="divider"></div>
            <div style="text-align: center; font-size: 10px; margin-top: 5px;">Đóng gói bởi: ${order.packer}</div>
          </div>
        `;
      } else {
        html += `
          <div class="ticket">
            <div class="header">
              <div class="title">LADYSTARS ERP</div>
              <div style="font-weight: 800; font-size: 18px; color: #0f172a;">Mã đơn: ${order.orderCode}</div>
            </div>
            <div class="info-grid">
              <div class="info-box">
                <div class="label">Từ (Người gửi)</div>
                <div class="val">LadyStars Store VN</div>
                <div style="font-size: 12px; color: #475569; margin-top: 4px;">Kho xuất hàng: ${order.warehouse || 'Hệ thống'}</div>
              </div>
              <div class="info-box">
                <div class="label">Đến (Người nhận)</div>
                <div class="val">${order.customerName}</div>
                <div style="font-size: 12px; color: #475569; margin-top: 4px;">SĐT: ${order.customerPhone || 'N/A'}</div>
                <div style="font-size: 12px; color: #475569;">Đ/C: ${order.shippingAddress || 'N/A'}</div>
              </div>
            </div>
            <div class="info-box" style="margin-bottom: 15px;">
              <div class="label">Trạng thái thanh toán & Logistics</div>
              <div class="val" style="display: flex; justify-content: space-between;">
                <span>Thanh toán: ${order.paymentMethod || 'COD'}</span>
                <span>Cân nặng: ${order.packageWeight} kg (${order.packagingMaterial})</span>
              </div>
            </div>
            <div class="label" style="margin-top: 15px;">Danh sách sản phẩm kiểm đếm</div>
            <table class="products-table">
              <thead>
                <tr>
                  <th style="width: 120px;">Mã SKU</th>
                  <th>Tên sản phẩm</th>
                  <th style="text-align: center; width: 80px;">SL Đặt</th>
                  <th style="text-align: center; width: 80px;">SL Quét</th>
                </tr>
              </thead>
              <tbody>
                ${(order.products || []).map((p: any) => `
                  <tr>
                    <td style="font-weight: 700; color: #2563eb;">${p.sku}</td>
                    <td>${p.productName}</td>
                    <td style="text-align: center; font-weight: 700;">${p.quantity}</td>
                    <td style="text-align: center;">${p.scannedQuantity}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              <div>Người đóng gói: <strong>${order.packer}</strong></div>
              <div>Thời gian hoàn tất: <strong>${order.packedAt}</strong></div>
            </div>
          </div>
        `;
      }
    });
    
    html += `
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 450);
  };

  // --- Delete packed record (Undo Packing) ---
  const handleDeletePackedOrder = async (orderId: string, orderCode: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy trạng thái đóng gói và khôi phục đơn hàng ${orderCode}?`)) return;
    try {
      await http.patch(`/orders/manage/${orderId}`, { status: 'In và đóng gói', packedAt: '', packer: '', packageWeight: 0, packagingMaterial: '' });
      playAudioFeedback('success');
      addLog(`Hủy đóng gói đơn hàng ${orderCode}.`);
      loadPackedData();
    } catch (err) {
      alert('Không thể hủy đóng gói đơn hàng này!');
    }
  };

  // --- Handover Record Actions ---
  const handleCreateHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const code = `BBBG-${newHandover.carrier === 'Viettel Post' ? 'VTP' : newHandover.carrier === 'Giao hàng nhanh' ? 'GHN' : 'JNT'}-${Date.now().toString().slice(-6)}`;
      await http.post('/orders/handover', {
        handoverCode: code,
        carrier: newHandover.carrier,
        orderCount: 0,
        handoverStaff: newHandover.handoverStaff,
        carrierStaff: newHandover.carrierStaff,
        status: 'Đang kiểm đếm',
        handoverDate: newHandover.handoverDate
      });
      setShowNewHandoverModal(false);
      setNewHandover(prev => ({ ...prev, carrierStaff: '' }));
      addLog(`Tạo thành công biên bản bàn giao mới ${code}.`);
      await loadHandovers();
    } catch (err) {
      alert('Lỗi khi tạo biên bản bàn giao mới!');
    }
  };

  const handleAssignToHandover = async () => {
    if (!selectedHandoverId) {
      alert('Vui lòng chọn hoặc tạo mới một biên bản bàn giao!');
      return;
    }
    const selectedOrders = packedOrders.filter(o => selectedPackedIds.has(o._id));
    if (selectedOrders.length === 0) {
      alert('Vui lòng chọn các đơn hàng đã đóng gói cần bàn giao!');
      return;
    }

    try {
      const handoverRecord = handoverRecords.find(h => h._id === selectedHandoverId);
      if (!handoverRecord) return;

      // Update notes for all selected orders & update handover count
      await Promise.all(selectedOrders.map(async (order) => {
        const noteText = order.note 
          ? `${order.note}\n[Đã bàn giao: ${handoverRecord.handoverCode}]` 
          : `[Đã bàn giao: ${handoverRecord.handoverCode}]`;
        await http.patch(`/orders/manage/${order._id}`, { 
          note: noteText,
          deliveryStatus: 'Đang giao'
        });
      }));

      // Update handover record count
      const updatedCount = (handoverRecord.orderCount || 0) + selectedOrders.length;
      await http.patch(`/orders/handover/${selectedHandoverId}`, { 
        orderCount: updatedCount,
        status: 'Đã bàn giao'
      });

      playAudioFeedback('victory');
      alert(`Đã đưa ${selectedOrders.length} đơn hàng vào biên bản ${handoverRecord.handoverCode} thành công!`);
      addLog(`Giao ${selectedOrders.length} đơn hàng cho bưu tá thông qua biên bản ${handoverRecord.handoverCode}.`);
      
      setSelectedPackedIds(new Set());
      loadPackedData();
      loadHandovers();
    } catch (err) {
      alert('Có lỗi xảy ra khi gán đơn hàng vào biên bản bàn giao!');
    }
  };

  const handleSelectAllPacked = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedPackedIds(new Set(packedOrders.map(item => item._id)));
    } else {
      setSelectedPackedIds(new Set());
    }
  };

  const handleSelectPackedRow = (id: string, checked: boolean) => {
    const nextSet = new Set(selectedPackedIds);
    if (checked) nextSet.add(id);
    else nextSet.delete(id);
    setSelectedPackedIds(nextSet);
  };

  // --- Calculate total items needed vs scanned ---
  const totalNeeded = activeOrder?.products?.reduce((acc: number, p: any) => acc + p.quantity, 0) || 0;
  const totalScanned = activeOrder?.products?.reduce((acc: number, p: any) => acc + (p.scannedQuantity || 0), 0) || 0;

  return (
    <div className="page-stack">
      {/* Dynamic Scoped Styles for Glassmorphism & Custom layout spacing */}
      <style dangerouslySetInnerHTML={{ __html: `
        .packing-container {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 1024px) {
          .packing-container {
            grid-template-columns: 1fr;
          }
        }
        .scanner-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
          overflow: hidden;
          margin-bottom: 20px;
        }
        .scanner-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 20px;
          background: #f8fafc;
          border-bottom: 1px solid var(--border);
        }
        .scanner-card-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #0f172a;
        }
        .scanner-body {
          padding: 20px;
        }
        .scan-inputs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        @media (max-width: 640px) {
          .scan-inputs-grid {
            grid-template-columns: 1fr;
          }
        }
        .scan-input-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .scan-input-wrapper label {
          font-size: 12px;
          font-weight: 800;
          color: var(--muted);
          display: flex;
          justify-content: space-between;
        }
        .scan-input-wrapper label span.hotkey {
          color: var(--primary);
          background: var(--primary-soft);
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 10px;
        }
        .scan-input-field {
          position: relative;
          display: flex;
          align-items: center;
        }
        .scan-input-field input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          padding: 11px 12px 11px 40px;
          font-size: 14px;
          font-weight: 700;
          outline: none;
          transition: all 0.2s ease;
        }
        .scan-input-field input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3.5px var(--primary-soft);
        }
        .scan-input-field svg {
          position: absolute;
          left: 14px;
          color: var(--muted);
        }
        .scan-input-field input:focus + svg {
          color: var(--primary);
        }
        .progress-bar-container {
          background: #e2e8f0;
          height: 8px;
          border-radius: 999px;
          overflow: hidden;
          margin: 15px 0;
          display: flex;
        }
        .progress-bar-fill {
          height: 100%;
          transition: width 0.3s ease;
        }
        .order-meta-box {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px;
          background: #fafafa;
          margin-bottom: 20px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .meta-item svg {
          color: var(--muted);
        }
        .meta-item strong {
          color: #0f172a;
        }
        .alert-status-box {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
        }
        .alert-status-box.success {
          background: var(--success-soft);
          color: #047857;
          border: 1.5px solid #a7f3d0;
        }
        .alert-status-box.error {
          background: var(--danger-soft);
          color: #b91c1c;
          border: 1.5px solid #fecaca;
        }
        .alert-status-box.info {
          background: var(--primary-soft);
          color: #1d4ed8;
          border: 1.5px solid #bfdbfe;
        }
        .logs-panel {
          border: 1px dashed var(--border);
          border-radius: 8px;
          background: #1e293b;
          color: #e2e8f0;
          font-family: monospace;
          font-size: 11px;
          padding: 12px;
          max-height: 180px;
          overflow-y: auto;
        }
        .logs-panel h4 {
          margin: 0 0 6px 0;
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          border-bottom: 1px solid #334155;
          padding-bottom: 4px;
        }
        .log-row {
          padding: 2px 0;
          white-space: pre-wrap;
        }
        .table-compact th, .table-compact td {
          padding: 8px 12px !important;
          font-size: 13px !important;
        }
        .badge-success {
          background: var(--success-soft);
          color: #047857;
          border-radius: 999px;
          padding: 2px 8px;
          font-weight: bold;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .print-btn-group {
          position: relative;
        }
        .print-btn-group .dropdown-menu {
          width: 220px;
        }
      ` }} />

      {/* Page Heading */}
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Package size={22} /></div>
          <div>
            <h1>Đóng gói đơn hàng</h1>
            <p>Xử lý đóng gói sản phẩm và quản lý biên bản giao vận</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={loadPackedData}>
            Tải lại dữ liệu
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="packing-container">
        
        {/* Left Column: Packing Form & Scanner Area */}
        <div className="left-column">
          
          {/* Section 1: Scan area */}
          <div className="scanner-card">
            <div className="scanner-card-header">
              <h3>
                <Package size={18} />
                Quét mã vạch đóng gói
              </h3>
              <div>
                <select 
                  style={{ minHeight: '32px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  {branches.length === 0 && <option value="">Đang tải kho...</option>}
                  {branches.map(b => (
                    <option key={b._id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="scanner-body">
              {/* Inputs Grid */}
              <div className="scan-inputs-grid">
                
                {/* Search / Scan Order */}
                <form onSubmit={handleScanOrder} className="scan-input-wrapper">
                  <label>
                    Quét / Nhập mã đơn hàng
                    <span className="hotkey">F3</span>
                  </label>
                  <div className="scan-input-field">
                    <input 
                      ref={orderInputRef}
                      type="text" 
                      placeholder="Mã đơn hàng (ví dụ: ORD-2026-1001)"
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                    />
                    <Search size={16} />
                  </div>
                </form>

                {/* Scan SKU */}
                <form onSubmit={handleScanProduct} className="scan-input-wrapper">
                  <label>
                    Quét mã sản phẩm / SKU
                    <span className="hotkey">F4</span>
                  </label>
                  <div className="scan-input-field">
                    <input 
                      ref={productInputRef}
                      type="text" 
                      data-product-search-scan="true" data-product-search-primary="true" placeholder="Quét mã vạch SKU sản phẩm"
                      disabled={!activeOrder}
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                    />
                    <Package size={16} />
                  </div>
                </form>

              </div>

              {/* Status Message Notification Bar */}
              {statusMessage && (
                <div className={`alert-status-box ${statusMessage.type}`}>
                  {statusMessage.type === 'success' && <Check size={18} />}
                  {statusMessage.type === 'error' && <AlertTriangle size={18} />}
                  {statusMessage.type === 'info' && <Info size={18} />}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* Active Order Details and Table */}
              {activeOrder ? (
                <div>
                  
                  {/* Order Meta Attributes */}
                  <div className="order-meta-box">
                    <div className="meta-item">
                      <User size={15} />
                      <span>Khách hàng: <strong>{activeOrder.customerName}</strong></span>
                    </div>
                    <div className="meta-item">
                      <MapPin size={15} />
                      <span>Địa chỉ: <strong>{activeOrder.shippingAddress || 'N/A'}</strong></span>
                    </div>
                    <div className="meta-item">
                      <CreditCard size={15} />
                      <span>Thanh toán: <strong>{activeOrder.paymentMethod}</strong></span>
                    </div>
                    <div className="meta-item">
                      <ShoppingBag size={15} />
                      <span>Tổng tiền: <strong>{activeOrder.totalAmount?.toLocaleString('vi-VN')} đ</strong></span>
                    </div>
                  </div>

                  {/* Scan Progress Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                    <span>Tiến độ nhặt hàng:</span>
                    <span>{totalScanned} / {totalNeeded} sản phẩm ({Math.round((totalScanned / totalNeeded) * 100)}%)</span>
                  </div>
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar-fill" 
                      style={{ 
                        width: `${(totalScanned / totalNeeded) * 100}%`,
                        background: totalScanned === totalNeeded ? 'var(--success)' : 'var(--primary)' 
                      }} 
                    />
                  </div>

                  {/* Products checklist table */}
                  <div className="table-scroll" style={{ marginTop: '10px' }}>
                    <table className="data-table table-compact">
                      <thead>
                        <tr>
                          <th>Sản phẩm</th>
                          <th style={{ textAlign: 'center', width: '120px' }}>Số lượng đặt</th>
                          <th style={{ textAlign: 'center', width: '160px' }}>Đã nhặt hàng (F4)</th>
                          <th style={{ width: '100px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeOrder.products?.map((p: any) => {
                          const isCompleted = p.scannedQuantity >= p.quantity;
                          return (
                            <tr key={p.sku}>
                              <td>
                                <strong style={{ color: '#0f172a' }}>{p.productName}</strong>
                                <small style={{ color: 'var(--muted)', display: 'block', fontWeight: 600 }}>SKU: {p.sku}</small>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>
                                {p.quantity}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span 
                                  style={{ 
                                    fontSize: '15px', 
                                    fontWeight: '800', 
                                    color: isCompleted ? 'var(--success)' : '#0f172a',
                                    marginRight: '6px' 
                                  }}
                                >
                                  {p.scannedQuantity || 0}
                                </span>
                                {isCompleted && (
                                  <span className="badge-success">
                                    <Check size={10} /> Đủ
                                  </span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  <button 
                                    type="button" 
                                    className="icon-button"
                                    title="Quét đủ số lượng hàng"
                                    disabled={isCompleted}
                                    onClick={() => handleManualCompleteProduct(p.sku)}
                                  >
                                    <ChevronRight size={14} style={{ color: 'var(--success)' }} />
                                  </button>
                                  <button 
                                    type="button" 
                                    className="icon-button"
                                    title="Đặt lại số lượng đã nhặt"
                                    onClick={() => handleResetProductScan(p.sku)}
                                  >
                                    <RotateCcw size={14} style={{ color: 'var(--muted)' }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                          <td>Tổng cộng cần lấy</td>
                          <td style={{ textAlign: 'center', fontSize: '14px' }}>{totalNeeded}</td>
                          <td style={{ textAlign: 'center', fontSize: '14px', color: totalScanned === totalNeeded ? 'var(--success)' : 'inherit' }}>{totalScanned}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Packaging configuration fields */}
                  <div className="form-grid" style={{ padding: '16px 0', borderTop: '1px solid var(--border)', marginTop: '20px' }}>
                    <label className="form-field">
                      <span>Cân nặng thực tế (kg)</span>
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <input 
                          type="number" 
                          step="0.05"
                          style={{ paddingLeft: '32px' }}
                          value={packageWeight}
                          onChange={(e) => setPackageWeight(parseFloat(e.target.value) || 0)}
                        />
                        <Scale size={14} style={{ position: 'absolute', left: '10px', color: 'var(--muted)' }} />
                      </div>
                    </label>

                    <label className="form-field">
                      <span>Vật liệu đóng gói</span>
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <select 
                          style={{ paddingLeft: '32px' }}
                          value={packagingMaterial}
                          onChange={(e) => setPackagingMaterial(e.target.value)}
                        >
                          <option value="Hộp carton">Hộp carton dán băng keo</option>
                          <option value="Túi niêm phong">Túi niêm phong chống bóc</option>
                          <option value="Xốp bong bóng">Túi xốp bong bóng khí</option>
                          <option value="Hộp quà đặc biệt">Hộp quà đặc biệt thương hiệu</option>
                        </select>
                        <Box size={14} style={{ position: 'absolute', left: '10px', color: 'var(--muted)' }} />
                      </div>
                    </label>

                    <label className="form-field">
                      <span>Nhân viên đóng gói</span>
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <input 
                          type="text" 
                          style={{ paddingLeft: '32px' }}
                          value={packer}
                          onChange={(e) => setPacker(e.target.value)}
                        />
                        <User size={14} style={{ position: 'absolute', left: '10px', color: 'var(--muted)' }} />
                      </div>
                    </label>
                  </div>

                  {/* Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                    <button 
                      type="button" 
                      className="btn btn-light"
                      onClick={() => {
                        setActiveOrder(null);
                        setOrderSearchQuery('');
                        setStatusMessage(null);
                      }}
                    >
                      Bỏ qua
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-success"
                      onClick={() => handleSavePackaging(activeOrder, true)}
                    >
                      <Check size={16} />
                      Xác nhận đã đóng gói
                    </button>
                  </div>

                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <Package size={48} style={{ margin: '0 auto 12px', strokeWidth: '1.5px', color: '#e2e8f0' }} />
                  <p style={{ margin: 0, fontWeight: 700 }}>Vui lòng quét mã đơn hàng (F3) để bắt đầu kiểm hàng và đóng gói</p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Hỗ trợ quét tất cả các loại hóa đơn mẫu LadyStars ERP</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Recently Packed Orders List */}
          <div className="scanner-card">
            <div className="scanner-card-header">
              <h3>
                <Check size={18} style={{ color: 'var(--success)' }} />
                Đơn đã đóng gói hôm nay
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="dropdown-container print-btn-group">
                  <button 
                    type="button" 
                    className="btn btn-outline"
                    disabled={selectedPackedIds.size === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      const menu = document.getElementById('print-dropdown-menu');
                      if (menu) menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
                    }}
                  >
                    <Printer size={16} />
                    In đơn ({selectedPackedIds.size})
                  </button>
                  <div 
                    id="print-dropdown-menu" 
                    className="dropdown-menu" 
                    style={{ display: 'none', right: 0 }}
                    onClick={() => {
                      const menu = document.getElementById('print-dropdown-menu');
                      if (menu) menu.style.display = 'none';
                    }}
                  >
                    <button className="dropdown-item" onClick={() => handlePrint('invoice')}>
                      <FileText size={14} /> In phiếu xuất khổ A4 | A5
                    </button>
                    <button className="dropdown-item" onClick={() => handlePrint('k80')}>
                      <Printer size={14} /> In hóa đơn khổ K80
                    </button>
                    <button className="dropdown-item" onClick={() => handlePrint('label')}>
                      <Package size={14} /> In nhãn vận chuyển (Tem nhãn)
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="scanner-body" style={{ padding: 0 }}>
              <div className="table-scroll">
                <table className="data-table table-compact">
                  <thead>
                    <tr>
                      <th className="check-cell" style={{ width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={packedOrders.length > 0 && selectedPackedIds.size === packedOrders.length}
                          onChange={handleSelectAllPacked}
                        />
                      </th>
                      <th>Đơn hàng</th>
                      <th>Khách hàng</th>
                      <th>Hình thức vận chuyển</th>
                      <th>Sản phẩm đóng gói</th>
                      <th>Đóng gói lúc</th>
                      <th style={{ width: '80px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {packedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="empty-cell">Chưa có đơn hàng nào hoàn thành đóng gói hôm nay.</td>
                      </tr>
                    ) : (
                      packedOrders.map((order) => (
                        <tr key={order._id}>
                          <td className="check-cell" style={{ textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedPackedIds.has(order._id)}
                              onChange={(e) => handleSelectPackedRow(order._id, e.target.checked)}
                            />
                          </td>
                          <td>
                            <strong style={{ color: '#2563eb' }}>{order.orderCode}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Kho: {order.warehouse || 'Hệ thống'}</div>
                          </td>
                          <td>
                            <div><strong>{order.customerName}</strong></div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>SĐT: {order.customerPhone}</div>
                          </td>
                          <td>
                            <div>{order.paymentMethod}</div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Cân nặng: {order.packageWeight} kg ({order.packagingMaterial})</div>
                          </td>
                          <td>
                            <div style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.products?.map((p: any) => `${p.productName} (x${p.quantity})`).join(', ')}>
                              {order.products?.map((p: any) => (
                                <div key={p.sku} style={{ fontSize: '12px' }}>
                                  • {p.productName} <strong>(x{p.quantity})</strong>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            <div>{order.packedAt}</div>
                            <div>Đóng gói bởi: <strong>{order.packer}</strong></div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button 
                                type="button" 
                                className="icon-button danger" 
                                title="Hủy đóng gói & Trả lại đơn"
                                onClick={() => handleDeletePackedOrder(order._id, order.orderCode)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 3: Add to Handover Record */}
          <div className="scanner-card">
            <div className="scanner-card-header">
              <h3>
                <FileText size={18} />
                Cho vào biên bản bàn giao vận chuyển
              </h3>
            </div>
            <div className="scanner-body">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '220px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <select 
                      style={{ width: '100%', minHeight: '38px', borderRadius: '8px', border: '1px solid var(--border)', padding: '0 10px' }}
                      value={selectedHandoverId}
                      onChange={(e) => setSelectedHandoverId(e.target.value)}
                    >
                      {handoverRecords.length === 0 && <option value="">Chưa có biên bản bàn giao nào</option>}
                      {handoverRecords.map(h => (
                        <option key={h._id} value={h._id}>
                          {h.handoverCode} ({h.carrier} - {h.orderCount || 0} đơn) - {h.status}
                        </option>
                      ))}
                    </select>
                    <button 
                      type="button" 
                      className="btn btn-outline" 
                      style={{ padding: '0 10px', minHeight: '38px' }}
                      onClick={() => setShowNewHandoverModal(true)}
                      title="Tạo biên bản bàn giao mới"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div>
                  <button 
                    type="button" 
                    className="btn btn-success" 
                    style={{ minHeight: '38px' }}
                    onClick={handleAssignToHandover}
                    disabled={selectedPackedIds.size === 0}
                  >
                    <Save size={16} />
                    Lưu bàn giao ({selectedPackedIds.size})
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Instructions & Scan log */}
        <div className="right-column">
          <div className="scanner-card" style={{ position: 'sticky', top: '88px' }}>
            <div className="scanner-card-header">
              <h3>
                <Info size={18} style={{ color: 'var(--primary)' }} />
                Hướng dẫn vận hành đóng gói
              </h3>
            </div>
            <div className="scanner-body" style={{ padding: '16px' }}>
              <div style={{ background: 'var(--primary-soft)', borderLeft: '4px solid var(--primary)', padding: '12px', borderRadius: '0 8px 8px 0', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5', marginBottom: '16px' }}>
                Tính năng này giúp nhân viên kho kiểm đếm chính xác sản phẩm của đơn hàng trước khi giao cho đơn vị vận chuyển, ngăn ngừa gửi sai, gửi thiếu hàng.
              </div>

              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '800' }}>Các bước thực hiện:</h4>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8', color: '#334155' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Quét mã đơn hàng (F3):</strong> Đưa súng quét hoặc nhập mã ID của đơn hàng cần chuẩn bị. Màn hình sẽ tải thông tin khách hàng và danh sách hàng hóa.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Quét mã sản phẩm (F4):</strong> Quét mã vạch SKU của từng sản phẩm. Mỗi lần quét khớp sẽ tăng số lượng lên 1 đơn vị kèm <strong>âm thanh bíp</strong> thành công.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Tự động đóng gói:</strong> Khi tất cả các sản phẩm đã được quét đủ số lượng đặt, hệ thống sẽ phát âm thanh nhạc chiến thắng, tự động chuyển đơn sang trạng thái <strong>Đã đóng gói</strong>.
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>In phiếu gửi và bàn giao:</strong> Chọn các đơn hàng đóng gói trong ngày, in nhãn dán dán lên hộp, sau đó gán vào biên bản bàn giao với nhà vận chuyển.
                </li>
              </ol>

              <div style={{ marginTop: '20px' }} className="logs-panel">
                <h4>Hoạt động quét mã</h4>
                {logs.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Chưa có lịch sử hoạt động quét mã...</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="log-row">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Create New Handover Modal */}
      {showNewHandoverModal && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={handleCreateHandoverSubmit}>
            <div className="modal-header">
              <div>
                <h2>Tạo biên bản bàn giao mới</h2>
                <p>Khởi tạo lô bàn giao đơn hàng sang hãng vận chuyển</p>
              </div>
              <button 
                className="icon-button" 
                type="button" 
                onClick={() => setShowNewHandoverModal(false)}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              
              <label className="form-field">
                <span>Hãng vận chuyển *</span>
                <select 
                  value={newHandover.carrier} 
                  onChange={(e) => setNewHandover({ ...newHandover, carrier: e.target.value })}
                >
                  <option value="Giao hàng nhanh">Giao hàng nhanh (GHN)</option>
                  <option value="Viettel Post">Viettel Post (VTP)</option>
                  <option value="J&T Express">J&T Express</option>
                  <option value="Ninja Van">Ninja Van</option>
                  <option value="Giao hàng tiết kiệm">Giao hàng tiết kiệm (GHTK)</option>
                </select>
              </label>

              <label className="form-field">
                <span>Nhân viên bàn giao *</span>
                <input 
                  type="text" 
                  value={newHandover.handoverStaff} 
                  onChange={(e) => setNewHandover({ ...newHandover, handoverStaff: e.target.value })}
                  required
                />
              </label>

              <label className="form-field">
                <span>Bưu tá nhận hàng (Tên / SĐT)</span>
                <input 
                  type="text" 
                  placeholder="Ví dụ: Nguyễn Văn A - 0988xxxx"
                  value={newHandover.carrierStaff} 
                  onChange={(e) => setNewHandover({ ...newHandover, carrierStaff: e.target.value })}
                />
              </label>

              <label className="form-field">
                <span>Ngày bàn giao *</span>
                <input 
                  type="date" 
                  value={newHandover.handoverDate} 
                  onChange={(e) => setNewHandover({ ...newHandover, handoverDate: e.target.value })}
                  required
                />
              </label>

            </div>
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setShowNewHandoverModal(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Khởi tạo biên bản</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

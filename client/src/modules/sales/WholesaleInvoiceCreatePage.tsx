import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useProductScanTarget } from '../../core/hooks/productScanner';
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  FileText, 
  Phone, 
  Save, 
  Tag, 
  User, 
  Warehouse, 
  Briefcase, 
  Percent, 
  CreditCard, 
  Info,
  CheckCircle,
  AlertCircle,
  Search,
  Trash2,
  Plus,
  Coins,
  Printer,
  MapPin,
  Building,
  PlusCircle
} from 'lucide-react';
import { http } from '../../core/api/http';
import { buildInvoiceProfile, getBranch } from '../../core/api/branch.api';
import { buildReceiptHtml, receiptMoney, writeAndPrintPopup } from './invoicePrint';

const getStockForWarehouse = (prod: any) => {
  if (typeof prod?.selectedStock === 'number') return prod.selectedStock;
  return prod.totalStock ?? prod.qty ?? 0;
};

const PRINT_WINDOW_FEATURES = 'popup=yes,width=420,height=720';

function openReceiptWindow() {
  return window.open('about:blank', 'wholesale-invoice-print', PRINT_WINDOW_FEATURES);
}

function branchIdFromValue(value: any) {
  return typeof value === 'string' ? value : value?._id || '';
}

async function resolveBranchForReceipt(source: any, fallbackBranch: any, fallbackBranchId?: string | null) {
  const resolvedBranchId = branchIdFromValue(source?.branchId || source?.warehouseId) || branchIdFromValue(fallbackBranch) || fallbackBranchId || '';
  if (resolvedBranchId) {
    try {
      return await getBranch(resolvedBranchId, { includeInactive: true });
    } catch {
      return fallbackBranch || null;
    }
  }
  return fallbackBranch || null;
}

interface InvoiceProduct {
  _id?: string;
  code: string;
  name: string;
  stock: number;
  qty: number;
  price: number;
  cost: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  total: number;
  unit: string;
  barcode?: string;
  imei?: string;
}

export function WholesaleInvoiceCreatePage() {
  const { channel } = useParams();
  const [searchParams] = useSearchParams();
  const requestedBranchId = searchParams.get('branchId') || '';
  const editId = searchParams.get('editId');
  const navigate = useNavigate();

  const [branch, setBranch] = useState<any>(null);
  const [activeBranchId, setActiveBranchId] = useState(requestedBranchId);
  const [branchOptions, setBranchOptions] = useState<any[]>([]);
  const [loadingBranch, setLoadingBranch] = useState(false);

  // Expanded Form State to map 100% with extracted structure
  const [form, setForm] = useState({
    id: 'BHS-' + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    cashier: 'Lê Sỹ Bách',
    salesperson: '',
    techStaff: '',
    type: 'Xuất bán sỉ [S]',
    warehouse: '',
    wholesaleInvoiceLabel: '',
    orderSource: 'Trực tiếp',
    description: '',
    
    // Customer Info (Individual)
    customerPhone: '',
    customerName: '',
    customerCode: '', // Mã thẻ
    email: '',
    dob: '',
    addressLocation: '', // Tỉnh/Thành phố, Quận/Huyện, Phường/Xã
    address: '', // Địa chỉ chi tiết
    
    // Customer Info (Enterprise)
    companyName: '',
    taxId: '',
    poContractNumber: '', // Số PO - Hợp đồng
    contractSigningDate: '', // Ngày ký hợp đồng
    
    // VAT Invoice
    hasVat: false, // Trạng thái xuất hóa đơn VAT
    vatInvoiceNumber: '', // Số hóa đơn VAT
    vatInvoiceDate: '', // Ngày xuất hóa đơn
    vatPercent: 10, // VAT (%)
    
    // Payments
    prepaidFromOrder: 0, // Đã thanh toán từ đơn hàng
    paymentCash: 0,      // Tiền mặt
    paymentTransfer: 0,  // Chuyển khoản
    paymentCard: 0,      // Quẹt thẻ
    paymentOther: 0,     // Khác
    
    paymentMethod: 'Tiền mặt',
    orderDiscount: 0,    // Chiết khấu đơn hàng
    autoDiscount: true,  // Tự động chiết khấu
    
    totalAmount: 0,
    paidAmount: 0,
    debtAmount: 0,
    status: 'Mới',
    autoPrint: false,    // Tự động in sau khi lưu hóa đơn (F10)
  });

  // Multi-product list
  const [products, setProducts] = useState<InvoiceProduct[]>([]);
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [dbStaffs, setDbStaffs] = useState<any[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [productTypeTab, setProductTypeTab] = useState<'normal' | 'imei'>('normal');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch branch details
  useEffect(() => {
    if (activeBranchId) {
      setLoadingBranch(true);
      http.get(`/system/branches/${activeBranchId}`)
        .then((res) => {
          setBranch(res.data);
          setForm(prev => ({
            ...prev,
            warehouse: res.data?.name || ''
          }));
        })
        .catch((err) => {
          console.error("Lỗi lấy thông tin kho:", err);
        })
        .finally(() => {
          setLoadingBranch(false);
        });
    }
  }, [activeBranchId]);

  // Load dependencies (products, customers, staff, me)
  useEffect(() => {
    Promise.all([
      http.get('/auth/me'),
      http.get('/staff').catch(() => null),
      activeBranchId ? http.get('/products/inventories', { params: { branchId: activeBranchId, limit: 5000 } }) : Promise.resolve({ data: { items: [] } }),
      http.get('/system/branches').catch(() => null),
    ]).then(([meRes, staffRes, prodRes, branchListRes]) => {
      setForm(prev => ({ ...prev, salesperson: meRes.data?.name || '' }));
      setDbStaffs(staffRes?.data?.items || []);
      setDbProducts(prodRes.data?.items || []);
      setBranchOptions((branchListRes?.data?.items || []).filter((item: any) => item.isActive !== false));

      if (editId) {
        http.get(`/products/sales/${editId}`).then(res => {
          const sale = res.data;
          // Derive branchId from sale for edit flow (edit URL may omit ?branchId=)
          const braw = sale.branchId || sale.warehouseId || sale.warehouse;
          const bid = typeof braw === 'string' ? braw : (braw && (braw._id || braw.id)) || '';
          if (bid) {
            setActiveBranchId(bid);
          }

          setForm(prev => ({
            ...prev,
            id: sale.code || prev.id,
            customerName: sale.customerId?.name || sale.customerName || '',
            customerPhone: sale.customerId?.phone || sale.customerPhone || '',
            customerCode: sale.customerId?.code || sale.customerId?.cardId || '',
            email: sale.customerId?.email || '',
            dob: sale.customerId?.birthday ? new Date(sale.customerId.birthday).toISOString().split('T')[0] : '',
            address: sale.customerId?.address || '',
            companyName: sale.customerId?.company || '',
            taxId: sale.customerId?.vat || '',
            description: sale.note || '',
            orderDiscount: sale.discountValue || 0,
          }));

          if (sale.items && sale.items.length > 0) {
            setProducts(sale.items.map((item: any) => ({
              _id: item.productId?._id,
              code: item.productId?.code || '',
              name: item.productId?.name || '',
              stock: item.productId?.qty || 0,
              qty: item.amount,
              price: item.value,
              cost: item.productId?.cost || 0,
              discountType: 'fixed',
              discountValue: item.discountValue || 0,
              total: item.total || (item.value * item.amount),
              unit: item.productId?.unit || 'Cái',
              imei: '',
            })));
          }
        }).catch(err => console.error("Lỗi tải hóa đơn sỉ cũ:", err));
      }
    }).catch(err => console.error("Error fetching dependencies:", err));
  }, [activeBranchId, editId]);

  // Hotkeys Hook: F3 search, F4 phone search, F9 save, F10 toggle auto-print
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        const el = document.getElementById('product-search-input');
        if (el) el.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        const el = document.getElementById('customer-phone-input');
        if (el) el.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        const btn = document.getElementById('save-invoice-btn');
        if (btn) btn.click();
      } else if (e.key === 'F10') {
        e.preventDefault();
        setForm(prev => ({ ...prev, autoPrint: !prev.autoPrint }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-calculator engine
  useEffect(() => {
    // 1. Calculate individual product line totals
    let tempSubtotal = 0;
    let tempProductDiscount = 0;
    
    const updatedProducts = products.map(prod => {
      const discVal = prod.discountType === 'percentage' 
        ? prod.price * (prod.discountValue / 100)
        : prod.discountValue;
      const lineTotal = Math.max(0, prod.price - discVal) * prod.qty;
      tempSubtotal += prod.price * prod.qty;
      tempProductDiscount += discVal * prod.qty;
      return { ...prod, total: lineTotal };
    });

    // Prevent render loops by checking if totals changed
    const hasTotalChanged = updatedProducts.some((p, i) => p.total !== products[i]?.total);
    if (hasTotalChanged) {
      setProducts(updatedProducts);
      return;
    }

    const subtotalAfterDiscount = Math.max(0, tempSubtotal - tempProductDiscount);

    // 2. VAT Calculation
    const vatPercent = Number(form.vatPercent) || 0;
    const vatAmount = form.hasVat ? Math.round(subtotalAfterDiscount * (vatPercent / 100)) : 0;

    // 3. Overall Order Total
    const orderDiscount = Number(form.orderDiscount) || 0;
    const totalAmount = Math.max(0, subtotalAfterDiscount + vatAmount - orderDiscount);

    // 4. Paid Amount from multi-method split payments
    const prepaid = Number(form.prepaidFromOrder) || 0;
    const cash = Number(form.paymentCash) || 0;
    const transfer = Number(form.paymentTransfer) || 0;
    const card = Number(form.paymentCard) || 0;
    const other = Number(form.paymentOther) || 0;
    const paidAmount = prepaid + cash + transfer + card + other;

    // 5. Debt
    const debtAmount = Math.max(0, totalAmount - paidAmount);
    const status = debtAmount > 0 ? 'Còn nợ' : 'Đã thanh toán';

    setForm(prev => {
      if (
        prev.totalAmount === totalAmount &&
        prev.paidAmount === paidAmount &&
        prev.debtAmount === debtAmount &&
        prev.status === status
      ) {
        return prev;
      }
      return {
        ...prev,
        totalAmount,
        paidAmount,
        debtAmount,
        status
      };
    });
  }, [
    products,
    form.vatPercent,
    form.hasVat,
    form.orderDiscount,
    form.prepaidFromOrder,
    form.paymentCash,
    form.paymentTransfer,
    form.paymentCard,
    form.paymentOther
  ]);

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!showCustomerDropdown) {
      setCustomerSuggestions([]);
      return;
    }
    const keyword = (form.customerName || form.customerPhone).trim();
    if (!keyword) {
      setCustomerSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      http.get('/customers/customers', {
        params: {
          keyword,
          limit: 20,
          sort: 'lastPurchaseDate',
          order: 'desc',
        },
      })
        .then((response) => setCustomerSuggestions(response.data?.items || []))
        .catch(() => setCustomerSuggestions([]));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [form.customerName, form.customerPhone, showCustomerDropdown]);

  const selectCustomer = (c: any) => {
    setForm(prev => ({
      ...prev,
      customerName: c.name || '',
      customerPhone: c.phone || '',
      customerCode: c.cardId || c.code || '',
      email: c.email || '',
      dob: c.birthday ? new Date(c.birthday).toISOString().split('T')[0] : (c.dob || ''),
      addressLocation: c.addressLocation || '',
      address: c.address || '',
      companyName: c.company || '',
      taxId: c.vat || '',
    }));
    setShowCustomerDropdown(false);
  };

  // Look up customer by phone
  const lookupCustomer = async (phoneStr: string) => {
    const keyword = phoneStr.trim();
    if (!keyword) {
      setCustomerSuggestions([]);
      return;
    }
    try {
      const res = await http.get('/customers/customers', { params: { phone: keyword, keyword, limit: 20, sort: 'lastPurchaseDate', order: 'desc' } });
      setCustomerSuggestions(res.data.items ?? []);
      setShowCustomerDropdown(true);
    } catch (err) {
      console.error("L???i t??m ki???m kh??ch h??ng:", err);
      setCustomerSuggestions([]);
    }
  };

  // Add Product Helpers
  const handleProductScan = (rawBarcode: string) => {
    const query = rawBarcode.trim();
    if (!query) return;
    const lower = query.toLowerCase();
    const barcodeMatches = dbProducts.filter((p) => String(p.barcode || '').trim().toLowerCase() === lower);
    const codeMatches = barcodeMatches.length ? [] : dbProducts.filter((p) => String(p.code || '').trim().toLowerCase() === lower);
    const exactMatches = barcodeMatches.length ? barcodeMatches : codeMatches;
    if (exactMatches.length === 1) {
      addProduct(exactMatches[0]);
      window.setTimeout(() => productSearchRef.current?.focus(), 0);
      return;
    }
    setSearchQuery(query);
    setShowSearchResults(true);
  };

  useProductScanTarget(productSearchRef, handleProductScan);

  const addProduct = (prod: any) => {
    const stock = getStockForWarehouse(prod);
    if (!Number.isFinite(stock) || stock <= 0) {
      setErrorMessage(`Sản phẩm "${prod.name || prod.code}" đã hết tồn tại kho "${form.warehouse || 'đang chọn'}".`);
      return;
    }
    const existing = products.find(p => p.code === prod.code);
    if (existing) {
      setProducts(products.map(p => p.code === prod.code ? { ...p, qty: p.qty + 1 } : p));
    } else {
      setProducts([
        ...products,
        {
          _id: prod._id,
          code: prod.code,
          name: prod.name,
          stock: prod.qty ?? 0,
          qty: 1,
          price: prod.price ?? 0,
          cost: prod.cost ?? 0,
          discountType: 'fixed',
          discountValue: 0,
          total: prod.price ?? 0,
          unit: prod.unit ?? 'Cái',
          barcode: prod.barcode ?? '',
          imei: '',
        }
      ]);
    }
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const addCustomProduct = () => {
    setProducts([
      ...products,
      {
        code: 'SPM-' + Math.floor(1000 + Math.random() * 9000),
        name: searchQuery.trim() || 'Sản phẩm ngoài danh mục',
        stock: 0,
        qty: 1,
        price: 0,
        cost: 0,
        discountType: 'fixed',
        discountValue: 0,
        total: 0,
        unit: 'Cái',
        imei: '',
      }
    ]);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleProductChange = (index: number, key: keyof InvoiceProduct, val: any) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [key]: val };
    setProducts(updated);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  // Submit Handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBranchId) {
      setErrorMessage('Vui lòng chọn Kho thực hiện trước khi lưu hóa đơn bán sỉ.');
      return;
    }
    if (!form.customerName.trim()) {
      setErrorMessage('Vui lòng nhập tên khách hàng hoặc tìm kiếm bằng SĐT');
      return;
    }
    if (products.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất một sản phẩm vào hóa đơn');
      return;
    }

    setErrorMessage('');
    const printPopup = form.autoPrint ? openReceiptWindow() : null;
    if (form.autoPrint && !printPopup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn. Hãy cho phép pop-up và thử lại.');
      return;
    }
    setIsSaving(true);

    const totalQty = products.reduce((acc, p) => acc + p.qty, 0);
    const totalCost = products.reduce((acc, p) => acc + (p.cost * p.qty), 0);
    const subtotalBeforeDiscount = products.reduce((acc, p) => acc + (p.price * p.qty), 0);
    const productDiscount = products.reduce((acc, p) => {
      const disc = p.discountType === 'percentage' ? p.price * (p.discountValue / 100) : p.discountValue;
      return acc + (disc * p.qty);
    }, 0);
    const subtotalAfterDiscount = Math.max(0, subtotalBeforeDiscount - productDiscount);

    try {
      // Auto-save new customer if not found
      let customerId = null;
      const existingCustomerResponse = await http.get('/customers/customers', {
        params: form.customerPhone.trim()
          ? { phone: form.customerPhone.trim(), limit: 5 }
          : { name: form.customerName.trim(), limit: 5 },
      }).catch(() => ({ data: { items: [] } }));
      const existingCustomer = (existingCustomerResponse.data?.items || []).find(
        (c: any) => (
          form.customerPhone.trim()
            ? c.phone === form.customerPhone.trim()
            : c.name?.toLowerCase() === form.customerName.toLowerCase()
        )
      );

      if (existingCustomer) {
        customerId = existingCustomer._id;
      } else {
        const createCustRes = await http.post('/customers/customers', {
          name: form.customerName,
          phone: form.customerPhone,
          email: form.email,
          dob: form.dob,
          cardId: form.customerCode,
          addressLocation: form.addressLocation,
          address: form.address,
        }).catch(e => console.log("Lỗi tạo khách hàng tự động:", e));
        
        if (createCustRes && createCustRes.data) {
          customerId = createCustRes.data._id;
          setCustomerSuggestions((current) => [createCustRes.data, ...current.filter((item) => item._id !== createCustRes.data._id)]);
        }
      }

      const salePayload = {
        code: form.id,
        branchId: activeBranchId,
        customerId: customerId,
        note: form.description,
        salesperson: form.salesperson,
        orderSource: form.orderSource,
        channel, // ensure channel for filtering (store etc)
        type: 'wholesale', // ensure correct separation from retail
        paymentMethod: form.paymentMethod,
        discountValue: Number(form.orderDiscount) || 0,
        discountType: 'number' as const,
        status: 'draft',
        amountProducts: totalQty,
        totalCost: totalCost,
        value: form.totalAmount,
        valuePayment: form.paidAmount,
        typePayment: [
          ...(form.paymentCash > 0 ? [{ methodId: null, amount: form.paymentCash }] : []),
          ...(form.paymentTransfer > 0 ? [{ methodId: null, amount: form.paymentTransfer }] : []),
          ...(form.paymentCard > 0 ? [{ methodId: null, amount: form.paymentCard }] : []),
          ...(form.paymentOther > 0 ? [{ methodId: null, amount: form.paymentOther }] : [])
        ],
        items: products.map(p => ({
          productId: p._id,
          amount: p.qty,
          value: p.price,
          discountValue: p.discountType === 'percentage' ? (p.price * p.discountValue / 100) : p.discountValue,
          discountType: 'number',
          total: p.total,
          note: p.imei ? `IMEI: ${p.imei}` : ''
        })),
      };

      if (editId) {
        await http.post(`/products/sales/${editId}/cancel`);
      }

      const createRes = await http.post('/products/sales', salePayload);
      const saleId = createRes.data._id;

      await http.post(`/products/sales/${saleId}/complete`);

      setSuccessMessage(`✅ Hóa đơn đã được lưu & tồn kho đã được trừ tự động! Mã: ${createRes.data.code}`);
      if (form.autoPrint && printPopup) {
        const receiptBranch = await resolveBranchForReceipt(createRes.data, branch, activeBranchId);
        const profile = buildInvoiceProfile(receiptBranch || undefined);
        const customerText = `${form.customerName || 'Khách lẻ'}${form.customerPhone ? ` (${form.customerPhone})` : ''}`;
        const html = buildReceiptHtml({
          profile,
          title: profile.templateConfig?.title || 'HÓA ĐƠN',
          date: new Date().toLocaleDateString('vi-VN'),
          code: createRes.data.code || saleId,
          customer: customerText,
          sections: [{
            lines: products.map((product) => ({
              name: [product.code, product.name].filter(Boolean).join(' - '),
              quantity: product.qty,
              price: receiptMoney(product.price),
              total: receiptMoney(product.total),
            })),
          }],
          summary: [
            { label: 'Tổng cộng', value: receiptMoney(totalCost) },
            { label: 'Chiết khấu', value: receiptMoney(form.orderDiscount) },
            { label: 'Thành tiền', value: receiptMoney(form.totalAmount), strong: true },
            { label: 'Đã thanh toán', value: receiptMoney(form.paidAmount) },
            { label: 'Còn nợ', value: receiptMoney(form.debtAmount) },
          ],
        });
        writeAndPrintPopup(printPopup, html);
      }
      setTimeout(() => {
        navigate(`/sales-channels/${channel}/wholesale`);
      }, 1200);
    } catch (err: any) {
      printPopup?.close();
      console.error(err);
      setErrorMessage(err.response?.data?.message ?? 'Lỗi khi lưu hóa đơn bán sỉ.');
      setIsSaving(false);
    }
  };

  // Local Search Autocomplete list (filtered by stock in the selected warehouse)
  const autocompleteList = searchQuery.trim() === '' ? [] : dbProducts.filter(p => {
    const keyword = searchQuery.toLowerCase();
    const matchesSearch = p.barcode?.toLowerCase() === keyword || p.code?.toLowerCase() === keyword || p.name?.toLowerCase().includes(keyword) || p.code?.toLowerCase().includes(keyword) || p.barcode?.toLowerCase().includes(keyword);
    const stock = getStockForWarehouse(p);
    return matchesSearch && stock > 0;
  }).slice(0, 10);

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Top Banner and Navigation Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            type="button" 
            onClick={() => navigate(`/sales-channels/${channel}/wholesale`)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              border: '1px solid #e2e8f0', 
              background: '#ffffff', 
              cursor: 'pointer',
              color: '#475569',
              transition: 'all 0.2s'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Tạo Mới Hóa Đơn Bán Sỉ
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Warehouse size={14} color="#7c3aed" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  Kho xuất: {loadingBranch ? 'Đang tải...' : (branch ? `${branch.name} (${branch.code})` : 'Chưa chọn kho')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Briefcase size={14} color="#059669" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  Thu ngân: {form.cashier}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            type="button"
            onClick={() => navigate(`/sales-channels/${channel}/wholesale`)}
            style={{ borderRadius: '10px', padding: '10px 20px', fontSize: '14px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
          >
            Hủy bỏ
          </button>
          <button 
            type="button"
            id="save-invoice-btn"
            disabled={isSaving || !activeBranchId}
            onClick={handleSave}
            style={{ 
              borderRadius: '10px', 
              padding: '10px 24px', 
              fontSize: '14px', 
              fontWeight: '600', 
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', 
              color: '#ffffff',
              border: 'none', 
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isSaving || !activeBranchId ? 'not-allowed' : 'pointer',
              opacity: isSaving || !activeBranchId ? 0.7 : 1
            }}
          >
            <Save size={16} />
            {isSaving ? 'Đang lưu...' : 'Lưu (F9)'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '500' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#047857', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '500' }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main 70/30 Columns Layout */}
      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column (70%) - Search, Product Table, Notes, Staff */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '18px 20px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>
              Kho thực hiện *
              <select
                value={activeBranchId}
                onChange={(event) => {
                  setActiveBranchId(event.target.value);
                  setProducts([]);
                  setErrorMessage('');
                }}
                disabled={Boolean(editId || requestedBranchId)}
                required
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
              >
                <option value="">— Chọn kho thực hiện —</option>
                {branchOptions.map((item) => <option key={item._id} value={item._id}>{item.name}{item.code ? ` (${item.code})` : ''}</option>)}
              </select>
            </label>
          </div>
          
          {/* Product Search & Table Box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            
            {/* Header: Product Type Tabs & F3 Search Bar */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              
              {/* Product Type Tabs */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  onClick={() => setProductTypeTab('normal')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: productTypeTab === 'normal' ? '#ffffff' : 'transparent',
                    color: productTypeTab === 'normal' ? '#7c3aed' : '#64748b',
                    boxShadow: productTypeTab === 'normal' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm thường
                </button>
                <button
                  type="button"
                  onClick={() => setProductTypeTab('imei')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: productTypeTab === 'imei' ? '#ffffff' : 'transparent',
                    color: productTypeTab === 'imei' ? '#7c3aed' : '#64748b',
                    boxShadow: productTypeTab === 'imei' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm IMEI
                </button>
              </div>

              {/* F3 Autocomplete Product Search Bar */}
              <div style={{ position: 'relative', width: '380px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', background: '#ffffff' }}>
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    id="product-search-input"
                    ref={productSearchRef}
                    data-product-search-scan="true" data-product-search-primary="true" placeholder="(F3) Tìm sản phẩm..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>

                {/* Dropdown Suggestions */}
                {showSearchResults && searchQuery.trim() !== '' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '300px', overflowY: 'auto' }}>
                    {autocompleteList.length > 0 ? (
                      autocompleteList.map(prod => (
                        <div
                          onMouseDown={(e) => { e.preventDefault(); addProduct(prod); }}
                          style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f5f3ff'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Mã: {prod.code} | Tồn: {prod.qty ?? 0} | Giá: {(prod.price ?? 0).toLocaleString('vi-VN')} đ</div>
                          </div>
                          <PlusCircle size={16} color="#7c3aed" />
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        <span>Không tìm thấy sản phẩm. </span>
                        <button type="button" onClick={addCustomProduct} style={{ border: 'none', background: 'none', color: '#7c3aed', fontWeight: '600', cursor: 'pointer', padding: 0 }}>
                          Thêm sản phẩm mới sỉ
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Product Table */}
            <div style={{ overflowX: 'auto', padding: '12px' }}>
              {products.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
                  <Briefcase size={40} color="#cbd5e1" />
                  <span style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có hàng hóa nào được chọn. Nhấn F3 hoặc gõ vào thanh tìm kiếm để thêm sản phẩm sỉ.
                  </span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                      <th style={{ padding: '12px 8px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 8px', width: '50px' }}>Ảnh</th>
                      <th style={{ padding: '12px 8px' }}>Sản phẩm</th>
                      <th style={{ padding: '12px 8px', width: '70px', textAlign: 'center' }}>Số tồn</th>
                      <th style={{ padding: '12px 8px', width: '90px', textAlign: 'center' }}>Số lượng</th>
                      <th style={{ padding: '12px 8px', width: '120px', textAlign: 'right' }}>Giá bán</th>
                      <th style={{ padding: '12px 8px', width: '120px', textAlign: 'right' }}>Chiết khấu</th>
                      <th style={{ padding: '12px 8px', width: '120px', textAlign: 'right' }}>Thành tiền</th>
                      <th style={{ padding: '12px 8px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((prod, idx) => (
                      <tr 
                        key={idx} 
                        style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                        }}
                      >
                        {/* Index */}
                        <td style={{ padding: '12px 8px', color: '#64748b', fontWeight: '500' }}>{idx + 1}</td>
                        
                        {/* Image */}
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', color: '#64748b' }}>
                            <Tag size={16} />
                          </div>
                        </td>

                        {/* Product Detail & IMEI */}
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Mã: {prod.code}</div>
                          
                          {/* Conditionally render IMEI field based on tab selection */}
                          {(productTypeTab === 'imei' || prod.imei !== undefined) && (
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: '#6d28d9', background: '#f5f3ff', padding: '1px 4px', borderRadius: '3px' }}>IMEI</span>
                              <input
                                type="text"
                                placeholder="Nhập mã IMEI sản phẩm sỉ..."
                                value={prod.imei || ''}
                                onChange={(e) => handleProductChange(idx, 'imei', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '180px', outline: 'none' }}
                              />
                            </div>
                          )}
                        </td>

                        {/* Stock */}
                        <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', color: prod.stock <= 5 ? '#e11d48' : '#059669' }}>
                          {prod.stock}
                        </td>

                        {/* Quantity */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            value={prod.qty}
                            onChange={(e) => handleProductChange(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                            style={{ width: '65px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Price */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            value={prod.price || ''}
                            onChange={(e) => handleProductChange(idx, 'price', Number(e.target.value) || 0)}
                            style={{ width: '100px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Discount */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={prod.discountValue || ''}
                              onChange={(e) => handleProductChange(idx, 'discountValue', Number(e.target.value) || 0)}
                              style={{ width: '65px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleProductChange(idx, 'discountType', prod.discountType === 'fixed' ? 'percentage' : 'fixed')}
                              style={{
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                borderRadius: '6px',
                                padding: '4px 6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                color: '#475569',
                                cursor: 'pointer',
                                width: '28px',
                                textAlign: 'center'
                              }}
                            >
                              {prod.discountType === 'percentage' ? '%' : 'đ'}
                            </button>
                          </div>
                        </td>

                        {/* Total Amount */}
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>
                          {(prod.total || 0).toLocaleString('vi-VN')} đ
                        </td>

                        {/* Trash */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeProduct(idx)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', transition: 'transform 0.15s' }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Configuration & Order Meta Info */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#f5f3ff', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                <Briefcase size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Cấu Hình & Phân Loại Hóa Đơn Sỉ</h2>
            </div>
            
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              
              {/* Sales Person */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhân viên bán hàng</span>
                <select 
                  value={form.salesperson} 
                  onChange={(e) => handleChange('salesperson', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff', fontSize: '13px' }}
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {dbStaffs.map(staff => (
                    <option key={staff._id} value={staff.name}>{staff.name}</option>
                  ))}
                </select>
              </div>

              {/* Invoice Label */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhãn hóa đơn sỉ</span>
                <input 
                  type="text" 
                  placeholder="Nhãn (ví dụ: Ưu tiên, Đại lý cấp 1...)" 
                  value={form.wholesaleInvoiceLabel} 
                  onChange={(e) => handleChange('wholesaleInvoiceLabel', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                />
              </div>

              {/* Order Source */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nguồn đơn hàng</span>
                <select 
                  value={form.orderSource} 
                  onChange={(e) => handleChange('orderSource', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff', fontSize: '13px' }}
                >
                  <option value="Trực tiếp">Trực tiếp</option>
                  <option value="Điện thoại">Điện thoại</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Zalo">Zalo</option>
                  <option value="Website">Website</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>

              {/* General Note */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ghi chú hóa đơn</span>
                <input 
                  type="text" 
                  placeholder="Ghi chú thêm về đơn hàng bán sỉ..." 
                  value={form.description} 
                  onChange={(e) => handleChange('description', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                />
              </div>

            </div>
          </div>
        </div>

        {/* Right Column (30%) - Customer details, VAT, Payment summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Customer Card */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#e0f2fe', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                <User size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Khách Hàng Doanh Nghiệp</h2>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Phone number & Lookup action */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Số điện thoại (F4)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Phone size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    id="customer-phone-input"
                    placeholder="Nhập SĐT tìm kiếm..." 
                    value={form.customerPhone} 
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    onChange={(e) => {
                      handleChange('customerPhone', e.target.value);
                      lookupCustomer(e.target.value);
                    }} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b', fontSize: '13px' }} 
                  />
                </div>
              </div>

              {/* Customer Name & Card Code */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tên khách hàng <span style={{ color: '#ef4444' }}>*</span></span>
                  <input 
                    type="text" 
                    required
                    placeholder="Tên khách đại lý / sỉ" 
                    value={form.customerName} 
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    onChange={(e) => {
                      handleChange('customerName', e.target.value);
                      setShowCustomerDropdown(true);
                    }} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                  />
                  {showCustomerDropdown && (form.customerName.trim().length > 0 || form.customerPhone.trim().length > 0) && customerSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                      {customerSuggestions.map(c => (
                        <div key={c._id} onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.name} - {c.phone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Mã thẻ</span>
                  <input 
                    type="text" 
                    placeholder="Mã đại lý" 
                    value={form.customerCode} 
                    onChange={(e) => handleChange('customerCode', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                  />
                </div>
              </div>

              {/* Email & Date of Birth */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Email</span>
                  <input 
                    type="email" 
                    placeholder="email@example.com" 
                    value={form.email} 
                    onChange={(e) => handleChange('email', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ngày sinh</span>
                  <input 
                    type="date" 
                    value={form.dob} 
                    onChange={(e) => handleChange('dob', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '9px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                  />
                </div>
              </div>

              {/* Region & Detail Address */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tỉnh/Thành phố, Quận/Huyện, Phường/Xã</span>
                <input 
                  type="text" 
                  placeholder="Tỉnh/Thành phố, Phường/Xã" 
                  value={form.addressLocation} 
                  onChange={(e) => handleChange('addressLocation', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Địa chỉ cụ thể</span>
                <input 
                  type="text" 
                  placeholder="Số nhà, tên đường..." 
                  value={form.address} 
                  onChange={(e) => handleChange('address', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                />
              </div>

              {/* Company Info for Wholesale Enterprises */}
              <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: '10px', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={14} color="#7c3aed" /> Thông tin doanh nghiệp sỉ
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Tên công ty</span>
                  <input 
                    type="text" 
                    placeholder="Tên công ty xuất hóa đơn" 
                    value={form.companyName} 
                    onChange={(e) => handleChange('companyName', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Mã số thuế</span>
                  <input 
                    type="text" 
                    placeholder="Mã số thuế công ty sỉ" 
                    value={form.taxId} 
                    onChange={(e) => handleChange('taxId', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Số PO - Hợp đồng</span>
                    <input 
                      type="text" 
                      placeholder="Số hợp đồng PO" 
                      value={form.poContractNumber} 
                      onChange={(e) => handleChange('poContractNumber', e.target.value)} 
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Ngày ký hợp đồng</span>
                    <input 
                      type="date" 
                      value={form.contractSigningDate} 
                      onChange={(e) => handleChange('contractSigningDate', e.target.value)} 
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '9px 12px', outline: 'none', color: '#1e293b', fontSize: '13px' }} 
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* VAT Invoice Details Card */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fef3c7', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                  <FileText size={15} />
                </div>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Hóa đơn VAT</h2>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#6d28d9' }}>
                <input
                  type="checkbox"
                  checked={form.hasVat}
                  onChange={(e) => handleChange('hasVat', e.target.checked)}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                />
                Xuất hóa đơn
              </label>
            </div>

            {form.hasVat && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fffbeb' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Số hóa đơn VAT</span>
                  <input 
                    type="text" 
                    placeholder="Số hóa đơn VAT đỏ" 
                    value={form.vatInvoiceNumber} 
                    onChange={(e) => handleChange('vatInvoiceNumber', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '13px', background: '#ffffff' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Ngày xuất hóa đơn</span>
                  <input 
                    type="date" 
                    value={form.vatInvoiceDate} 
                    onChange={(e) => handleChange('vatInvoiceDate', e.target.value)} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '9px 12px', outline: 'none', color: '#1e293b', fontSize: '13px', background: '#ffffff' }} 
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payment Sum, Multi-Method & Debt Card */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#fee2e2', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <CreditCard size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Thanh Toán & Công Nợ Sỉ</h2>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Order discount, VAT% and auto checkbox */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
                
                {/* Auto discount toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Bỏ chiết khấu tự động</span>
                  <input
                    type="checkbox"
                    checked={!form.autoDiscount}
                    onChange={(e) => handleChange('autoDiscount', !e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </div>

                {/* Subtotal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                  <span>Tạm tính sỉ (chưa chiết khấu đơn):</span>
                  <span style={{ fontWeight: '700', color: '#1e293b' }}>
                    {products.reduce((acc, p) => acc + (p.price * p.qty), 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>

                {/* Order Discount Input */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Chiết khấu đơn (đ):</span>
                  <input 
                    type="number" 
                    min={0}
                    value={form.orderDiscount || ''}
                    onChange={(e) => handleChange('orderDiscount', Number(e.target.value) || 0)}
                    style={{ width: '130px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                  />
                </div>

                {/* VAT Percent Input */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Thuế VAT (%):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input 
                      type="number" 
                      min={0}
                      max={100}
                      disabled={!form.hasVat}
                      value={form.vatPercent}
                      onChange={(e) => handleChange('vatPercent', Number(e.target.value) || 0)}
                      style={{ width: '70px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none', background: form.hasVat ? '#ffffff' : '#f1f5f9' }}
                    />
                    <Percent size={13} color="#64748b" />
                  </div>
                </div>

              </div>

              {/* Split Payment inputs to match "Khách thanh toán" */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Coins size={14} color="#059669" /> Chi tiết khách thanh toán sỉ
                </span>

                {/* Cash */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Tiền mặt (đ):</span>
                  <input 
                    type="number" 
                    min={0}
                    placeholder="0"
                    value={form.paymentCash || ''}
                    onChange={(e) => handleChange('paymentCash', Number(e.target.value) || 0)}
                    style={{ width: '150px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                  />
                </div>

                {/* Transfer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Chuyển khoản (đ):</span>
                  <input 
                    type="number" 
                    min={0}
                    placeholder="0"
                    value={form.paymentTransfer || ''}
                    onChange={(e) => handleChange('paymentTransfer', Number(e.target.value) || 0)}
                    style={{ width: '150px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                  />
                </div>

                {/* Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Quẹt thẻ (đ):</span>
                  <input 
                    type="number" 
                    min={0}
                    placeholder="0"
                    value={form.paymentCard || ''}
                    onChange={(e) => handleChange('paymentCard', Number(e.target.value) || 0)}
                    style={{ width: '150px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                  />
                </div>

                {/* Other */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Khác (đ):</span>
                  <input 
                    type="number" 
                    min={0}
                    placeholder="0"
                    value={form.paymentOther || ''}
                    onChange={(e) => handleChange('paymentOther', Number(e.target.value) || 0)}
                    style={{ width: '150px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                  />
                </div>

                {/* Prepaid From Order */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    Đã thanh toán từ đơn hàng (đ):
                  </span>
                  <input 
                    type="number" 
                    min={0}
                    placeholder="0"
                    value={form.prepaidFromOrder || ''}
                    onChange={(e) => handleChange('prepaidFromOrder', Number(e.target.value) || 0)}
                    style={{ width: '150px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                  />
                </div>

              </div>

              {/* Total Paid & Debt Outputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                
                {/* Total amount payable */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Tổng tiền phải thanh toán:</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#7c3aed' }}>
                    {form.totalAmount.toLocaleString('vi-VN')} đ
                  </span>
                </div>

                {/* Remaining Debt */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Công nợ khách còn nợ sỉ:</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: form.debtAmount > 0 ? '#e11d48' : '#059669' }}>
                    {form.debtAmount.toLocaleString('vi-VN')} đ
                  </span>
                </div>

                {/* Status Indicator Tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Trạng thái thanh toán sỉ:</span>
                  <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', background: form.status === 'Còn nợ' ? '#fff1f2' : '#ecfdf5', color: form.status === 'Còn nợ' ? '#e11d48' : '#047857' }}>
                    {form.status}
                  </span>
                </div>

              </div>

              {/* Auto print checkbox and Save action */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={form.autoPrint}
                    onChange={(e) => handleChange('autoPrint', e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  Tự động in sau khi lưu hóa đơn (F10)
                </label>

                <button 
                  type="submit"
                  disabled={isSaving}
                  style={{ 
                    width: '100%',
                    borderRadius: '10px', 
                    padding: '12px 24px', 
                    fontSize: '15px', 
                    fontWeight: '700', 
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', 
                    color: '#ffffff',
                    border: 'none', 
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1
                  }}
                >
                  <Save size={18} />
                  {isSaving ? 'Đang lưu hóa đơn sỉ...' : 'Xác nhận & Lưu sỉ'}
                </button>
              </div>

            </div>
          </div>

        </div>

      </form>
    </div>
  );
}


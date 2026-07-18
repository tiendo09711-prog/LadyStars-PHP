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
  PlusCircle,
  ShieldAlert,
  Coins,
  MapPin,
  Facebook,
  Printer,
  CalendarRange
} from 'lucide-react';
import { http } from '../../core/api/http';
import { buildInvoiceProfile, getBranch } from '../../core/api/branch.api';
import { buildReceiptHtml, receiptMoney, writeAndPrintPopup } from './invoicePrint';

const PRINT_WINDOW_FEATURES = 'popup=yes,width=420,height=720';

function openRefundReceiptWindow() {
  return window.open('about:blank', 'refund-invoice-print', PRINT_WINDOW_FEATURES);
}

function branchIdFromValue(value: any) {
  return typeof value === 'string' ? value : value?._id || '';
}

async function resolveRefundBranchForReceipt(source: any, fallbackBranch: any, fallbackBranchId?: string | null) {
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

interface RefundProduct {
  _id?: string;
  code: string;
  name: string;
  stock: number;
  qty: number;
  maxQty?: number;
  returnedQty?: number;
  price: number;
  cost: number;
  unit: string;
  barcode?: string;
  imei?: string;
  batch?: string;
  brand?: string;
  vat: number;
  refundFee: number;
  extendedWarrantyName?: string;
  extendedWarrantyFee: number;
  gift?: string;
  giftCost: number;
  total: number;
}

export function RefundInvoiceCreatePage() {
  const { channel } = useParams();
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const saleId = searchParams.get('saleId');
  const navigate = useNavigate();

  const [branch, setBranch] = useState<any>(null);
  const [resolvedBranchId, setResolvedBranchId] = useState(branchId || '');
  const [branchOptions, setBranchOptions] = useState<any[]>([]);
  const [sourceSaleHasBranch, setSourceSaleHasBranch] = useState(Boolean(branchId));
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [saleGuardMessage, setSaleGuardMessage] = useState('');

  // Form state structure matching Nhanh.vn Refund CSV and exchange functionality
  const [form, setForm] = useState({
    id: 'HDTH-' + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    paymentId: '',
    returnOrderId: '',
    receiver: '',
    salesAccount: '',
    salesperson: '',
    cashier: '',
    type: 'Trả lại bán lẻ [L]',
    warehouse: '',
    description: '', // Ghi chú hóa đơn trả
    newDescription: '', // Ghi chú hóa đơn mua mới
    returnFromInvoice: '',
    returnFromOrder: '',
    status: 'Mới',

    // Customer Info (Extended)
    customerPhone: '',
    customerName: '',
    email: '',
    address: '',
    gender: 'Nữ',
    facebook: '',
    birthday: '',
    customerLevel: 'Đồng',
    source: 'Trực tiếp',
    cardId: '',
    labels: '',
    province: '',
    district: '',
    ward: '',
    companyAddress: '',
    companyName: '',
    taxId: '',
    note: '', // Ghi chú khách hàng

    // Order Totals / Aggregates
    discount: 0, // Chiết khấu đơn hàng (F6)
    discountType: 'number',
    cash: 0,
    transfer: 0,
    card: 0, // Quẹt thẻ
    totalAmount: 0, // Tổng tiền chênh lệch (Cửa hàng trả khách nếu >0, Khách trả cửa hàng nếu <0)
    refundAmount: 0, // Thực tế trả khách (nếu totalAmount > 0)
    refundFee: 0, // Tổng phí trả hàng
    
    // Auto flags
    autoDiscount: false, // Bỏ chiết khấu tự động
    autoPoint: false, // Bỏ tích điểm tự động
    coupon: '',
    autoPrint: true, // Tự động in sau khi lưu hóa đơn(F10)
  });

  // Refunded Products state
  const [products, setProducts] = useState<RefundProduct[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // New Purchased Products state
  const [newProducts, setNewProducts] = useState<RefundProduct[]>([]);
  
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [returnableProducts, setReturnableProducts] = useState<RefundProduct[]>([]);
  const [newProductSearchLoading, setNewProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState('');
  const [newProductSearchError, setNewProductSearchError] = useState('');
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({});

  // Source order financial data (loaded once from original sale) - used for fair proration of discounts
  const [sourceDiscount, setSourceDiscount] = useState(0);
  const [originalOrderSubtotal, setOriginalOrderSubtotal] = useState(0);
  
  // Search state for refund products
  const [searchQuery, setSearchQuery] = useState('');
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [productTypeTab, setProductTypeTab] = useState<'normal' | 'imei'>('normal');

  // Search state for new purchased products
  const [newSearchQuery, setNewSearchQuery] = useState('');
  const newProductSearchRef = useRef<HTMLInputElement>(null);
  const [showNewSearchResults, setShowNewSearchResults] = useState(false);
  const [newProductTypeTab, setNewProductTypeTab] = useState<'normal' | 'imei'>('normal');

  const productSearchBoxRef = useRef<HTMLDivElement>(null);
  const newProductSearchBoxRef = useRef<HTMLDivElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch branch details
  useEffect(() => {
    http.get('/system/branches')
      .then((res) => setBranchOptions((res.data?.items || []).filter((item: any) => item.isActive !== false)))
      .catch(() => setBranchOptions([]));
  }, []);

  // Fetch branch details
  useEffect(() => {
    if (resolvedBranchId) {
      setLoadingBranch(true);
      http.get(`/system/branches/${resolvedBranchId}`)
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
  }, [resolvedBranchId]);

  // Load sale data if saleId is present
  useEffect(() => {
    if (saleId) {
      http.get(`/products/sales/${saleId}`)
        .then(res => {
          const sale = res.data;
          const saleBranchId = sale.branchId?._id || sale.branchId || '';
          const resolvedBranchId = saleBranchId || branchId || '';
          setSourceSaleHasBranch(Boolean(saleBranchId || branchId));
          setResolvedBranchId(resolvedBranchId);
          const saleStatus = String(sale.status || '').toLowerCase();
          const refundStatus = String(sale.refundStatus || 'none').toLowerCase();
          const remainingReturnableQuantity = Number(sale.remainingReturnableQuantity || 0);
          if (saleStatus === 'cancelled') {
            setSaleGuardMessage('Hóa đơn đã hủy nên không thể đổi trả.');
          } else if (saleStatus !== 'completed') {
            setSaleGuardMessage('Chỉ hóa đơn đã hoàn tất mới được đổi trả.');
          } else if (refundStatus === 'full' || remainingReturnableQuantity <= 0) {
            setSaleGuardMessage('Hóa đơn đã hoàn toàn bộ nên không thể đổi trả thêm.');
          } else {
            setSaleGuardMessage('');
          }
          const returnedQuantityByProduct = sale.returnedQuantityByProduct || {};
          if (!branch && resolvedBranchId) {
            http.get(`/system/branches/${resolvedBranchId}`)
              .then((branchRes) => {
                setBranch(branchRes.data);
                setForm(prev => ({ ...prev, warehouse: branchRes.data?.name || prev.warehouse }));
              })
              .catch(() => null);
          }
          const custObj = sale.customerId && typeof sale.customerId === 'object' ? sale.customerId : null;
          const nextCustomerName = custObj?.name || sale.customerName || '';
          const nextCustomerPhone = custObj?.phone || sale.customerPhone || '';
          setForm(prev => ({
            ...prev,
            paymentId: sale._id,
            customerName: nextCustomerName,
            customerPhone: nextCustomerPhone,
            address: custObj?.address || sale.customerAddress || '',
            email: custObj?.email || sale.customerEmail || '',
          }));
          // If sale only has customer id string, hydrate name/phone for form validation.
          const customerIdRaw = custObj?._id || custObj?.id || (typeof sale.customerId === 'string' ? sale.customerId : '');
          if ((!nextCustomerName || !nextCustomerPhone) && customerIdRaw) {
            http
              .get(`/customers/customers/${customerIdRaw}`)
              .then((custRes) => {
                const c = custRes.data;
                if (!c) return;
                setForm((prev) => ({
                  ...prev,
                  customerName: prev.customerName || c.name || '',
                  customerPhone: prev.customerPhone || c.phone || '',
                  address: prev.address || c.address || '',
                  email: prev.email || c.email || '',
                }));
              })
              .catch(() => null);
          }

          // Compute original order financials for proration of source discount (anti-abuse)
          // Must use the full original subtotal and discountValue from the source sale,
          // regardless of how many prior partial refunds happened (backend already limits via returnedQuantityByProduct).
          const subtotal = (sale.items || []).reduce((sum: number, item: any) => {
            return sum + (Number(item.value) || 0) * (Number(item.amount || item.qty) || 0);
          }, 0);
          setOriginalOrderSubtotal(subtotal);
          const disc = Number(sale.discountValue ?? sale.discount ?? 0);
          setSourceDiscount(disc);
          
          if (sale.items && Array.isArray(sale.items)) {
            const sourceItems = sale.items.map((item: any) => {
              const pidRaw = item.productId;
              const pid = (pidRaw && typeof pidRaw === 'object') ? (pidRaw._id || pidRaw.id || '') : (pidRaw || '');
              const retForPid = Number(returnedQuantityByProduct[pid] || 0);
              const maxRet = Math.max((Number(item.amount) || 0) - retForPid, 0);
              return {
                _id: (pidRaw && typeof pidRaw === 'object') ? (pidRaw._id || pidRaw.id || pid) : pidRaw,
                code: (pidRaw && typeof pidRaw === 'object' ? pidRaw.code : '') || item.productCode || item.code || '',
                name: (pidRaw && typeof pidRaw === 'object' ? pidRaw.name : '') || item.productName || item.name || '',
                stock: (pidRaw && typeof pidRaw === 'object' ? pidRaw.qty : 0) || 0,
                qty: maxRet,
                maxQty: maxRet,
                returnedQty: retForPid,
                price: item.value,
                cost: (pidRaw && typeof pidRaw === 'object' ? pidRaw.cost : 0) || 0,
                unit: (pidRaw && typeof pidRaw === 'object' ? pidRaw.unit : 'Cái') || 'Cái',
                barcode: (pidRaw && typeof pidRaw === 'object' ? pidRaw.barcode : '') || item.barcode || '',
                vat: 0,
                refundFee: 0,
                extendedWarrantyFee: 0,
                giftCost: 0,
                total: item.total || (item.value * item.amount)
              };
            }).filter((item: RefundProduct) => Number(item.maxQty || 0) > 0);
            setReturnableProducts(sourceItems);
            setProducts(sourceItems);

            // Hydrate missing product code/name when sale payload only has product ids.
            const missing = sourceItems.filter((p: RefundProduct) => p._id && (!p.code || !p.name));
            if (missing.length) {
              Promise.all(
                missing.map((p: RefundProduct) =>
                  http
                    .get(`/products/products/${p._id}`)
                    .then((res) => ({ id: String(p._id), data: res.data }))
                    .catch(() => null),
                ),
              ).then((rows) => {
                const map = new Map(
                  rows
                    .filter((row): row is { id: string; data: any } => Boolean(row))
                    .map((row) => [String(row.id), row.data]),
                );
                if (!map.size) return;
                const patch = (list: RefundProduct[]) =>
                  list.map((line) => {
                    const prod = map.get(String(line._id));
                    if (!prod) return line;
                    return {
                      ...line,
                      code: line.code || prod.code || '',
                      name: line.name || prod.name || '',
                      barcode: line.barcode || prod.barcode || '',
                      unit: line.unit || prod.unit || 'Cái',
                      cost: line.cost || Number(prod.cost) || 0,
                    };
                  });
                setReturnableProducts((prev) => patch(prev));
                setProducts((prev) => patch(prev));
              });
            }
          }
        })
        .catch(err => console.error("Lỗi lấy thông tin hóa đơn:", err));
    }
  }, [branch, branchId, saleId]);

  useEffect(() => {
    const query = newSearchQuery.trim();
    if (!query || !resolvedBranchId) {
      setDbProducts([]);
      setNewProductSearchError('');
      setNewProductSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setNewProductSearchLoading(true);
      setNewProductSearchError('');
      http.get('/products/inventories', {
        params: { branchId: resolvedBranchId, q: query, limit: 20 },
        signal: controller.signal,
      })
        .then((res) => {
          const items = Array.isArray(res.data?.items) ? res.data.items : [];
          setDbProducts(items.filter((item: any) => getBranchStock(item) > 0));
        })
        .catch((err) => {
          if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
          setDbProducts([]);
          setNewProductSearchError(err?.response?.data?.message || 'Không tải được danh sách sản phẩm.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setNewProductSearchLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [newSearchQuery, resolvedBranchId]);

  useEffect(() => {
    http.get('/products/payment-methods', { params: { limit: 5000 } })
      .then((res) => {
        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        setPaymentMethods(items.filter((item: any) => item.isActive !== false));
      })
      .catch((err) => {
        console.error('Loi lay phuong thuc thanh toan:', err);
      });
  }, []);

  // Hotkeys Hook: F3 search, F4 phone search, F9 save
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (productSearchBoxRef.current && target && !productSearchBoxRef.current.contains(target)) {
        setShowSearchResults(false);
      }
      if (newProductSearchBoxRef.current && target && !newProductSearchBoxRef.current.contains(target)) {
        setShowNewSearchResults(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSearchResults(false);
        setShowNewSearchResults(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Auto-calculator engine for returns and purchases
  // IMPORTANT: Rewritten to correctly prorate source discount from original order.
  // Why prorate?
  //   - Original sale may have had a discount (e.g. 10% or fixed 1tr on 10tr subtotal).
  //   - If customer returns only expensive or only cheap items, using full original discount
  //     would let customer "keep" the discount benefit unfairly (or shop loses).
  //   - Solution: prorate the original discount by (returned goods value / original goods subtotal).
  //   - Credit for returns = returnedSubtotal - prorated portion of sourceDiscount.
  //   - This is applied on goods price only (the part discount was calculated on).
  //   - VAT, extended warranty, refund fee on return lines are applied in full on top (not prorated).
  //   - New purchase discount (form.discount) remains independent and only affects purchases side.
  // All cases (no-discount, full return, partial, pure refund, exchange, edit price/qty, multiple refunds) handled.
  // Edge: originalOrderSubtotal <=0 or sourceDiscount=0 => no prorate effect.
  // Numbers are always derived from current `products` state (supports live edit of price/qty on return table).
  useEffect(() => {
    let tempReturnsSubtotal = 0;
    let tempReturnsRefundFee = 0;
    let tempReturnsVat = 0;
    let tempReturnsWarranty = 0;

    const updatedProducts = products.map(prod => {
      const lineTotal = Math.max(0, (prod.price * prod.qty) + (prod.vat || 0) + (prod.extendedWarrantyFee || 0) - (prod.refundFee || 0));
      tempReturnsSubtotal += prod.price * prod.qty;
      tempReturnsRefundFee += prod.refundFee || 0;
      tempReturnsVat += prod.vat || 0;
      tempReturnsWarranty += prod.extendedWarrantyFee || 0;
      return { ...prod, total: lineTotal };
    });

    const hasReturnsChanged = updatedProducts.some((p, i) => p.total !== products[i]?.total);
    if (hasReturnsChanged) {
      setProducts(updatedProducts);
      return;
    }

    let tempPurchasesSubtotal = 0;
    let tempPurchasesVat = 0;
    let tempPurchasesWarranty = 0;

    const updatedNewProducts = newProducts.map(prod => {
      const lineTotal = Math.max(0, (prod.price * prod.qty) + (prod.vat || 0) + (prod.extendedWarrantyFee || 0));
      tempPurchasesSubtotal += prod.price * prod.qty;
      tempPurchasesVat += prod.vat || 0;
      tempPurchasesWarranty += prod.extendedWarrantyFee || 0;
      return { ...prod, total: lineTotal };
    });

    const hasPurchasesChanged = updatedNewProducts.some((p, i) => p.total !== newProducts[i]?.total);
    if (hasPurchasesChanged) {
      setNewProducts(updatedNewProducts);
      return;
    }

    // === Core fair credit calculation with proration ===
    const returnedSubtotal = tempReturnsSubtotal; // only goods price * qty (realtime from editable table)
    const returnRatio = originalOrderSubtotal > 0
      ? Math.min(returnedSubtotal / originalOrderSubtotal, 1)
      : 0;
    const proratedDiscount = sourceDiscount * returnRatio;
    const effectiveReturnCredit = Math.max(0, returnedSubtotal - proratedDiscount);

    // full credit for net = adjusted goods credit + return extras (vat/warranty) - return fees
    // this ensures when sourceDiscount===0 we get identical net as before (preserve behavior)
    const totalReturnsAdjusted = effectiveReturnCredit + tempReturnsVat + tempReturnsWarranty - tempReturnsRefundFee;

    const totalPurchases = tempPurchasesSubtotal + tempPurchasesVat + tempPurchasesWarranty;

    // newOrderDiscount: chiết khấu áp dụng chỉ cho hàng mua mới (giữ nguyên)
    const discountValue = Math.max(Number(form.discount) || 0, 0);
    const newOrderDiscount = form.discountType === 'percent'
      ? Math.min(totalPurchases, totalPurchases * Math.min(discountValue, 100) / 100)
      : Math.min(totalPurchases, discountValue);

    const netTotal = totalReturnsAdjusted - Math.max(totalPurchases - newOrderDiscount, 0);

    setForm(prev => {
      const calculatedRefundAmount = netTotal > 0 ? netTotal : 0;
      if (
        prev.totalAmount === netTotal &&
        prev.refundAmount === calculatedRefundAmount &&
        prev.refundFee === tempReturnsRefundFee
      ) {
        return prev;
      }
      return {
        ...prev,
        totalAmount: netTotal,
        refundAmount: calculatedRefundAmount,
        refundFee: tempReturnsRefundFee
      };
    });
  }, [
    products,
    newProducts,
    form.discount,
    form.discountType,
    sourceDiscount,
    originalOrderSubtotal
  ]);

  const handleChange = (field: string, value: any) => {
    // Staff identity from original sale is read-only; customer contact fields remain editable
    // so guest returns / phone lookup corrections still work (CR-060..CR-065).
    const readOnlyFields = new Set([
      'receiver', 'salesperson', 'salesAccount',
    ]);
    if (readOnlyFields.has(field)) return;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const selectCustomer = (c: any) => {
    setForm(prev => ({
      ...prev,
      customerPhone: c.phone || prev.customerPhone,
      customerName: c.name || '',
      email: c.email || '',
      address: c.address || '',
      gender: c.gender || 'N?',
      facebook: c.facebook || '',
      birthday: c.birthday || '',
      customerLevel: c.customerLevel || '??ng',
      cardId: c.cardId || '',
      labels: c.labels || '',
      companyAddress: c.companyAddress || '',
      companyName: c.companyName || c.company || '',
      taxId: c.taxId || c.vat || '',
      note: c.note || '',
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

  // Add Product Helpers (Refund Products)
  const normalizeSearchValue = (value: string) => value.trim().toLowerCase();

  const getBranchStock = (prod: any) => {
    const availableStock = Number(prod.availableStock);
    if (Number.isFinite(availableStock) && availableStock > 0) return availableStock;

    const selectedStock = Number(prod.selectedStock);
    if (Number.isFinite(selectedStock) && selectedStock > 0) {
      return Math.max(selectedStock - Math.max(Number(prod.lockedQuantity) || 0, 0), 0);
    }

    const branchStock = Number(prod.stockByBranchId?.[resolvedBranchId]);
    if (Number.isFinite(branchStock) && branchStock > 0) return branchStock;

    return Number(prod.totalStock ?? prod.qty ?? prod.stock ?? 0) || 0;
  };

  const findExactReturnProduct = (rawBarcode: string) => {
    const lower = normalizeSearchValue(rawBarcode);
    return returnableProducts.filter((p) =>
      String(p.barcode || '').trim().toLowerCase() === lower
      || String(p.code || '').trim().toLowerCase() === lower
    );
  };

  const findExactNewProduct = async (rawBarcode: string) => {
    const query = rawBarcode.trim();
    if (!query || !resolvedBranchId) return [];
    const res = await http.get('/products/inventories', { params: { branchId: resolvedBranchId, q: query, limit: 20 } });
    const lower = normalizeSearchValue(query);
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    return items.filter((item: any) => (
      String(item.barcode || '').trim().toLowerCase() === lower
      || String(item.code || '').trim().toLowerCase() === lower
    ) && getBranchStock(item) > 0);
  };

  const handleProductScan = (rawBarcode: string) => {
    const exactMatches = findExactReturnProduct(rawBarcode);
    if (exactMatches.length === 1) {
      addProduct(exactMatches[0]);
      window.setTimeout(() => productSearchRef.current?.focus(), 0);
      return;
    }
    setSearchQuery(rawBarcode.trim());
    setProductSearchError(exactMatches.length === 0 ? 'Sản phẩm quét không thuộc hóa đơn gốc hoặc đã hết số lượng có thể trả.' : 'Có nhiều sản phẩm khớp barcode, vui lòng chọn trong danh sách.');
    setShowSearchResults(true);
  };

  const handleNewProductScan = async (rawBarcode: string) => {
    setNewProductSearchLoading(true);
    setNewProductSearchError('');
    try {
      const exactMatches = await findExactNewProduct(rawBarcode);
      if (exactMatches.length === 1) {
        addNewProduct(exactMatches[0]);
        window.setTimeout(() => newProductSearchRef.current?.focus(), 0);
        return;
      }
      setNewSearchQuery(rawBarcode.trim());
      setNewProductSearchError(exactMatches.length === 0 ? 'Không tìm thấy sản phẩm còn tồn tại kho của hóa đơn gốc.' : 'Có nhiều sản phẩm khớp barcode, vui lòng chọn trong danh sách.');
      setShowNewSearchResults(true);
    } catch (err: any) {
      setNewProductSearchError(err?.response?.data?.message || 'Không tìm được barcode sản phẩm.');
      setNewSearchQuery(rawBarcode.trim());
      setShowNewSearchResults(true);
    } finally {
      setNewProductSearchLoading(false);
    }
  };

  useProductScanTarget(productSearchRef, handleProductScan);
  useProductScanTarget(newProductSearchRef, handleNewProductScan);

  const addProduct = (prod: RefundProduct) => {
    const maxQty = Number(prod.maxQty || 0);
    if (!prod._id || maxQty <= 0) {
      setProductSearchError('Sản phẩm không còn số lượng có thể trả.');
      return;
    }
    const existing = products.find(p => p._id === prod._id || p.code === prod.code);
    if (existing) {
      if (Number(existing.qty || 0) >= Number(existing.maxQty || maxQty)) {
        setProductSearchError('Số lượng trả không được vượt số lượng còn có thể trả.');
        return;
      }
      setProducts(products.map(p => (p._id === prod._id || p.code === prod.code) ? { ...p, qty: Math.min(Number(p.qty || 0) + 1, Number(p.maxQty || maxQty)) } : p));
    } else {
      setProducts([...products, { ...prod, qty: 1, maxQty, total: prod.price ?? 0 }]);
    }
    setProductSearchError('');
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleProductChange = (index: number, key: keyof RefundProduct, val: any) => {
    const updated = [...products];
    const nextValue = key === 'qty'
      ? Math.max(0, Math.min(Number(val) || 0, Number(updated[index].maxQty ?? updated[index].qty ?? 0)))
      : val;
    updated[index] = { ...updated[index], [key]: nextValue };
    setProducts(updated);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  // Add Product Helpers (New Purchase Products)
  const addNewProduct = (prod: any) => {
    const branchStock = getBranchStock(prod);
    if (!prod._id || branchStock <= 0) {
      setNewProductSearchError('Sản phẩm không có tồn tại kho của hóa đơn gốc.');
      return;
    }
    const existing = newProducts.find(p => p._id === prod._id || p.code === prod.code);
    if (existing) {
      if (Number(existing.qty || 0) >= Number(existing.stock || branchStock)) {
        setNewProductSearchError('Số lượng mua mới không được vượt tồn kho thực tế.');
        return;
      }
      setNewProducts(newProducts.map(p => (p._id === prod._id || p.code === prod.code) ? { ...p, qty: Math.min(Number(p.qty || 0) + 1, Number(p.stock || branchStock)) } : p));
    } else {
      setNewProducts([
        ...newProducts,
        {
          _id: prod._id,
          code: prod.code,
          name: prod.name,
          stock: branchStock,
          qty: 1,
          price: prod.price ?? 0,
          cost: prod.cost ?? 0,
          unit: prod.unit ?? 'Cái',
          barcode: prod.barcode ?? '',
          imei: '',
          batch: '',
          brand: prod.brand ?? '',
          vat: 0,
          refundFee: 0,
          extendedWarrantyFee: 0,
          giftCost: 0,
          total: prod.price ?? 0,
        }
      ]);
    }
    setNewProductSearchError('');
    setNewSearchQuery('');
    setShowNewSearchResults(false);
  };

  const handleNewProductChange = (index: number, key: keyof RefundProduct, val: any) => {
    const updated = [...newProducts];
    const nextValue = key === 'qty'
      ? Math.max(1, Math.min(Number(val) || 1, Number(updated[index].stock || 1)))
      : val;
    updated[index] = { ...updated[index], [key]: nextValue };
    setNewProducts(updated);
  };

  const removeNewProduct = (index: number) => {
    setNewProducts(newProducts.filter((_, i) => i !== index));
  };

  // Save handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!saleId) {
      setErrorMessage('Chỉ hỗ trợ đổi trả từ hóa đơn bán lẻ đã hoàn tất.');
      return;
    }
    if (saleGuardMessage) {
      setErrorMessage(saleGuardMessage);
      return;
    }
    if (!form.customerName.trim()) {
      setErrorMessage('Vui lòng nhập tên khách hàng hoặc tìm kiếm bằng SĐT');
      return;
    }
    if (products.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất một sản phẩm để trả hàng');
      return;
    }

    setErrorMessage('');
    const printPopup = form.autoPrint ? openRefundReceiptWindow() : null;
    if (form.autoPrint && !printPopup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn. Hãy cho phép pop-up và thử lại.');
      return;
    }
    setIsSaving(true);

    try {
      const returnedItems = products
        .filter((product) => Number(product.qty) > 0)
        .map((product) => ({
          productId: product._id,
          amount: product.qty,
          value: product.price,
          discountValue: product.refundFee || 0,
          discountType: 'number',
        }));
      if (returnedItems.length === 0) {
        throw new Error('Vui long nhap it nhat mot san pham tra hang hop le.');
      }

      const replacementItems = newProducts
        .filter((product) => Number(product.qty) > 0)
        .map((product) => ({
          productId: product._id,
          amount: product.qty,
          value: product.price,
          discountValue: 0,
          discountType: 'number',
        }));

      const paymentEntries = Object.entries(paymentAmounts)
        .map(([methodId, amount]) => ({ methodId, amount: Math.max(0, Number(amount) || 0), label: methodId }))
        .filter((entry) => entry.amount > 0);
      const missingEntry = paymentEntries.find((entry) => !entry.methodId);
      if (missingEntry) {
        throw new Error(`Khong tim thay phuong thuc thanh toan hop le cho ${missingEntry.label}.`);
      }
      const paymentPayloadLines = paymentEntries.map((entry) => ({ methodId: entry.methodId, amount: entry.amount }));
      const amountDelta = Number(form.totalAmount) || 0;
      if (!resolvedBranchId) {
        throw new Error('Vui lòng chọn Kho thực hiện trước khi lưu phiếu đổi trả.');
      }

      const exchangeResponse = await http.post(`/products/sales/${saleId}/return-exchange`, {
        code: form.id,
        branchId: resolvedBranchId,
        channel, // propagate channel so the created product-refund and sale payload carry it
        note: [form.description, form.newDescription].filter(Boolean).join('\n'),
        discountValue: Math.max(Number(form.discount) || 0, 0),
        discountType: form.discountType === 'percent' ? 'percent' : 'number',
        // Contract: BE totalPayableAmount = abs(totalAmount|amountDelta|refundAmount)
        totalAmount: amountDelta,
        amountDelta,
        refundAmount: amountDelta > 0 ? amountDelta : 0,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        returnedItems,
        replacementItems,
        refundPayments: amountDelta >= 0 ? paymentPayloadLines : [],
        salePayments: amountDelta < 0 ? paymentPayloadLines : [],
      });

      setSuccessMessage('Hoa don doi tra hang da duoc tao va luu thanh cong!');
      if (form.autoPrint && printPopup) {
        const receiptBranch = await resolveRefundBranchForReceipt(exchangeResponse.data?.sale || exchangeResponse.data?.replacementSale || exchangeResponse.data, branch, resolvedBranchId || branchId);
        const profile = buildInvoiceProfile(receiptBranch || undefined);
        const customerText = `${form.customerName || 'Khách lẻ'}${form.customerPhone ? ` (${form.customerPhone})` : ''}`;
        const amountDelta = Number(form.totalAmount) || 0;
        const html = buildReceiptHtml({
          profile,
          title: profile.templateConfig?.title || 'HÓA ĐƠN ĐỔI TRẢ HÀNG',
          date: new Date().toLocaleDateString('vi-VN'),
          customer: customerText,
          sections: [
            {
              title: `Sản phẩm trả (HĐ: ${form.paymentId || saleId || '—'})`,
              lines: products.map((product) => ({
                name: [product.code, product.name].filter(Boolean).join(' - '),
                quantity: product.qty,
                price: receiptMoney(product.price),
                total: receiptMoney(product.total),
              })),
            },
            {
              title: `Sản phẩm mua (HĐ: ${form.id})`,
              lines: newProducts.map((product) => ({
                name: [product.code, product.name].filter(Boolean).join(' - '),
                quantity: product.qty,
                price: receiptMoney(product.price),
                total: receiptMoney(product.total),
              })),
            },
          ],
          summary: [
            { label: 'Chiết khấu hàng mua mới', value: form.discountType === 'percent' ? `${Math.min(Math.max(Number(form.discount) || 0, 0), 100)}%` : receiptMoney(form.discount) },
            { label: 'Tổng', value: receiptMoney(Math.abs(amountDelta)), strong: true },
            { label: amountDelta < 0 ? 'Khách cần thanh toán thêm' : 'Tiền trả khách hàng', value: receiptMoney(Math.abs(amountDelta)), strong: true },
          ],
        });
        writeAndPrintPopup(printPopup, html);
      }
      setTimeout(() => {
        navigate(`/sales-channels/${channel}/refund`);
      }, 1200);
    } catch (err: any) {
      printPopup?.close();
      console.error(err);
      setErrorMessage(err.response?.data?.message ?? err.message ?? 'Loi khi luu hoa don doi tra hang.');
      setIsSaving(false);
    }
  };

  const autocompleteList = searchQuery.trim() === '' ? [] : returnableProducts.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 10);

  const newAutocompleteList = dbProducts.slice(0, 10);

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Top Banner and Navigation Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            type="button" 
            onClick={() => navigate(`/sales-channels/${channel}/refund`)}
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
              Tạo Mới Hóa Đơn Trả Hàng
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Warehouse size={14} color="#10b981" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  Kho nhận trả: {loadingBranch ? 'Đang tải...' : (branch ? `${branch.name} (${branch.code})` : 'Chưa chọn kho')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Briefcase size={14} color="#059669" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  Nhân viên nhận: {form.receiver}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            type="button"
            onClick={() => navigate(`/sales-channels/${channel}/refund`)}
            style={{ borderRadius: '10px', padding: '10px 20px', fontSize: '14px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
          >
            Hủy bỏ
          </button>
          <button 
            type="button"
            id="save-invoice-btn"
            disabled={isSaving || Boolean(saleGuardMessage) || !saleId || !resolvedBranchId}
            onClick={handleSave}
            style={{ 
              borderRadius: '10px', 
              padding: '10px 24px', 
              fontSize: '14px', 
              fontWeight: '600', 
              background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', 
              color: '#ffffff',
              border: 'none', 
              boxShadow: '0 4px 14px rgba(225, 29, 72, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isSaving || saleGuardMessage || !saleId || !resolvedBranchId ? 'not-allowed' : 'pointer',
              opacity: isSaving || saleGuardMessage || !saleId || !resolvedBranchId ? 0.7 : 1
            }}
          >
            <Save size={16} />
            {isSaving ? 'Đang lưu...' : 'Lưu trả hàng (F9)'}
          </button>
        </div>
      </div>

      {saleGuardMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '500' }}>
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <span>{saleGuardMessage}</span>
        </div>
      )}

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

      {/* Main 2-Columns Layout */}
      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column - Products, Staff & Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '18px 20px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>
              Kho thực hiện *
              <select
                value={resolvedBranchId}
                onChange={(event) => {
                  setResolvedBranchId(event.target.value);
                  setProducts([]);
                  setNewProducts([]);
                  setErrorMessage('');
                }}
                disabled={sourceSaleHasBranch}
                required
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
              >
                <option value="">— Chọn kho thực hiện —</option>
                {branchOptions.map((item) => <option key={item._id} value={item._id}>{item.name}{item.code ? ` (${item.code})` : ''}</option>)}
              </select>
            </label>
          </div>
          
          {/* Products & Search Box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
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
                    color: productTypeTab === 'normal' ? '#e11d48' : '#64748b',
                    boxShadow: productTypeTab === 'normal' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm thường
                </button>
                <button
                  type="button"
                  disabled
                  title="Lu?ng IMEI ch?a c? schema/validation cho phi?u ??i tr?"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'not-allowed',
                    background: productTypeTab === 'imei' ? '#ffffff' : 'transparent',
                    color: productTypeTab === 'imei' ? '#e11d48' : '#64748b',
                    boxShadow: productTypeTab === 'imei' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm IMEI
                </button>
              </div>

              {/* F3 Autocomplete Product Search Bar */}
              <div ref={productSearchBoxRef} style={{ position: 'relative', width: '380px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', background: '#ffffff' }}>
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    id="product-search-input"
                    ref={productSearchRef}
                    data-product-search-scan="true" data-product-search-primary="true" placeholder="(F3) Tìm sản phẩm trả..."
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
                          onMouseEnter={(e) => e.currentTarget.style.background = '#fff1f2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Mã: {prod.code} | Giá bán: {(prod.price ?? 0).toLocaleString('vi-VN')} đ</div>
                          </div>
                          <PlusCircle size={16} color="#e11d48" />
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        <span>{productSearchError || 'Không tìm thấy sản phẩm thuộc hóa đơn gốc còn số lượng có thể trả.'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Products Refund Table */}
            <div style={{ overflowX: 'auto', padding: '12px' }}>
              {products.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
                  <ShieldAlert size={40} color="#cbd5e1" />
                  <span style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có hàng hóa nào được chọn để nhận trả. Nhấn F3 hoặc gõ vào thanh tìm kiếm để thêm sản phẩm.
                  </span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                      <th style={{ padding: '12px 8px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 8px' }}>Sản phẩm</th>
                      <th style={{ padding: '12px 8px', width: '70px', textAlign: 'center' }}>SL Trả</th>
                      <th style={{ padding: '12px 8px', width: '105px', textAlign: 'right' }}>Giá bán</th>
                      <th style={{ padding: '12px 8px', width: '90px', textAlign: 'right' }}>Thuế VAT</th>
                      <th style={{ padding: '12px 8px', width: '100px', textAlign: 'right' }}>Phí trả hàng</th>
                      <th style={{ padding: '12px 8px', width: '100px', textAlign: 'right' }}>Tiền BHMR</th>
                      <th style={{ padding: '12px 8px', width: '115px', textAlign: 'right' }}>Tổng tiền nhận</th>
                      <th style={{ padding: '12px 8px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((prod, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        {/* Index */}
                        <td style={{ padding: '12px 8px', color: '#64748b', fontWeight: '500' }}>{idx + 1}</td>
                        
                        {/* Product Detail & IMEI & Batch */}
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            <span>Mã: {prod.code}</span>
                            {prod.brand && <span>| Hãng: {prod.brand}</span>}
                          </div>
                          
                          {/* IMEI / Batch Custom fields */}
                          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(productTypeTab === 'imei' || prod.imei !== undefined) && (
                              <input
                                type="text"
                                placeholder="Mã IMEI..."
                                value={prod.imei || ''}
                                onChange={(e) => handleProductChange(idx, 'imei', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '130px', outline: 'none' }}
                              />
                            )}
                            <input
                              type="text"
                              placeholder="Lô hàng..."
                              value={prod.batch || ''}
                              onChange={(e) => handleProductChange(idx, 'batch', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '100px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              placeholder="BHMR (Tên gói)..."
                              value={prod.extendedWarrantyName || ''}
                              onChange={(e) => handleProductChange(idx, 'extendedWarrantyName', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '120px', outline: 'none' }}
                            />
                          </div>
                        </td>

                        {/* Qty */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            value={prod.qty}
                            min={0}
                            max={Number(prod.maxQty || 0)}
                            onChange={(e) => handleProductChange(idx, 'qty', Number(e.target.value) || 0)}
                            style={{ width: '55px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Price */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            value={prod.price || ''}
                            onChange={(e) => handleProductChange(idx, 'price', Number(e.target.value) || 0)}
                            style={{ width: '90px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* VAT */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="VAT"
                            value={prod.vat || ''}
                            onChange={(e) => handleProductChange(idx, 'vat', Number(e.target.value) || 0)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Refund Fee */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="Phí trả"
                            value={prod.refundFee || ''}
                            onChange={(e) => handleProductChange(idx, 'refundFee', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#e11d48', outline: 'none' }}
                          />
                        </td>

                        {/* Extended Warranty Fee */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="Tiền BH"
                            value={prod.extendedWarrantyFee || ''}
                            onChange={(e) => handleProductChange(idx, 'extendedWarrantyFee', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Subtotal */}
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>
                          {(prod.total || 0).toLocaleString('vi-VN')} đ
                        </td>

                        {/* Remove */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeProduct(idx)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
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

          {/* Products Purchase (Sản phẩm mua mới) Search & Table */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                  Sản phẩm mua mới (Hàng bán đi)
                </h3>
              </div>
              
              {/* Product Type Tabs */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  onClick={() => setNewProductTypeTab('normal')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: newProductTypeTab === 'normal' ? '#ffffff' : 'transparent',
                    color: newProductTypeTab === 'normal' ? '#e11d48' : '#64748b',
                    boxShadow: newProductTypeTab === 'normal' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm thường
                </button>
                <button
                  type="button"
                  disabled
                  title="Lu?ng IMEI ch?a c? schema/validation cho phi?u ??i tr?"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'not-allowed',
                    background: newProductTypeTab === 'imei' ? '#ffffff' : 'transparent',
                    color: newProductTypeTab === 'imei' ? '#e11d48' : '#64748b',
                    boxShadow: newProductTypeTab === 'imei' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm IMEI
                </button>
              </div>

              {/* Autocomplete Product Search Bar */}
              <div ref={newProductSearchBoxRef} style={{ position: 'relative', width: '380px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', background: '#ffffff' }}>
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    id="new-product-search-input"
                    ref={newProductSearchRef}
                    data-product-search-scan="true" placeholder="Tìm sản phẩm mua mới..."
                    value={newSearchQuery}
                    onChange={(e) => {
                      setNewSearchQuery(e.target.value);
                      setShowNewSearchResults(true);
                    }}
                    onFocus={() => setShowNewSearchResults(true)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>

                {/* Dropdown Suggestions */}
                {showNewSearchResults && newSearchQuery.trim() !== '' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '300px', overflowY: 'auto' }}>
                    {newAutocompleteList.length > 0 ? (
                      newAutocompleteList.map(prod => (
                        <div
                          onMouseDown={(e) => { e.preventDefault(); addNewProduct(prod); }}
                          style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#fff1f2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Mã: {prod.code} | Giá bán: {(prod.price ?? 0).toLocaleString('vi-VN')} đ</div>
                          </div>
                          <PlusCircle size={16} color="#e11d48" />
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        <span>{newProductSearchLoading ? 'Đang tìm sản phẩm...' : (newProductSearchError || 'Không tìm thấy sản phẩm còn tồn tại kho của hóa đơn gốc.')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Products Purchase Table */}
            <div style={{ overflowX: 'auto', padding: '12px' }}>
              {newProducts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
                  <ShieldAlert size={40} color="#cbd5e1" />
                  <span style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có hàng hóa nào được chọn để mua mới. Nhập thông tin vào thanh tìm kiếm để thêm sản phẩm mua mới.
                  </span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                      <th style={{ padding: '12px 8px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 8px' }}>Sản phẩm mua mới</th>
                      <th style={{ padding: '12px 8px', width: '70px', textAlign: 'center' }}>SL Mua</th>
                      <th style={{ padding: '12px 8px', width: '105px', textAlign: 'right' }}>Giá bán</th>
                      <th style={{ padding: '12px 8px', width: '90px', textAlign: 'right' }}>Thuế VAT</th>
                      <th style={{ padding: '12px 8px', width: '100px', textAlign: 'right' }}>Tiền BHMR</th>
                      <th style={{ padding: '12px 8px', width: '115px', textAlign: 'right' }}>Thành tiền</th>
                      <th style={{ padding: '12px 8px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newProducts.map((prod, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        {/* Index */}
                        <td style={{ padding: '12px 8px', color: '#64748b', fontWeight: '500' }}>{idx + 1}</td>
                        
                        {/* Product Detail & IMEI & Batch */}
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            <span>Mã: {prod.code}</span>
                            {prod.brand && <span>| Hãng: {prod.brand}</span>}
                          </div>
                          
                          {/* IMEI / Batch Custom fields */}
                          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(newProductTypeTab === 'imei' || prod.imei !== undefined) && (
                              <input
                                type="text"
                                placeholder="Mã IMEI..."
                                value={prod.imei || ''}
                                onChange={(e) => handleNewProductChange(idx, 'imei', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '130px', outline: 'none' }}
                              />
                            )}
                            <input
                              type="text"
                              placeholder="Lô hàng..."
                              value={prod.batch || ''}
                              onChange={(e) => handleNewProductChange(idx, 'batch', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '100px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              placeholder="BHMR (Tên gói)..."
                              value={prod.extendedWarrantyName || ''}
                              onChange={(e) => handleNewProductChange(idx, 'extendedWarrantyName', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '120px', outline: 'none' }}
                            />
                          </div>
                        </td>

                        {/* Qty */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            value={prod.qty}
                            onChange={(e) => handleNewProductChange(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                            style={{ width: '55px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Price */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            value={prod.price || ''}
                            onChange={(e) => handleNewProductChange(idx, 'price', Number(e.target.value) || 0)}
                            style={{ width: '90px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* VAT */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="VAT"
                            value={prod.vat || ''}
                            onChange={(e) => handleNewProductChange(idx, 'vat', Number(e.target.value) || 0)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Extended Warranty Fee */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="Tiền BH"
                            value={prod.extendedWarrantyFee || ''}
                            onChange={(e) => handleNewProductChange(idx, 'extendedWarrantyFee', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Subtotal */}
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>
                          {(prod.total || 0).toLocaleString('vi-VN')} đ
                        </td>

                        {/* Remove */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeNewProduct(idx)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
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

          {/* Refund details and related items */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#e11d48" /> Thông tin Đơn hàng & Liên kết
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Kiểu trả hàng</span>
                <select 
                  value={form.type} 
                  onChange={(e) => handleChange('type', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                >
                  <option value="Trả lại bán lẻ [L]">Trả lại bán lẻ [L]</option>
                  <option value="Trả lại bán sỉ [S]">Trả lại bán sỉ [S]</option>
                  <option value="Trả hàng bảo hành">Trả hàng bảo hành</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Trả hàng từ hóa đơn (ID)</span>
                <input 
                  type="text" 
                  placeholder="VD: 14792939" 
                  value={form.returnFromInvoice} 
                  onChange={(e) => handleChange('returnFromInvoice', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Trả hàng từ đơn hàng (ID)</span>
                <input 
                  type="text" 
                  placeholder="ID đơn hàng gốc" 
                  value={form.returnFromOrder} 
                  onChange={(e) => handleChange('returnFromOrder', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhân viên nhận trả hàng</span>
                <input 
                  type="text" 
                  value={form.receiver} 
                  onChange={(e) => handleChange('receiver', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhân viên bán hàng gốc</span>
                <input 
                  type="text" 
                  placeholder="Nhân viên sỉ/lẻ ban đầu"
                  value={form.salesperson} 
                  onChange={(e) => handleChange('salesperson', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tài khoản NVBH</span>
                <input 
                  type="text" 
                  placeholder="Tài khoản NVBH"
                  value={form.salesAccount} 
                  onChange={(e) => handleChange('salesAccount', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ghi chú hóa đơn trả</span>
                <textarea 
                  rows={2}
                  placeholder="Nhập chi tiết lý do trả..."
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ghi chú hóa đơn mua</span>
                <textarea 
                  rows={2}
                  placeholder="Ghi chú hóa đơn mua..."
                  value={form.newDescription}
                  onChange={(e) => handleChange('newDescription', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (30%) - Customer lookup & Payments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Customer box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="#e11d48" /> Thông tin khách hàng
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* SDT Search */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Số điện thoại (F4)</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', flex: 1, background: '#ffffff' }}>
                    <Phone size={14} color="#94a3b8" />
                    <input
                      type="text"
                      id="customer-phone-input"
                      placeholder="Gõ SĐT tìm nhanh..."
                      value={form.customerPhone}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      onChange={(e) => {
                        handleChange('customerPhone', e.target.value);
                        lookupCustomer(e.target.value);
                      }}
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => lookupCustomer(form.customerPhone)}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
                  >
                    Tìm
                  </button>
                </div>
                {showCustomerDropdown && form.customerPhone.trim().length > 0 && customerSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', boxShadow: '0 8px 16px rgba(15,23,42,0.12)', maxHeight: '220px', overflowY: 'auto' }}>
                    {customerSuggestions.map(c => (
                      <div key={c._id} onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>{c.name || 'Kh?ch h?ng'}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{c.phone || '?'} ? {c.code || c.cardId || ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Name & Member Card ID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Họ và tên khách hàng</span>
                  <input
                    type="text"
                    placeholder="Tên khách hàng..."
                    value={form.customerName}
                    onChange={(e) => handleChange('customerName', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Mã thẻ thành viên</span>
                  <input
                    type="text"
                    placeholder="Mã thẻ..."
                    value={form.cardId}
                    onChange={(e) => handleChange('cardId', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>
              </div>

              {/* Email & Gender */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Email</span>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Giới tính</span>
                  <select
                    value={form.gender}
                    onChange={(e) => handleChange('gender', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              {/* Facebook & Birthday */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Facebook</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                    <Facebook size={14} color="#3b5998" />
                    <input
                      type="text"
                      placeholder="Facebook link/username..."
                      value={form.facebook}
                      onChange={(e) => handleChange('facebook', e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Ngày sinh</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                    <CalendarRange size={14} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY"
                      value={form.birthday}
                      onChange={(e) => handleChange('birthday', e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                    />
                  </div>
                </div>
              </div>

              {/* Order Source & Level */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Nguồn đơn hàng</span>
                  <select
                    value={form.source}
                    onChange={(e) => handleChange('source', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                  >
                    <option value="Trực tiếp">Trực tiếp</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Website">Website</option>
                    <option value="Shopee">Shopee</option>
                    <option value="Lazada">Lazada</option>
                    <option value="TikTok Shop">TikTok Shop</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Cấp độ khách hàng</span>
                  <select
                    value={form.customerLevel}
                    onChange={(e) => handleChange('customerLevel', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                  >
                    <option value="Đồng">Đồng</option>
                    <option value="Bạc">Bạc</option>
                    <option value="Vàng">Vàng</option>
                    <option value="Kim Cương">Kim Cương</option>
                  </select>
                </div>
              </div>

              {/* Labels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Nhãn khách hàng</span>
                <input
                  type="text"
                  placeholder="Nhãn (ví dụ: VIP, Than thiet)..."
                  value={form.labels}
                  onChange={(e) => handleChange('labels', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              {/* Note */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Ghi chú khách hàng</span>
                <textarea
                  rows={1}
                  placeholder="Ghi chú nội bộ về khách..."
                  value={form.note}
                  onChange={(e) => handleChange('note', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', resize: 'vertical' }}
                />
              </div>

              {/* Collapsible address and company details */}
              <details style={{ marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#64748b', outline: 'none' }}>
                  Địa chỉ chi tiết & Công ty
                </summary>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Tỉnh/Thành</span>
                      <input
                        type="text"
                        placeholder="Tỉnh/Thành..."
                        value={form.province}
                        onChange={(e) => handleChange('province', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Quận/Huyện</span>
                      <input
                        type="text"
                        placeholder="Quận/Huyện..."
                        value={form.district}
                        onChange={(e) => handleChange('district', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Phường/Xã</span>
                      <input
                        type="text"
                        placeholder="Phường/Xã..."
                        value={form.ward}
                        onChange={(e) => handleChange('ward', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Địa chỉ liên hệ</span>
                    <textarea
                      rows={2}
                      placeholder="Số nhà, tên đường..."
                      value={form.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ borderTop: '1px dotted #e2e8f0', margin: '4px 0' }}></div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Tên công ty</span>
                    <input
                      type="text"
                      placeholder="Tên công ty (nếu xuất HĐ)..."
                      value={form.companyName}
                      onChange={(e) => handleChange('companyName', e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Địa chỉ công ty</span>
                      <input
                        type="text"
                        placeholder="Địa chỉ công ty..."
                        value={form.companyAddress}
                        onChange={(e) => handleChange('companyAddress', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Mã số thuế</span>
                      <input
                        type="text"
                        placeholder="MST..."
                        value={form.taxId}
                        onChange={(e) => handleChange('taxId', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* Refund payment summary box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Coins size={18} color="#e11d48" /> Chi tiết đổi trả & Thanh toán
            </h2>

            {/* Calculations Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '14px' }}>
              
              {/* Return total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tổng tiền nhận trả (Hàng trả):</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>
                  {(() => {
                    const rTotal = products.reduce((acc, p) => acc + (p.price * p.qty), 0);
                    const rVat = products.reduce((acc, p) => acc + (p.vat || 0), 0);
                    const rWarr = products.reduce((acc, p) => acc + (p.extendedWarrantyFee || 0), 0);
                    return (rTotal + rVat + rWarr).toLocaleString('vi-VN');
                  })()} đ
                </span>
              </div>

              {/* NEW: Prorated source discount breakdown (inserted right after return total per spec) */}
              {(() => {
                const returnedSubtotal = products.reduce((acc, p) => acc + ((p.price || 0) * (p.qty || 0)), 0);
                const origSubtotal = originalOrderSubtotal || 0;
                const srcDisc = sourceDiscount || 0;
                const returnRatio = origSubtotal > 0 ? Math.min(returnedSubtotal / origSubtotal, 1) : 0;
                const proratedDiscount = srcDisc * returnRatio;
                const effectiveReturnCredit = Math.max(0, returnedSubtotal - proratedDiscount);
                const showProrated = proratedDiscount > 0.0001; // avoid float noise
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569' }}>
                      <span>Tổng giá gốc hàng trả:</span>
                      <span>{returnedSubtotal.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569' }}>
                      <span>Tỷ lệ trả so với đơn gốc:</span>
                      <span>{(returnRatio * 100).toFixed(1)}%</span>
                    </div>
                    {showProrated && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
                        <span>Chiết khấu đơn gốc phân bổ:</span>
                        <span>-{proratedDiscount.toLocaleString('vi-VN')} đ</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                      <span>Tổng tiền thực nhận (sau phân bổ chiết khấu):</span>
                      <span>{effectiveReturnCredit.toLocaleString('vi-VN')} đ</span>
                    </div>
                    {showProrated && (
                      <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '-2px' }}>
                        Chiết khấu được tính theo tỷ lệ giá trị hàng trả so với đơn gốc
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Purchase total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tổng tiền mua mới (Hàng mua):</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>
                  {(() => {
                    const pTotal = newProducts.reduce((acc, p) => acc + (p.price * p.qty), 0);
                    const pVat = newProducts.reduce((acc, p) => acc + (p.vat || 0), 0);
                    const pWarr = newProducts.reduce((acc, p) => acc + (p.extendedWarrantyFee || 0), 0);
                    return (pTotal + pVat + pWarr).toLocaleString('vi-VN');
                  })()} đ
                </span>
              </div>

              {/* Refund fee total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>Phí trả hàng (-) :</span>
                <span style={{ fontWeight: '600', color: '#e11d48' }}>
                  {form.refundFee.toLocaleString('vi-VN')} đ
                </span>
              </div>

              {/* Order discount */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>Chiết khấu hàng mua mới:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min={0}
                    value={form.discount || ''}
                    max={form.discountType === 'percent' ? 100 : undefined}
                    onChange={(e) => {
                      const value = Number(e.target.value) || 0;
                      handleChange('discount', form.discountType === 'percent' ? Math.min(value, 100) : value);
                    }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '90px', textAlign: 'right', outline: 'none', fontWeight: '600' }}
                  />
                  <select
                    value={form.discountType}
                    onChange={(e) => {
                      const discountType = e.target.value === 'percent' ? 'percent' : 'number';
                      const discount = discountType === 'percent' ? Math.min(Number(form.discount) || 0, 100) : Number(form.discount) || 0;
                      setForm(prev => ({ ...prev, discountType, discount }));
                    }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 6px', fontSize: '12px', color: '#475569', background: '#ffffff', outline: 'none' }}
                    aria-label="Loại chiết khấu đơn"
                  >
                    <option value="number">đ</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>

              {/* Coupon code */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>Coupon mã giảm:</span>
                <input
                  type="text"
                  placeholder="Nhập mã..."
                  value={form.coupon}
                  onChange={(e) => handleChange('coupon', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '110px', textAlign: 'right', outline: 'none', color: '#1e293b' }}
                />
              </div>

              {/* Automation Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.autoDiscount}
                    onChange={(e) => handleChange('autoDiscount', e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Bỏ chiết khấu tự động</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.autoPoint}
                    onChange={(e) => handleChange('autoPoint', e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Bỏ tích điểm tự động</span>
                </label>
              </div>
            </div>

            {/* Total Amount Difference */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                {form.totalAmount > 0 ? 'Tổng tiền trả khách:' : form.totalAmount < 0 ? 'Khách cần thanh toán:' : 'Tổng tiền chênh lệch:'}
              </span>
              <span style={{ 
                fontSize: '18px', 
                fontWeight: '800', 
                color: form.totalAmount > 0 ? '#10b981' : form.totalAmount < 0 ? '#ef4444' : '#64748b' 
              }}>
                {Math.abs(form.totalAmount).toLocaleString('vi-VN')} đ
              </span>
            </div>

            {/* Payment breakdowns split */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#475569', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={14} /> Phân phối tiền
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {paymentMethods.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#ef4444' }}>Chưa tải được phương thức thanh toán từ Mongo/API.</div>
                ) : paymentMethods.map((method: any) => (
                  <div key={method._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#475569' }}>{method.name || method.code || method._id}:</span>
                    <input
                      type="number"
                      min={0}
                      value={paymentAmounts[method._id] || ''}
                      onChange={(e) => setPaymentAmounts(prev => ({ ...prev, [method._id]: Number(e.target.value) || 0 }))}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '130px', textAlign: 'right', outline: 'none' }}
                    />
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                    {form.totalAmount >= 0 ? 'Còn nợ khách:' : 'Khách còn nợ:'}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                    {Math.max(0, Math.abs(form.totalAmount) - Object.values(paymentAmounts).reduce((sum, amount) => sum + (Number(amount) || 0), 0)).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>
            </div>

            {/* Auto Print Selection */}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer', fontWeight: '500' }}>
                <input
                  type="checkbox"
                  checked={form.autoPrint}
                  onChange={(e) => handleChange('autoPrint', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Printer size={14} color="#64748b" /> Tự động in sau khi lưu hóa đơn (F10)
                </span>
              </label>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}

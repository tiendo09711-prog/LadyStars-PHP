import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FilePenLine,
  Gift,
  LoaderCircle,
  MoreHorizontal,
  Package,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  UserRound,
  Warehouse,
  X,
} from 'lucide-react';
import { http } from '../../core/api/http';
import { isAdminRole } from '../../core/auth/access';
import { buildInvoiceProfile, getBranch, getStoreSetting } from '../../core/api/branch.api';
import { buildReceiptHtml } from './invoicePrint';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';

type RetailInvoicePageProps = {
  channel: string;
};

type Filters = {
  invoiceCode: string;
  storeId: string;
  dateFrom: string;
  dateTo: string;
  customerKeyword: string;
  productKeyword: string;
};

type Branch = {
  _id: string;
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  invoiceProfile?: {
    displayName?: string;
    footerText?: string;
    showBranchName?: boolean;
    showCashier?: boolean;
    showProductCode?: boolean;
    showLogo?: boolean;
  };
};

type Invoice = Record<string, any>;

const PAGE_SIZE = 15;
const PRINT_WINDOW_NAME = 'retail-invoice-print';
const PRINT_WINDOW_FEATURES = 'popup=yes,width=900,height=1200';
const EMPTY_FILTERS: Filters = {
  invoiceCode: '',
  storeId: '',
  dateFrom: '',
  dateTo: '',
  customerKeyword: '',
  productKeyword: '',
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function safeMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? money.format(amount) : '—';
}

function safeDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function productLines(invoice: Invoice) {
  return Array.isArray(invoice.items) ? invoice.items : [];
}

function productName(item: any) {
  return item?.productId?.name || item?.productName || item?.productId?.code || 'Sản phẩm chưa có tên';
}

function productCode(item: any) {
  return item?.productId?.code || item?.productCode || '';
}

function totalQuantity(invoice: Invoice) {
  return productLines(invoice).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
}

function grossValue(invoice: Invoice) {
  return productLines(invoice).reduce(
    (sum, item) => sum + (Number(item?.value) || 0) * (Number(item?.amount) || 0),
    0,
  );
}
function discountMoneyAmount(invoice: Invoice) {
  return Math.max(0, grossValue(invoice) - (Number(invoice.value) || 0));
}

function statusMeta(status: unknown, refundStatus?: unknown) {
  const refund = String(refundStatus || '').toLowerCase();
  const value = String(status || '').toLowerCase();
  if (value === 'completed' && refund === 'full') return { label: 'Đã hoàn', tone: 'neutral' };
  if (value === 'completed' && refund === 'partial') return { label: 'Đã hoàn một phần', tone: 'warning' };
  if (value === 'completed') return { label: 'Hoàn tất', tone: 'success' };
  if (value === 'cancelled') return { label: 'Đã hủy', tone: 'danger' };
  if (value === 'draft') return { label: 'Nháp', tone: 'warning' };
  return { label: status ? String(status) : '—', tone: 'neutral' };
}

function hasGiftItems(invoice: Invoice) {
  if (invoice?.hasGiftItems === true) return true;
  return productLines(invoice).some((item) => item?.isGift === true || item?.gift === true || item?.giftForProductId);
}

function refundActionState(invoice: Invoice) {
  const status = String(invoice?.status || '').toLowerCase();
  const refundStatus = String(invoice?.refundStatus || 'none').toLowerCase();
  const remainingReturnableQuantity = Number(invoice?.remainingReturnableQuantity || 0);

  if (status === 'cancelled') {
    return { enabled: false, title: 'Hóa đơn đã hủy nên không thể đổi trả.' };
  }
  if (status !== 'completed') {
    return { enabled: false, title: 'Chỉ hóa đơn đã hoàn tất mới được đổi trả.' };
  }
  if (refundStatus === 'full' || remainingReturnableQuantity <= 0) {
    return { enabled: false, title: 'Hóa đơn đã hoàn toàn bộ nên không thể đổi trả thêm.' };
  }
  return { enabled: true, title: 'Tạo chứng từ đổi trả cho phần hàng còn lại.' };
}

function editActionState(invoice: Invoice) {
  const status = String(invoice?.status || '').toLowerCase();
  const refundStatus = String(invoice?.refundStatus || 'none').toLowerCase();
  const activeRefundCount = Number(invoice?.activeRefundCount || 0);

  if (status === 'cancelled') {
    return { enabled: false, title: 'Hóa đơn đã hủy nên không thể sửa.' };
  }
  if (status !== 'completed') {
    return { enabled: false, title: 'Chỉ hóa đơn đã hoàn tất mới được sửa.' };
  }
  if (refundStatus === 'full') {
    return { enabled: false, title: 'Hóa đơn đã hoàn toàn bộ nên không thể sửa.' };
  }
  if (refundStatus === 'partial' || activeRefundCount > 0) {
    return { enabled: false, title: 'Hóa đơn đã phát sinh đổi trả nên không thể sửa.' };
  }
  return { enabled: true, title: 'Sửa hóa đơn hoàn tất khi chưa phát sinh đổi trả.' };
}

function deleteActionState(invoice: Invoice) {
  const status = String(invoice?.status || '').toLowerCase();
  const refundStatus = String(invoice?.refundStatus || 'none').toLowerCase();
  const activeRefundCount = Number(invoice?.activeRefundCount || 0);
  if (status === 'cancelled' && activeRefundCount > 0) {
    return { enabled: false, title: 'Không thể xóa hóa đơn đã hủy vì đã phát sinh chứng từ đổi trả.' };
  }
  if (refundStatus === 'full') {
    return { enabled: false, title: 'Hóa đơn đã hoàn toàn bộ nên không thể xóa hoặc hủy.' };
  }
  if (refundStatus === 'partial' || activeRefundCount > 0) {
    return { enabled: false, title: 'Hóa đơn đã phát sinh đổi trả nên không thể xóa hoặc hủy.' };
  }
  if (activeRefundCount > 0) {
    return { enabled: false, title: 'Không thể xóa hoặc hủy vì hóa đơn đã phát sinh chứng từ đổi trả.' };
  }
  if (status === 'draft') return { enabled: true, title: 'Xóa vĩnh viễn hóa đơn nháp.' };
  if (status === 'cancelled') return { enabled: true, title: 'Xóa vĩnh viễn hóa đơn đã hủy.' };
  if (status === 'completed') return { enabled: true, title: 'Hủy hóa đơn và hoàn tồn kho.' };
  return { enabled: false, title: 'Hóa đơn không ở trạng thái cho phép xóa.' };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paymentRows(invoice: Invoice) {
  const rows = Array.isArray(invoice.typePayment)
    ? invoice.typePayment
        .map((entry: any) => ({
          label: entry?.methodId?.name || entry?.methodId?.code || 'Thanh toán',
          amount: Number(entry?.amount),
        }))
        .filter((entry: any) => Number.isFinite(entry.amount) && entry.amount > 0)
    : [];
  if (rows.length > 0) return rows;
  const paid = Number(invoice.valuePayment);
  return Number.isFinite(paid) && paid > 0 ? [{ label: 'Đã thanh toán', amount: paid }] : [];
}

export function RetailInvoicePage({ channel }: RetailInvoicePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingPrintWindowRef = useRef<Window | null>(null);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowActionOpen, setRowActionOpen] = useState<string | null>(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState('');
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canManageSales = isAdminRole(currentUser?.role);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const pageSummary = useMemo(() => {
    if (!invoices.length) return { gross: 0, totalValue: 0, paid: 0 };
    const gross = invoices.reduce((sum, invoice) => sum + (productLines(invoice).length > 0 ? grossValue(invoice) : 0), 0);
    const totalValue = invoices.reduce((sum, invoice) => sum + (Number(invoice.value) || 0), 0);
    const paid = invoices.reduce(
      (sum, invoice) => sum + paymentRows(invoice).reduce((acc, entry) => acc + entry.amount, 0),
      0,
    );
    return { gross, totalValue, paid };
  }, [invoices]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const retiredTab = params.get('tab');
    if (retiredTab && ['confirm', 'payment-confirmation', 'payment_confirm_pending'].includes(retiredTab)) {
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    let mounted = true;
    http.get('/auth/me')
      .then((response) => {
        if (mounted) setCurrentUser(response.data?.user || response.data || null);
      })
      .catch(() => {
        if (mounted) setCurrentUser(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const loadBranches = async () => {
    setBranchLoading(true);
    setBranchError('');
    try {
      const response = await http.get('/system/branches', { params: { limit: 5000 } });
      const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
      setBranches(items);
      if (items.length === 0) setBranchError('Chưa có cửa hàng/kho hàng để tạo hóa đơn.');
    } catch (err: any) {
      setBranchError(err.response?.data?.message || 'Không tải được danh sách cửa hàng/kho hàng.');
    } finally {
      setBranchLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, []);

  const loadInvoices = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
        channel,
      };
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const response = await http.get('/products/sales', { params, signal });
      const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
      setInvoices(items);
      setTotal(Array.isArray(response.data) ? items.length : Number(response.data.total ?? items.length));
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED') return;
      setInvoices([]);
      setTotal(0);
      setError(err.response?.data?.message || 'Không tải được dữ liệu hóa đơn bán lẻ.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadInvoices(controller.signal);
    return () => controller.abort();
  }, [appliedFilters, channel, page]);

  useEffect(() => {
    if (!rowActionOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && rowMenuRef.current?.contains(target)) return;
      setRowActionOpen(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRowActionOpen(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [rowActionOpen]);

  const selectedAll = invoices.length > 0 && invoices.every((invoice) => selectedIds.has(invoice._id));

  const branchName = useMemo(
    () => branches.find((branch) => branch._id === draftFilters.storeId)?.name,
    [branches, draftFilters.storeId],
  );

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setPage(1);
    setAppliedFilters({ ...EMPTY_FILTERS });
  };

  const openBranchPicker = async () => {
    setShowBranchModal(true);
    if (branches.length === 0 && !branchLoading) await loadBranches();
  };

  const continueCreate = () => {
    if (!selectedBranchId) return;
    navigate(`/sales-channels/${channel}/retail/create?branchId=${selectedBranchId}`);
  };

  const openDetail = async (invoice: Invoice) => {
    setRowActionOpen(null);
    setDetail(invoice);
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await http.get(`/products/sales/${invoice._id}`);
      setDetail(response.data);
    } catch (err: any) {
      setDetailError(err.response?.data?.message || 'Không tải được chi tiết hóa đơn.');
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchInvoiceDetail = async (invoice: Invoice) => {
    const response = await http.get(`/products/sales/${invoice._id}`);
    return response.data;
  };

  const openPrintWindow = () => {
    const existing = pendingPrintWindowRef.current;
    if (existing && !existing.closed) return existing;

    const popup = window.open('about:blank', PRINT_WINDOW_NAME, PRINT_WINDOW_FEATURES);
    if (!popup) return null;

    pendingPrintWindowRef.current = popup;
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8" /><title>Dang chuan bi in</title></head><body>Dang chuan bi hoa don...</body></html>');
    popup.document.close();
    return popup;
  };

  const primePrintWindow = () => {
    openPrintWindow();
  };

  const buildPrintDocument = (invoice: Invoice, branch: Branch | null, shop: any, items: any[], title: string, hideTotals = false) => {
    const customer = invoice.customerId || {};
    const profile = buildInvoiceProfile(
      branch
        ? {
            _id: branch._id,
            name: branch.name || '',
            code: branch.code || '',
            address: branch.address,
            phone: branch.phone,
            invoiceProfile: branch.invoiceProfile,
          }
        : undefined,
      shop || undefined,
    );
    const receiptLines = items.map((item) => {
      const total = Number(item?.total ?? (Number(item?.value) || 0) * (Number(item?.amount) || 0));
      return {
        name: productName(item),
        quantity: Number(item?.amount || 0).toLocaleString('vi-VN'),
        price: safeMoney(item?.value),
        total: hideTotals ? '—' : safeMoney(total),
      };
    });
    const paid = Number(invoice.valuePayment || 0);
    const total = Number(invoice.value || 0);
    const tendered = Number(invoice.tenderedValue ?? paid);
    const hasDistinctTendered = Number.isFinite(tendered) && tendered > 0 && Math.abs(tendered - paid) > 1;
    const change = hasDistinctTendered ? Math.max(tendered - total, 0) : 0;
    const customerText = `${customer?.name || 'Khách lẻ'}${customer?.phone ? ` (${customer.phone})` : ''}`;

    return buildReceiptHtml({
      profile,
      title,
      date: safeDate(invoice.completedAt || invoice.createdAt),
      code: invoice.code || invoice._id,
      customer: customerText,
      sections: [{ lines: receiptLines }],
      summary: hideTotals ? [] : [
        { label: 'Tổng cộng', value: safeMoney(grossValue(invoice)) },
        { label: 'Giảm giá', value: Number(invoice.discountValue) > 0 ? `-${safeMoney(discountMoneyAmount(invoice))}${invoice.discountType === 'percent' ? ` (${Number(invoice.discountValue)}%)` : ''}` : '—' },
        { label: 'Thành tiền', value: safeMoney(invoice.value), strong: true },
        { label: 'Đã thanh toán', value: safeMoney(invoice.valuePayment) },
        ...(hasDistinctTendered ? [{ label: 'Tiền khách trả', value: safeMoney(tendered) }] : []),
        ...(change > 0 ? [{ label: 'Tiền trả lại', value: safeMoney(change) }] : []),
      ],
    });
  };

  const resolvePrintBranch = async (invoice: Invoice) => {
    const rawBranch = invoice.branchId || invoice.warehouseId || invoice.warehouse;
    const branchId = typeof rawBranch === 'string' ? rawBranch : rawBranch?._id;
    if (!branchId) return null;
    try {
      return await getBranch(branchId, { includeInactive: true });
    } catch {
      return typeof rawBranch === 'object' ? rawBranch : null;
    }
  };

  const printInvoice = async (invoice: Invoice, giftOnly = false) => {
    const popup = openPrintWindow();
    if (!popup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn.');
      return;
    }

    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8" /><title>Đang chuẩn bị in</title></head><body>Đang chuẩn bị hóa đơn...</body></html>');
    popup.document.close();

    try {
      const fullInvoice = await fetchInvoiceDetail(invoice);
      const items = giftOnly
        ? productLines(fullInvoice).filter((item) => item?.isGift === true || item?.gift === true || item?.giftForProductId)
        : productLines(fullInvoice);
      if (giftOnly && items.length === 0) {
        popup.close();
        window.alert('Hóa đơn này không có sản phẩm tặng kèm');
        return;
      }
      const branch = await resolvePrintBranch(fullInvoice);
      const shop = branch ? {} : await getStoreSetting().catch(() => ({}));
      const html = buildPrintDocument(fullInvoice, branch, shop, items, giftOnly ? 'HÓA ĐƠN' : 'HÓA ĐƠN', giftOnly);
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (err: any) {
      popup.close();
      window.alert(err.response?.data?.message || 'Không thể in hóa đơn.');
    }
  };

  const handlePrintInvoice = async (invoice: Invoice, giftOnly = false) => {
    setRowActionOpen(null);

    const popup = openPrintWindow();
    if (!popup) {
      window.alert('Trinh duyet dang chan cua so in hoa don. Hay cho phep pop-up va thu lai.');
      return;
    }

    try {
      const fullInvoice = await fetchInvoiceDetail(invoice);
      const items = giftOnly
        ? productLines(fullInvoice).filter((item) => item?.isGift === true || item?.gift === true || item?.giftForProductId)
        : productLines(fullInvoice);

      if (giftOnly && items.length === 0) {
        pendingPrintWindowRef.current = null;
        popup.close();
        window.alert('Hoa don nay khong co san pham tang kem');
        return;
      }

      const branch = await resolvePrintBranch(fullInvoice);
      const shop = branch ? {} : await getStoreSetting().catch(() => ({}));
      const html = buildPrintDocument(
        fullInvoice,
        branch,
        shop,
        items,
        giftOnly ? 'HÓA ĐƠN' : 'HÓA ĐƠN',
        giftOnly,
      );

      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      pendingPrintWindowRef.current = null;
    } catch (err: any) {
      pendingPrintWindowRef.current = null;
      popup.close();
      window.alert(err.response?.data?.message || 'Khong the in hoa don.');
    }
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (!canManageSales) {
      window.alert('Chỉ tài khoản admin mới được xóa hoặc hủy hóa đơn.');
      return;
    }
    const state = deleteActionState(invoice);
    if (!state.enabled) {
      window.alert(state.title);
      return;
    }
    if (actionBusyId === invoice._id) return;
    const status = String(invoice.status || '').toLowerCase();
    const lineCount = productLines(invoice).length;
    const confirmation = window.confirm(
      [
        `Mã hóa đơn: ${invoice.code || invoice._id}`,
        `Tổng tiền: ${safeMoney(invoice.value)}`,
        `Số dòng hàng: ${lineCount}`,
        `Ảnh hưởng tồn kho: ${status === 'completed' ? 'Hệ thống sẽ hoàn tồn kho cho hóa đơn này.' : 'Không phát sinh hoàn tồn kho.'}`,
        'Thao tác này không thể khôi phục trực tiếp từ giao diện.',
      ].join('\n'),
    );
    if (!confirmation) return;

    try {
      setActionBusyId(invoice._id);
      if (status === 'completed') {
        await http.post(`/products/sales/${invoice._id}/cancel`);
      } else {
        await http.delete(`/products/sales/${invoice._id}`);
      }
      setRowActionOpen(null);
      if (detail?._id === invoice._id) setDetail(null);
      await loadInvoices();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Không thể xóa hoặc hủy hóa đơn.');
    } finally {
      setActionBusyId((current) => (current === invoice._id ? '' : current));
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(invoices.map((invoice) => invoice._id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Ngày tạo', key: 'createdAt', getValue: (invoice: Invoice) => safeDate(invoice.createdAt) },
      { label: 'Mã hóa đơn', key: 'code', getValue: (invoice: Invoice) => invoice.code || invoice._id },
      { label: 'Người tạo', key: 'creator', getValue: (invoice: Invoice) => invoice.authorId?.name || invoice.userId?.name || '—' },
      { label: 'Khách hàng', key: 'customer', getValue: (invoice: Invoice) => invoice.customerId?.name || 'Khách lẻ' },
      { label: 'SĐT khách', key: 'customerPhone', getValue: (invoice: Invoice) => invoice.customerId?.phone || '—' },
      { label: 'Sản phẩm', key: 'product', getValue: (invoice: Invoice) => { const items = productLines(invoice); const first = items[0]; return first ? productName(first) : '—'; } },
      { label: 'Số SP', key: 'lineCount', getValue: (invoice: Invoice) => productLines(invoice).length },
      { label: 'Giá trị hàng hóa', key: 'gross', getValue: (invoice: Invoice) => grossValue(invoice) },
      { label: 'Tổng SL', key: 'qty', getValue: (invoice: Invoice) => totalQuantity(invoice) },
      { label: 'Giảm giá', key: 'discount', getValue: (invoice: Invoice) => discountMoneyAmount(invoice) },
      { label: '% chiết khấu', key: 'discountRate', getValue: (invoice: Invoice) => invoice.discountType === 'percent' ? Number(invoice.discountValue) || 0 : 0 },
      { label: 'Tổng tiền', key: 'value', getValue: (invoice: Invoice) => Number(invoice.value) || 0 },
      { label: 'Phương thức thanh toán', key: 'paymentMethods', getValue: (invoice: Invoice) => paymentRows(invoice).map((p) => p.label).join(', ') || '—' },
      { label: 'Đã thanh toán', key: 'paid', getValue: (invoice: Invoice) => Number(invoice.valuePayment) || 0 },
      { label: 'Trạng thái', key: 'status', getValue: (invoice: Invoice) => statusMeta(invoice.status, invoice.refundStatus).label },
    ],
    [],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: Invoice[] = [];
      if (exportType === 'current') {
        dataToExport = invoices;
      } else {
        const fetchPage = (nextPage: number, nextLimit: number) => {
          const params: Record<string, string | number> = { page: nextPage, limit: nextLimit, channel };
          Object.entries(appliedFilters).forEach(([key, value]) => { if (value) params[key] = value; });
          return http.get('/products/sales', { params });
        };
        const pageSize = 100;
        const firstResponse = await fetchPage(1, pageSize);
        const firstItems = Array.isArray(firstResponse.data) ? firstResponse.data : firstResponse.data.items ?? [];
        let allItems: Invoice[] = [...firstItems];
        const totalItems = Array.isArray(firstResponse.data) ? firstItems.length : Number(firstResponse.data.total ?? firstItems.length);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => fetchPage(index + 2, pageSize)),
          );
          responses.forEach((response) => {
            const responseItems = Array.isArray(response.data) ? response.data : response.data.items ?? [];
            allItems = allItems.concat(responseItems);
          });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        window.alert('Không có dữ liệu để xuất.');
        return;
      }
      const mappedRows = dataToExport.map((invoice) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((col) => {
          const exportColumn = exportColumns.find((c) => c.key === col.key);
          row[col.customLabel] = exportColumn ? exportColumn.getValue(invoice) : '';
        });
        return row;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };
  return (
    <div className="retail-invoice-page">
      <style>{retailStyles}</style>

      <header className="retail-hero">
        <div className="retail-hero-text">
          <span className="retail-eyebrow">Kênh bán - Cửa hàng</span>
          <h1>Hóa đơn bán lẻ</h1>
          <p>Tra cứu, lọc và quản lý hóa đơn bán lẻ của cửa hàng</p>
        </div>
        <div className="retail-hero-icon"><ShoppingCart size={26} /></div>
      </header>

      <form className="retail-filterbar" onSubmit={applyFilters}>
        <label className="retail-filter-field">
          <Search size={14} />
          <input
            value={draftFilters.invoiceCode}
            onChange={(event) => setDraftFilters((current) => ({ ...current, invoiceCode: event.target.value }))}
            placeholder="Nhập mã hóa đơn"
            aria-label="ID hóa đơn"
          />
        </label>

        <select
          className="retail-filter-select"
          value={draftFilters.storeId}
          onChange={(event) => setDraftFilters((current) => ({ ...current, storeId: event.target.value }))}
          aria-label="Cửa hàng"
        >
          <option value="">Tất cả cửa hàng</option>
          {branches.map((branch) => (
            <option key={branch._id} value={branch._id}>{branch.name || branch.code || branch._id}</option>
          ))}
        </select>

        <label className="retail-filter-field retail-date-field">
          <span>Từ</span>
          <input
            type="date"
            value={draftFilters.dateFrom}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            aria-label="Từ ngày"
          />
        </label>

        <label className="retail-filter-field retail-date-field">
          <span>Đến</span>
          <input
            type="date"
            value={draftFilters.dateTo}
            min={draftFilters.dateFrom || undefined}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
            aria-label="Đến ngày"
          />
        </label>

        <label className="retail-filter-field">
          <UserRound size={14} />
          <input
            value={draftFilters.customerKeyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, customerKeyword: event.target.value }))}
            placeholder="Tên hoặc số điện thoại"
            aria-label="Khách hàng"
          />
        </label>

        <label className="retail-filter-field">
          <Package size={14} />
          <input
            value={draftFilters.productKeyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, productKeyword: event.target.value }))}
            placeholder="Mã hoặc tên sản phẩm"
            aria-label="Sản phẩm"
          />
        </label>

        <button className="retail-filter-button" type="submit"><Search size={15} /> Lọc</button>
        <button className="retail-reset-button" type="button" onClick={resetFilters}>Đặt lại</button>
      </form>

      <div className="retail-actionbar">
        <div className="retail-actionbar-left">
          <button className="retail-btn success" type="button" onClick={() => void openBranchPicker()}>
            <Plus size={16} /> Thêm hóa đơn lẻ
          </button>
          {selectedIds.size > 0 && <span className="retail-selected">{selectedIds.size} hóa đơn đã chọn</span>}
        </div>
        <div className="retail-actionbar-right">
          {branchName && appliedFilters.storeId === draftFilters.storeId && (
            <span className="retail-filter-chip"><Store size={13} /> {branchName}</span>
          )}
          <span><strong>{total.toLocaleString('vi-VN')}</strong> bản ghi</span>
          <span>{rangeStart.toLocaleString('vi-VN')} - {rangeEnd.toLocaleString('vi-VN')}</span>
          <button className="retail-btn" type="button" onClick={() => setShowExportModal(true)}>
            <FileDown size={15} /> Xuất dữ liệu
          </button>
          <button
            className="retail-icon-btn"
            type="button"
            title="Làm mới"
            aria-label="Làm mới"
            onClick={resetFilters}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="retail-alert" role="alert">
          <AlertCircle size={18} />
          <div><strong>Không tải được dữ liệu</strong><span>{error}</span></div>
          <button type="button" onClick={() => void loadInvoices()}>Thử lại</button>
        </div>
      )}

      <section className="retail-table-card" aria-label="Danh sách hóa đơn bán lẻ">
        <div className="retail-table-scroll">
          <table>
            <colgroup>
              <col className="col-check" />
              <col className="col-creator" />
              <col className="col-id" />
              <col className="col-customer" />
              <col className="col-product" />
              <col className="col-gross" />
              <col className="col-qty" />
              <col className="col-discount" />
              <col className="col-total" />
              <col className="col-payment" />
              <col className="col-status" />
              <col className="col-action" />
            </colgroup>
            <thead>
              <tr>
                <th className="check"><input type="checkbox" checked={selectedAll} onChange={(event) => toggleAll(event.target.checked)} aria-label="Chọn tất cả" /></th>
                <th>Người tạo / Ngày tạo</th>
                <th>ID hóa đơn</th>
                <th>Khách hàng</th>
                <th>Sản phẩm</th>
                <th className="number">Giá trị hàng hóa</th>
                <th className="number">Tổng SL</th>
                <th className="number">Giảm giá</th>
                <th className="number">Tổng tiền</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th className="action">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 7 }).map((_, index) => (
                <tr className="retail-skeleton" key={index}>
                  {Array.from({ length: 12 }).map((__, cellIndex) => <td key={cellIndex}><span /></td>)}
                </tr>
              ))}

              {!loading && !error && invoices.length === 0 && (
                <tr>
                  <td colSpan={12}>
                    <div className="retail-empty">
                      <Package size={30} />
                      <strong>Không có hóa đơn phù hợp</strong>
                      <span>Hãy thay đổi bộ lọc hoặc tạo hóa đơn bán lẻ mới.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !error && invoices.map((invoice) => {
                const items = productLines(invoice);
                const firstItem = items[0];
                const customer = invoice.customerId;
                const creator = invoice.authorId?.name || invoice.userId?.name;
                const payments = paymentRows(invoice);
                const status = statusMeta(invoice.status, invoice.refundStatus);
                const giftDisabled = !hasGiftItems(invoice);
                const refundState = refundActionState(invoice);
                const editState = editActionState(invoice);
                const deleteState = deleteActionState(invoice);
                return (
                  <tr key={invoice._id}>
                    <td className="check">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(invoice._id)}
                        onChange={(event) => toggleOne(invoice._id, event.target.checked)}
                        aria-label={`Chọn hóa đơn ${invoice.code || invoice._id}`}
                      />
                    </td>
                    <td>
                      <div className="retail-stack">
                        <strong title={`${creator || '—'} · ${safeDate(invoice.createdAt)}`}>{creator || '—'}</strong>
                        <span>{safeDate(invoice.createdAt)}</span>
                      </div>
                    </td>
                    <td>
                      <button className="retail-invoice-link" type="button" title={invoice.code || '—'} onClick={() => void openDetail(invoice)}>
                        {invoice.code || '—'}
                      </button>
                    </td>
                    <td>
                      <div className="retail-stack">
                        <strong title={`${customer?.name || 'Khách lẻ'} · ${customer?.phone || '—'}`}>{customer?.name || 'Khách lẻ'}</strong>
                        <span>{customer?.phone || '—'}</span>
                      </div>
                    </td>
                    <td>
                      {firstItem ? (
                        <div className="retail-product-cell">
                          <strong title={productName(firstItem)}>{productName(firstItem)}</strong>
                          <span>{productCode(firstItem) || '—'}</span>
                          {items.length > 1 && <em>+{items.length - 1} sản phẩm khác</em>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="number" title={items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}>{items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}</td>
                    <td className="number" title={items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}>{items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}</td>
                    <td className="number discount" title={Number(invoice.discountValue) > 0 ? `-${safeMoney(discountMoneyAmount(invoice))}${invoice.discountType === 'percent' ? ` (${Number(invoice.discountValue)}%)` : ''}` : '—'}>{Number(invoice.discountValue) > 0 ? (
                      <span className="retail-discount-cell">
                        <span className="retail-discount-money">-{safeMoney(discountMoneyAmount(invoice))}</span>
                        {invoice.discountType === 'percent' ? <span className="retail-discount-rate">{Number(invoice.discountValue)}%</span> : null}
                      </span>
                    ) : '—'}</td>
                    <td className="number total" title={safeMoney(invoice.value)}>{safeMoney(invoice.value)}</td>
                    <td className="retail-payment-column">
                      {payments.length > 0 ? (
                        <div className="retail-payments">
                          {payments.map((payment, index) => (
                            <span className="retail-payment-item" key={`${payment.label}-${index}`}>
                              <strong className="retail-payment-amount" title={safeMoney(payment.amount)}>{safeMoney(payment.amount)}</strong>
                              <small className="retail-payment-method" title={payment.label}>{payment.label}</small>
                            </span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td><span className={`retail-status ${status.tone}`}>{status.label}</span></td>
                    <td className="action">
                      <div className="retail-row-menu" ref={rowActionOpen === invoice._id ? rowMenuRef : null}>
                        <button
                          className="retail-icon-btn"
                          type="button"
                          aria-label={`Thao tác hóa đơn ${invoice.code || invoice._id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setRowActionOpen((current) => current === invoice._id ? null : invoice._id);
                          }}
                        >
                          <MoreHorizontal size={17} />
                        </button>
                        {rowActionOpen === invoice._id && (
                          <div className="retail-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => void openDetail(invoice)}><Eye size={15} /> Xem chi tiết</button>
                            <button type="button" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(invoice)}><Printer size={15} /> In hóa đơn</button>
                            <button type="button" disabled={giftDisabled} title={giftDisabled ? 'Hóa đơn này không có sản phẩm tặng kèm' : ''} onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(invoice, true)}><Gift size={15} /> In hóa đơn quà tặng</button>
                            <button type="button" disabled={!refundState.enabled} title={refundState.title} onClick={() => navigate(`/sales-channels/${channel}/refund/create?saleId=${invoice._id}`)}><RotateCcw size={15} /> Đổi trả hàng</button>
                            {canManageSales ? (<button type="button" disabled={!editState.enabled} title={editState.title} onClick={() => navigate(`/sales-channels/${channel}/retail/create?editId=${invoice._id}`)}><FilePenLine size={15} /> Sửa đơn hàng</button>) : null}
                            {canManageSales ? (<button type="button" disabled={!deleteState.enabled || actionBusyId === invoice._id} title={deleteState.title} onClick={() => void handleDeleteInvoice(invoice)}><Trash2 size={15} /> {actionBusyId === invoice._id ? 'Đang xử lý...' : 'Xóa hóa đơn'}</button>) : null}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && !error && invoices.length > 0 && (
              <tfoot className="retail-summary-foot">
                <tr>
                  <td colSpan={5} className="retail-summary-label">Tổng cộng trang {page}/{totalPages}</td>
                  <td className="number" title={safeMoney(pageSummary.gross)}>{safeMoney(pageSummary.gross)}</td>
                  <td className="number" />
                  <td className="number" />
                  <td className="number total" title={safeMoney(pageSummary.totalValue)}>{safeMoney(pageSummary.totalValue)}</td>
                  <td className="number retail-summary-paid" title={safeMoney(pageSummary.paid)}>{safeMoney(pageSummary.paid)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="retail-pagination">
          <span>Hiển thị {rangeStart.toLocaleString('vi-VN')} - {rangeEnd.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')}</span>
          <div>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>
            <strong>Trang {page} / {totalPages}</strong>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      {showBranchModal && (
        <div className="retail-modal-backdrop" role="presentation">
          <div className="retail-modal branch-modal" role="dialog" aria-modal="true" aria-labelledby="branch-title">
            <header>
              <div><Warehouse size={20} /><h2 id="branch-title">Chọn kho hàng</h2></div>
              <button type="button" onClick={() => setShowBranchModal(false)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <div className="retail-modal-body">
              {branchLoading ? (
                <div className="retail-modal-state"><LoaderCircle className="spin" size={24} /> Đang tải kho hàng...</div>
              ) : branchError ? (
                <div className="retail-modal-error"><AlertCircle size={18} /> {branchError}<button type="button" onClick={() => void loadBranches()}>Thử lại</button></div>
              ) : (
                <div className="retail-branch-list">
                  {branches.map((branch) => {
                    const active = selectedBranchId === branch._id;
                    return (
                      <button className={active ? 'active' : ''} type="button" key={branch._id} onClick={() => setSelectedBranchId(branch._id)}>
                        <Store size={18} />
                        <span><strong>{branch.name || 'Cửa hàng'}</strong><small>{[branch.code, branch.address].filter(Boolean).join(' · ') || '—'}</small></span>
                        {active && <Check size={17} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <footer>
              <button className="retail-btn ghost" type="button" onClick={() => setShowBranchModal(false)}>Hủy</button>
              <button className="retail-btn success" type="button" disabled={!selectedBranchId || branchLoading} onClick={continueCreate}>Chọn</button>
            </footer>
          </div>
        </div>
      )}

      {detail && (
        <div className="retail-modal-backdrop" role="presentation">
          <div className="retail-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <header>
              <div><Eye size={20} /><h2 id="detail-title">{detail.code || 'Chi tiết hóa đơn'}</h2></div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <div className="retail-modal-body">
              {detailLoading ? (
                <div className="retail-modal-state"><LoaderCircle className="spin" size={24} /> Đang tải chi tiết hóa đơn...</div>
              ) : detailError ? (
                <div className="retail-modal-error"><AlertCircle size={18} /> {detailError}</div>
              ) : (
                <InvoiceDetail invoice={detail} />
              )}
            </div>
            <footer>
              <button className="retail-btn ghost" type="button" onClick={() => setDetail(null)}>Đóng</button>
              <button className="retail-btn primary" type="button" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(detail)}><Printer size={15} /> In hóa đơn</button>
              {hasGiftItems(detail) && <button className="retail-btn ghost" type="button" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(detail, true)}><Gift size={15} /> In hóa đơn quà tặng</button>}
              <button className="retail-btn primary" type="button" disabled={!refundActionState(detail).enabled} title={refundActionState(detail).title} onClick={() => navigate(`/sales-channels/${channel}/refund/create?saleId=${detail._id}`)}><RotateCcw size={15} /> Đổi trả hàng</button>
              {canManageSales ? (<button className="retail-btn ghost" type="button" disabled={!editActionState(detail).enabled} title={editActionState(detail).title} onClick={() => navigate(`/sales-channels/${channel}/retail/create?editId=${detail._id}`)}><FilePenLine size={15} /> Sửa đơn hàng</button>) : null}
            </footer>
          </div>
        </div>
      )}
      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Hóa đơn bán lẻ"
          defaultFilename={`hoa-don-ban-le-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const items = productLines(invoice);
  const payments = paymentRows(invoice);
  const customer = invoice.customerId;
  const branch = invoice.branchId;
  const status = statusMeta(invoice.status, invoice.refundStatus);

  return (
    <div className="retail-detail-grid">
      <div className="retail-detail-main">
        <section className="retail-detail-card">
          <h3>Khách hàng</h3>
          <div className="retail-info-grid">
            <span><small>Tên khách hàng</small><strong>{customer?.name || 'Khách lẻ'}</strong></span>
            <span><small>Số điện thoại</small><strong>{customer?.phone || '—'}</strong></span>
            <span><small>Mã khách hàng</small><strong>{customer?.code || '—'}</strong></span>
            <span><small>Trạng thái</small><strong><em className={`retail-status ${status.tone}`}>{status.label}</em></strong></span>
          </div>
        </section>

        <section className="retail-detail-card">
          <h3>Sản phẩm ({items.length})</h3>
          <div className="retail-detail-table">
            <table>
              <thead><tr><th>#</th><th>Sản phẩm</th><th className="number">SL</th><th className="number">Giá bán</th><th className="number">Thành tiền</th></tr></thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item._id || `${productCode(item)}-${index}`}>
                    <td>{index + 1}</td>
                    <td><div className="retail-stack"><strong>{productName(item)}</strong><span>{productCode(item) || '—'}</span></div></td>
                    <td className="number">{(Number(item.amount) || 0).toLocaleString('vi-VN')}</td>
                    <td className="number">{safeMoney(item.value)}</td>
                    <td className="number total">{safeMoney((Number(item.value) || 0) * (Number(item.amount) || 0))}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} className="retail-detail-empty">Không có dòng sản phẩm.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {invoice.note && <section className="retail-detail-card"><h3>Ghi chú</h3><p className="retail-note">{invoice.note}</p></section>}
      </div>

      <aside className="retail-detail-side">
        <section className="retail-detail-card">
          <h3>Thanh toán</h3>
          <dl className="retail-money-summary">
            <div><dt>Giá trị hàng hóa</dt><dd>{items.length ? safeMoney(grossValue(invoice)) : '—'}</dd></div>
            <div><dt>Giảm giá</dt><dd className="discount">{Number(invoice.discountValue) > 0 ? (
              <span className="retail-discount-detail">
                <span>-{safeMoney(discountMoneyAmount(invoice))}</span>
                {invoice.discountType === 'percent' ? <span className="retail-discount-rate">{Number(invoice.discountValue)}%</span> : null}
              </span>
            ) : '—'}</dd></div>
            <div className="grand"><dt>Tổng tiền</dt><dd>{safeMoney(invoice.value)}</dd></div>
            <div><dt>Đã thanh toán</dt><dd>{safeMoney(invoice.valuePayment)}</dd></div>
          </dl>
          {payments.length > 0 && (
            <div className="retail-payment-breakdown">
              {payments.map((payment, index) => <span key={`${payment.label}-${index}`}><small>{payment.label}</small><strong>{safeMoney(payment.amount)}</strong></span>)}
            </div>
          )}
        </section>

        <section className="retail-detail-card">
          <h3>Thông tin hóa đơn</h3>
          <div className="retail-detail-info">
            <span><Store size={15} /><div><small>Cửa hàng / Kho</small><strong>{branch?.name || branch?.code || '—'}</strong></div></span>
            <span><UserRound size={15} /><div><small>Người tạo</small><strong>{invoice.authorId?.name || invoice.userId?.name || '—'}</strong></div></span>
            <span><CalendarDays size={15} /><div><small>Ngày tạo</small><strong>{safeDate(invoice.createdAt)}</strong></div></span>
          </div>
        </section>
      </aside>
    </div>
  );
}

const retailStyles = `
/* Retail invoice list - premium effect system, aligned with Overview / Products / Warehouse cluster */
.retail-invoice-page{
  --ri-accent:#2563eb;
  --ri-accent-2:#6d5dfc;
  --ri-accent-rgb:37,99,235;
  --ri-border:rgba(148,163,184,.22);
  --ri-shadow-sm:0 8px 20px rgba(15,23,42,.06);
  --ri-shadow:0 18px 42px rgba(15,23,42,.10);
  --ri-surface:rgba(255,255,255,.96);
  --ri-radius:14px;
  --ri-radius-lg:18px;
  display:flex;flex-direction:column;min-width:0;gap:16px;
  min-height:calc(100vh - 76px);
  padding:22px clamp(18px,4vw,44px) 46px;
  background:
    radial-gradient(circle at top left,rgba(var(--ri-accent-rgb),.12),transparent 30%),
    radial-gradient(circle at 86% 8%,rgba(109,93,252,.10),transparent 26%),
    linear-gradient(180deg,#f8fbff 0%,#f4f7fc 100%);
  color:#0f172a;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}

/* ---------- Hero ---------- */
.retail-hero{
  position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:22px;
  padding:22px 24px;border:1px solid var(--ri-border);border-radius:var(--ri-radius-lg);
  background:
    radial-gradient(900px 240px at 92% -40%,rgba(var(--ri-accent-rgb),.16),transparent 70%),
    linear-gradient(135deg,rgba(237,233,254,.4),rgba(255,255,255,.96));
  box-shadow:var(--ri-shadow);backdrop-filter:blur(10px);animation:ri-rise 360ms ease both;overflow:hidden;
}
.retail-hero::after{content:"";position:absolute;inset:auto -60px -80px auto;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(109,93,252,.16),transparent 68%);pointer-events:none}
.retail-hero-text{position:relative;z-index:1;display:grid;gap:6px;min-width:0}
.retail-eyebrow{display:inline-flex;align-items:center;gap:8px;width:fit-content;min-height:28px;padding:0 12px;border-radius:999px;background:rgba(var(--ri-accent-rgb),.12);color:var(--ri-accent);font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.retail-hero h1{margin:0;font-size:clamp(22px,2vw,28px);font-weight:850;letter-spacing:-.03em;line-height:1.15;background:linear-gradient(120deg,#1e3a8a,var(--ri-accent) 60%,var(--ri-accent-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.retail-hero p{margin:0;max-width:680px;color:#64748b;font-size:13px;line-height:1.55}
.retail-hero-icon{width:56px;height:56px;border-radius:18px;display:inline-grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--ri-accent),var(--ri-accent-2));box-shadow:0 14px 30px rgba(var(--ri-accent-rgb),.32);flex-shrink:0}

/* ---------- Surfaces (filterbar / actionbar / table) ---------- */
.retail-actionbar,.retail-table-card,.retail-alert{border:1px solid var(--ri-border);border-radius:var(--ri-radius);background:var(--ri-surface);box-shadow:var(--ri-shadow-sm);backdrop-filter:blur(8px)}
.retail-filterbar{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1fr) minmax(150px,1fr) minmax(170px,1.1fr) minmax(132px,.8fr) minmax(132px,.8fr) auto auto;gap:10px;align-items:center;padding:16px;border:1px solid var(--ri-border);border-radius:var(--ri-radius);background:linear-gradient(180deg,#fbfdff,#f8fafc);box-shadow:var(--ri-shadow-sm);animation:ri-rise 340ms ease both}
.retail-filter-field{min-height:40px;display:inline-flex;align-items:center;gap:8px;min-width:0;background:#fff;border:1px solid #d7e0ec;border-radius:13px;padding:0 11px;color:#64748b;box-shadow:0 8px 20px rgba(15,23,42,.04);transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
.retail-filter-field:focus-within{border-color:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.12)}
.retail-filter-field input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:#0f172a;font:inherit;font-size:13px;font-weight:600}
.retail-date-field span{white-space:nowrap;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b}
.retail-filter-select{min-height:40px;width:100%;min-width:0;border:1px solid #d7e0ec;border-radius:13px;background:#fff;padding:0 11px;color:#0f172a;font-size:13px;font-weight:600;box-shadow:0 8px 20px rgba(15,23,42,.04);transition:border-color .15s ease,box-shadow .15s ease}
.retail-filter-select:focus{outline:0;border-color:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.12)}
.retail-filter-button,.retail-reset-button{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 16px;border-radius:13px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;transition:box-shadow .15s ease,transform .15s ease,background .15s ease,border-color .15s ease,color .15s ease}
.retail-filter-button{border:0;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;box-shadow:0 12px 24px rgba(22,163,74,.2)}
.retail-filter-button:hover{background:linear-gradient(135deg,#15803d,#166534);box-shadow:0 16px 30px rgba(22,163,74,.28);transform:translateY(-1px)}
.retail-reset-button{border:1px solid #d7e0ec;background:#fff;color:#334155;box-shadow:0 8px 18px rgba(15,23,42,.04)}
.retail-reset-button:hover{border-color:#16a34a;color:#16a34a}
.retail-filter-button:active,.retail-reset-button:active{transform:translateY(0);filter:brightness(.98)}
.retail-btn{height:38px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 14px;border:1px solid transparent;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;transition:box-shadow .16s ease,transform .16s ease,filter .16s ease,border-color .16s ease,color .16s ease}
.retail-btn:disabled{opacity:.55;cursor:not-allowed}
.retail-btn.primary{background:linear-gradient(135deg,var(--ri-accent),var(--ri-accent-2));color:#fff;box-shadow:0 8px 18px rgba(var(--ri-accent-rgb),.22)}
.retail-btn.primary:hover{box-shadow:0 12px 24px rgba(var(--ri-accent-rgb),.30);transform:translateY(-1px)}
.retail-btn.success{background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;box-shadow:0 8px 18px rgba(22,163,74,.22)}
.retail-btn.success:hover{box-shadow:0 12px 24px rgba(22,163,74,.30);transform:translateY(-1px)}
.retail-btn.ghost{background:#fff;border-color:#cfd7df;color:#475569}
.retail-btn.ghost:hover{border-color:rgba(var(--ri-accent-rgb),.45);color:var(--ri-accent)}
.retail-btn:active{transform:translateY(0);filter:brightness(.98)}

.retail-actionbar{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;animation:ri-rise 340ms ease both}
.retail-actionbar-left,.retail-actionbar-right{display:flex;align-items:center;gap:12px}
.retail-actionbar-right{font-size:12px;color:#687685}
.retail-selected,.retail-filter-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;background:rgba(var(--ri-accent-rgb),.1);color:var(--ri-accent);font-size:12px;font-weight:700}
.retail-icon-btn{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d4dbe2;border-radius:10px;background:#fff;color:#657383;cursor:pointer;transition:border-color .16s ease,color .16s ease,background .16s ease}
.retail-icon-btn:hover{background:rgba(var(--ri-accent-rgb),.08);border-color:rgba(var(--ri-accent-rgb),.4);color:var(--ri-accent)}

.retail-alert{display:flex;align-items:center;gap:10px;margin:0;padding:12px 14px;border-color:rgba(220,38,38,.25);background:linear-gradient(135deg,rgba(254,242,242,.96),#fff);color:#b42318}
.retail-alert div{display:flex;flex:1;flex-direction:column;gap:2px}
.retail-alert span{font-size:12px}
.retail-alert button{border:0;background:transparent;color:#b42318;font-weight:750;cursor:pointer}

/* ---------- Table ---------- */
.retail-table-card{min-width:0;overflow:hidden;animation:ri-rise 360ms ease both}
.retail-table-scroll{overflow:auto}
.retail-table-card table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:12px}
.retail-table-card colgroup col{width:auto}
.retail-table-card .col-check{width:3.5%}
.retail-table-card .col-creator{width:9.5%}
.retail-table-card .col-id{width:8%}
.retail-table-card .col-customer{width:13%}
.retail-table-card .col-product{width:17%}
.retail-table-card .col-gross{width:8.5%}
.retail-table-card .col-qty{width:4%}
.retail-table-card .col-discount{width:7%}
.retail-table-card .col-total{width:8.5%}
.retail-table-card .col-payment{width:7%}
.retail-table-card .col-status{width:8%}
.retail-table-card .col-action{width:6%}
.retail-table-card th:last-child,.retail-table-card td:last-child{border-right:0}
.retail-table-card th{position:sticky;top:0;z-index:1;padding:9px 10px;background:linear-gradient(180deg,#f1f5f9,#eef2f7);border-bottom:1px solid rgba(148,163,184,.4);border-right:1px solid rgba(148,163,184,.18);color:#334155;font-size:11px;font-weight:750;text-align:left;white-space:normal;letter-spacing:.02em}
.retail-table-card td{padding:9px 10px;border-bottom:1px solid #eef2f7;border-right:1px solid #f1f5f9;vertical-align:top;background:#fff;transition:background .14s ease}
.retail-table-card tbody tr{transition:transform .14s ease}
.retail-table-card tbody tr:hover td{background:linear-gradient(90deg,rgba(var(--ri-accent-rgb),.05),rgba(var(--ri-accent-rgb),.015))}
.retail-summary-foot td{padding:10px;background:linear-gradient(180deg,#f8fafc,#eef2f7);border-top:2px solid rgba(148,163,184,.45);border-bottom:0;border-right:1px solid rgba(148,163,184,.18);color:#334155;font-weight:800;white-space:nowrap}
.retail-summary-foot td:last-child{border-right:0}
.retail-summary-foot td.retail-summary-label{text-align:right;color:#475569;font-size:11px;font-weight:750;letter-spacing:.02em;white-space:nowrap}
.retail-summary-foot td.total{color:#16a34a}
.retail-summary-foot td.retail-summary-paid{color:#0f172a}
.retail-summary-foot td.number{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.35}
.retail-table-card .check,.retail-table-card .action{text-align:center}
.retail-table-card .number{text-align:right}
.retail-table-card td.number{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.retail-stack,.retail-product-cell,.retail-payments{display:flex;flex-direction:column;gap:3px}
.retail-stack strong,.retail-product-cell strong{font-weight:700;color:#0f172a}
.retail-stack span,.retail-product-cell span{color:#64748b;font-size:11px}
.retail-stack strong,.retail-stack span{min-width:0;word-break:break-word}
.retail-product-cell{min-width:0;max-width:100%}
.retail-product-cell strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.retail-product-cell em{color:var(--ri-accent);font-size:11px;font-style:normal;font-weight:700}
.retail-invoice-link{display:block;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;padding:0;border:0;background:transparent;color:var(--ri-accent);font-weight:700;cursor:pointer;transition:color .14s ease}
.retail-invoice-link:hover{color:var(--ri-accent-2);text-decoration:underline}
.retail-table-card td.discount{color:#ea580c}
.retail-discount-cell{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px;line-height:1.3}
.retail-discount-money{white-space:nowrap}
.retail-discount-rate{color:#b45309;font-size:11px;font-weight:600;white-space:nowrap}
.retail-discount-detail{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px;line-height:1.3}
.retail-table-card td.total{color:#16a34a;font-weight:800}
.retail-payment-column{min-width:0;max-width:100%}
.retail-payments{min-width:0;max-width:180px;gap:8px}
.retail-payment-item{display:flex;min-width:0;max-width:100%;flex-direction:column;align-items:flex-end;gap:3px}
.retail-payment-amount{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-weight:700;white-space:nowrap;color:#0f172a}
.retail-payment-method{display:block;min-width:0;max-width:100%;overflow:hidden;color:#64748b;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.retail-status{display:inline-flex;padding:3px 9px;border-radius:999px;background:#eef1f4;color:#5d6874;font-size:11px;font-style:normal;font-weight:700;white-space:nowrap}
.retail-status.success{background:rgba(22,163,74,.12);color:#15803d}
.retail-status.warning{background:rgba(180,83,9,.12);color:#b45309}
.retail-status.danger{background:rgba(220,38,38,.12);color:#b91c1c}
.retail-table-card .retail-status{white-space:normal;line-height:1.3}
.retail-row-menu{position:relative;display:inline-flex}
.retail-menu{position:absolute;z-index:40;top:38px;right:0;width:220px;padding:6px;background:#fff;border:1px solid var(--ri-border);border-radius:12px;box-shadow:0 18px 40px rgba(15,23,42,.16);text-align:left;animation:ri-popover-in 160ms ease both}
.retail-menu button{width:100%;display:flex;align-items:center;gap:8px;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:#334155;font-size:12px;cursor:pointer;transition:background .14s ease,color .14s ease}
.retail-menu button:hover{background:rgba(var(--ri-accent-rgb),.08);color:var(--ri-accent)}
.retail-menu button:disabled{opacity:.45;cursor:not-allowed}
.retail-menu button:disabled:hover{background:transparent;color:#334155}
.retail-empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#94a3b8}
.retail-empty strong{color:#475569;font-size:14px}
.retail-skeleton td span{display:block;height:13px;border-radius:6px;background:linear-gradient(100deg,#e9edf4 30%,#f4f7fb 50%,#e9edf4 70%);background-size:200% 100%;animation:ri-shimmer 1.4s ease-in-out infinite}
.retail-pagination{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--ri-border);color:#687685;font-size:12px}
.retail-pagination>div{display:flex;align-items:center;gap:8px}
.retail-pagination button{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d5dde5;border-radius:9px;background:#fff;cursor:pointer;transition:border-color .16s ease,color .16s ease}
.retail-pagination button:hover:not(:disabled){border-color:rgba(var(--ri-accent-rgb),.45);color:var(--ri-accent)}
.retail-pagination button:disabled{opacity:.45;cursor:not-allowed}

/* ---------- Modals ---------- */
.retail-modal-backdrop{position:fixed;z-index:1000;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.52);backdrop-filter:blur(4px);animation:ri-fade 180ms ease both}
.retail-modal{width:min(560px,100%);max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:#fff;border:1px solid var(--ri-border);border-radius:18px;box-shadow:0 30px 70px rgba(15,23,42,.30);overflow:hidden;animation:ri-rise 220ms ease both}
.retail-modal.detail-modal{width:min(1040px,100%)}
.retail-modal header,.retail-modal footer{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eef2f7}
.retail-modal footer{justify-content:flex-end;gap:8px;border-top:1px solid #eef2f7;border-bottom:0}
.retail-modal header>div{display:flex;align-items:center;gap:9px}
.retail-modal h2{margin:0;font-size:16px;font-weight:800}
.retail-modal header>button{width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:#64748b;cursor:pointer;transition:color .16s ease,background .16s ease}
.retail-modal header>button:hover{color:#0f172a;background:#f1f5f9}
.retail-modal-body{padding:16px;overflow:auto}
.retail-modal-state{min-height:150px;display:flex;align-items:center;justify-content:center;gap:9px;color:#64748b}
.retail-modal-error{display:flex;align-items:center;gap:8px;padding:12px;border-radius:10px;background:#fff2f1;color:#b42318}
.retail-modal-error button{margin-left:auto;border:0;background:transparent;color:inherit;font-weight:700;cursor:pointer}
.retail-branch-list{display:flex;flex-direction:column;gap:10px}
.retail-branch-list>button{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:14px;border:1px solid var(--ri-border);border-radius:12px;background:#fff;color:#475569;text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease}
.retail-branch-list>button:hover{border-color:rgba(var(--ri-accent-rgb),.4);background:rgba(var(--ri-accent-rgb),.04);transform:translateY(-1px);box-shadow:0 10px 22px rgba(15,23,42,.06)}
.retail-branch-list>button.active{border-color:#16a34a;background:rgba(22,163,74,.06);color:#15803d;box-shadow:0 10px 22px rgba(22,163,74,.12)}
.retail-branch-list span{display:flex;flex-direction:column;gap:3px}
.retail-branch-list small{color:#64748b}
.retail-detail-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.8fr);gap:14px}
.retail-detail-main,.retail-detail-side{display:flex;flex-direction:column;gap:12px}
.retail-detail-card{border:1px solid var(--ri-border);border-radius:12px;overflow:hidden;background:#fff}
.retail-detail-card h3{margin:0;padding:12px 14px;background:linear-gradient(180deg,#f8fafc,#f1f5f9);border-bottom:1px solid var(--ri-border);font-size:13px;font-weight:800;color:#334155}
.retail-info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:14px}
.retail-info-grid span{display:flex;flex-direction:column;gap:3px}
.retail-info-grid small,.retail-detail-info small{color:#64748b}
.retail-detail-table{overflow:auto}
.retail-detail-table table{min-width:620px}
.retail-detail-table th{position:static}
.retail-detail-empty{text-align:center;color:#64748b}
.retail-note{margin:0;padding:14px;white-space:pre-wrap}
.retail-money-summary{margin:0;padding:14px}
.retail-money-summary>div{display:flex;justify-content:space-between;gap:12px;padding:7px 0}
.retail-money-summary dt{color:#64748b}
.retail-money-summary dd{margin:0;font-weight:700}
.retail-money-summary .discount{color:#ea580c}
.retail-money-summary .grand{border-top:1px solid var(--ri-border);font-size:15px}
.retail-money-summary .grand dd{color:#16a34a}
.retail-payment-breakdown{display:flex;flex-direction:column;gap:6px;padding:0 14px 14px}
.retail-payment-breakdown span{display:flex;justify-content:space-between;padding:8px 10px;border-radius:8px;background:#f4f7f9}
.retail-payment-breakdown small{color:#64748b}
.retail-detail-info{display:flex;flex-direction:column;gap:12px;padding:14px}
.retail-detail-info>span{display:flex;align-items:flex-start;gap:9px}
.retail-detail-info>span>div{display:flex;flex-direction:column;gap:3px}

/* ---------- Animations ---------- */
.spin{animation:ri-spin 1s linear infinite}
@keyframes ri-spin{to{transform:rotate(360deg)}}
@keyframes ri-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes ri-fade{from{opacity:0}to{opacity:1}}
@keyframes ri-shimmer{0%{background-position:100% 0;opacity:.7}50%{opacity:1}100%{background-position:-100% 0;opacity:.7}}
@keyframes ri-popover-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

/* ---------- Responsive ---------- */
@media(max-width:1180px){.retail-filterbar{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.retail-hero{flex-direction:column;align-items:stretch;gap:14px}.retail-filterbar{grid-template-columns:1fr}.retail-actionbar{align-items:flex-start;flex-direction:column}.retail-actionbar-right{width:100%;flex-wrap:wrap}.retail-detail-grid{grid-template-columns:1fr}.retail-info-grid{grid-template-columns:1fr}.retail-pagination{align-items:flex-start;flex-direction:column;gap:8px}}
@media(max-width:900px){.retail-table-card table{table-layout:auto;min-width:980px}.retail-table-card th{white-space:nowrap}.retail-table-card colgroup col{width:auto}}
`;


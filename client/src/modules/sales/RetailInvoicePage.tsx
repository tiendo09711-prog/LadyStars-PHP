import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import {
  suggestCustomers,
  suggestProducts,
  suggestSaleInvoices,
} from '../../core/api/filterSuggestions';
import { isAdminRole } from '../../core/auth/access';
import { buildInvoiceProfile, getBranch, getStoreSetting } from '../../core/api/branch.api';
import { FilterSuggestInput } from '../../core/components/ui/FilterSuggestInput';
import { useProductScanTarget } from '../../core/hooks/productScanner';
import { buildReceiptHtml, writeAndPrintPopup } from './invoicePrint';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import {
  productLines,
  productName,
  productCode,
  totalQuantity,
  grossValue,
  discountMoneyAmount,
  discountPercentRate,
  netValue,
  statusMeta,
  hasGiftItems,
  refundActionState,
  editActionState,
  deleteActionState,
} from './invoiceHelpers';
import './retail-invoice-page.css';

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

/** Format local calendar date as YYYY-MM-DD for <input type="date">. */
function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Last 15 calendar days inclusive (today and 14 days back). */
function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 14);
  return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) };
}

function createDefaultFilters(): Filters {
  return {
    invoiceCode: '',
    storeId: '',
    ...defaultDateRange(),
    customerKeyword: '',
    productKeyword: '',
  };
}

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
          label: entry?.methodId?.name || entry?.methodId?.code || entry?.method || 'Thanh toán',
          amount: Number(entry?.amount),
        }))
        .filter((entry: any) => Number.isFinite(entry.amount) && entry.amount > 0)
    : [];
  if (rows.length > 0) return rows;
  const paid = Number(invoice.valuePayment ?? invoice.value_payment);
  if (Number.isFinite(paid) && paid > 0) {
    const label = invoice.paymentMethod || invoice.payment_method || 'Đã thanh toán';
    return [{ label: String(label), amount: paid }];
  }
  return [];
}

/** Net total after order-level discount (shared helper handles legacy % / missing value). */
function invoiceTotalValue(invoice: Invoice) {
  return netValue(invoice);
}

function invoicePaidValue(invoice: Invoice) {
  const fromPayments = paymentRows(invoice).reduce((acc, entry) => acc + entry.amount, 0);
  if (fromPayments > 0) return fromPayments;
  const direct = Number(invoice.valuePayment ?? invoice.value_payment);
  return Number.isFinite(direct) ? direct : 0;
}

export function RetailInvoicePage({ channel }: RetailInvoicePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingPrintWindowRef = useRef<Window | null>(null);
  /** Monotonic load id so an aborted request never leaves loading=true while a newer load is active. */
  const invoiceLoadSeqRef = useRef(0);
  const productKeywordRef = useRef<HTMLInputElement>(null);
  const [draftFilters, setDraftFilters] = useState<Filters>(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<Filters>(() => createDefaultFilters());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowActionOpen, setRowActionOpen] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
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
  /** Prevents admin actions from flashing hidden/visible before /auth/me settles. */
  const [authReady, setAuthReady] = useState(false);
  const canManageSales = authReady && isAdminRole(currentUser?.role);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const pageSummary = useMemo(() => {
    if (!invoices.length) return { gross: 0, totalValue: 0, paid: 0 };
    const gross = invoices.reduce((sum, invoice) => sum + (productLines(invoice).length > 0 ? grossValue(invoice) : 0), 0);
    const totalValue = invoices.reduce((sum, invoice) => sum + invoiceTotalValue(invoice), 0);
    const paid = invoices.reduce((sum, invoice) => sum + invoicePaidValue(invoice), 0);
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
    setAuthReady(false);
    http.get('/auth/me')
      .then((response) => {
        if (!mounted) return;
        setCurrentUser(response.data?.user || response.data || null);
      })
      .catch(() => {
        if (mounted) setCurrentUser(null);
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
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
    const loadId = ++invoiceLoadSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
        channel,
        type: 'retail',
      };
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const response = await http.get('/products/sales', { params, signal });
      if (loadId !== invoiceLoadSeqRef.current) return;
      const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
      setInvoices(items);
      setTotal(Array.isArray(response.data) ? items.length : Number(response.data.total ?? items.length));
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || signal?.aborted) return;
      if (loadId !== invoiceLoadSeqRef.current) return;
      setInvoices([]);
      setTotal(0);
      setError(err.response?.data?.message || 'Không tải được dữ liệu hóa đơn bán lẻ.');
    } finally {
      // Only the latest in-flight load may clear the spinner.
      if (loadId === invoiceLoadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadInvoices(controller.signal);
    return () => {
      controller.abort();
    };
  }, [appliedFilters, channel, page]);

  useEffect(() => {
    if (!rowActionOpen) return;
    const closeMenus = () => {
      setRowActionOpen(null);
      setRowMenuPos(null);
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.retail-row-action-menu')) return;
      if (target.closest('.retail-row-menu-button')) return;
      closeMenus();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };
    const handleViewportChange = () => closeMenus();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [rowActionOpen]);

  const selectedAll = invoices.length > 0 && invoices.every((invoice) => selectedIds.has(invoice._id));

  const hasActiveFilters = useMemo(() => {
    const defaults = createDefaultFilters();
    return (
      appliedFilters.invoiceCode !== defaults.invoiceCode
      || appliedFilters.storeId !== defaults.storeId
      || appliedFilters.dateFrom !== defaults.dateFrom
      || appliedFilters.dateTo !== defaults.dateTo
      || appliedFilters.customerKeyword !== defaults.customerKeyword
      || appliedFilters.productKeyword !== defaults.productKeyword
    );
  }, [appliedFilters]);

  const openRowInvoice = rowActionOpen
    ? invoices.find((invoice) => invoice._id === rowActionOpen) ?? null
    : null;

  const closeRowMenu = () => {
    setRowActionOpen(null);
    setRowMenuPos(null);
  };

  const openRowActionMenu = (invoiceId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (rowActionOpen === invoiceId) {
      closeRowMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 260;
    const gap = 6;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - gap);
    }
    setRowMenuPos({ top, left });
    setRowActionOpen(invoiceId);
  };

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const resetFilters = () => {
    const next = createDefaultFilters();
    setDraftFilters(next);
    setPage(1);
    setAppliedFilters(next);
  };

  useProductScanTarget(productKeywordRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    setDraftFilters((current) => {
      const next = { ...current, productKeyword: query };
      setPage(1);
      setAppliedFilters(next);
      return next;
    });
    window.setTimeout(() => productKeywordRef.current?.focus(), 0);
  });

  const openBranchPicker = async () => {
    setShowBranchModal(true);
    if (branches.length === 0 && !branchLoading) await loadBranches();
  };

  const continueCreate = () => {
    if (!selectedBranchId) return;
    navigate(`/sales-channels/${channel}/retail/create?branchId=${selectedBranchId}`);
  };

  const openDetail = async (invoice: Invoice) => {
    closeRowMenu();
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

  const writePrintPlaceholder = (popup: Window) => {
    try {
      popup.document.open();
      popup.document.write(
        '<!doctype html><html lang="vi"><head><meta charset="utf-8" /><title>Đang chuẩn bị in</title></head>'
        + '<body data-receipt-ready="false"><p>Đang chuẩn bị hóa đơn...</p></body></html>',
      );
      popup.document.close();
    } catch {
      // Ignore write failures on closed/restricted popups.
    }
  };

  /** Open (or reuse) a single print popup during a user gesture to avoid blockers. */
  const openPrintWindow = () => {
    const existing = pendingPrintWindowRef.current;
    if (existing && !existing.closed) return existing;

    const popup = window.open('about:blank', PRINT_WINDOW_NAME, PRINT_WINDOW_FEATURES);
    if (!popup) return null;

    pendingPrintWindowRef.current = popup;
    writePrintPlaceholder(popup);
    return popup;
  };

  const primePrintWindow = () => {
    openPrintWindow();
  };

  const clearPendingPrintWindow = (popup?: Window | null) => {
    if (!popup || pendingPrintWindowRef.current === popup) {
      pendingPrintWindowRef.current = null;
    }
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
      const unit = Number(item?.value ?? item?.price ?? 0);
      const qty = Number(item?.amount ?? item?.quantity ?? 0);
      const total = Number(item?.total ?? unit * qty);
      return {
        name: productName(item),
        code: productCode(item) || undefined,
        quantity: qty.toLocaleString('vi-VN'),
        price: safeMoney(unit),
        total: hideTotals ? '—' : safeMoney(total),
      };
    });
    const paid = invoicePaidValue(invoice);
    const total = invoiceTotalValue(invoice);
    const tendered = Number(invoice.tenderedValue ?? paid);
    const hasDistinctTendered = Number.isFinite(tendered) && tendered > 0 && Math.abs(tendered - paid) > 1;
    const change = hasDistinctTendered ? Math.max(tendered - total, 0) : 0;
    const customerText = `${customer?.name || 'Khách lẻ'}${customer?.phone ? ` (${customer.phone})` : ''}`;
    const gross = productLines(invoice).length > 0 ? grossValue(invoice) : total;

    return buildReceiptHtml({
      profile,
      title,
      date: safeDate(invoice.completedAt || invoice.createdAt),
      code: invoice.code || invoice._id,
      customer: customerText,
      sections: [{ lines: receiptLines }],
      summary: hideTotals ? [] : [
        { label: 'Tổng cộng', value: safeMoney(gross) },
        { label: 'Giảm giá', value: discountMoneyAmount(invoice) > 0 ? `-${safeMoney(discountMoneyAmount(invoice))}${discountPercentRate(invoice) != null ? ` (${discountPercentRate(invoice)}%)` : ''}` : '—' },
        { label: 'Thành tiền', value: safeMoney(total), strong: true },
        { label: 'Đã thanh toán', value: safeMoney(paid) },
        ...(hasDistinctTendered ? [{ label: 'Tiền khách trả', value: safeMoney(tendered) }] : []),
        ...(change > 0 ? [{ label: 'Tiền trả lại', value: safeMoney(change) }] : []),
      ],
    });
  };

  const resolvePrintBranch = async (invoice: Invoice) => {
    const rawBranch = invoice.branchId || invoice.warehouseId || invoice.warehouse;
    const branchId = typeof rawBranch === 'string' || typeof rawBranch === 'number'
      ? String(rawBranch)
      : rawBranch?._id || rawBranch?.id;
    if (!branchId) return null;
    try {
      return await getBranch(String(branchId), { includeInactive: true });
    } catch {
      return typeof rawBranch === 'object' && rawBranch ? rawBranch : null;
    }
  };

  /** Single canonical print flow for list menu + detail modal. */
  const handlePrintInvoice = async (invoice: Invoice, giftOnly = false) => {
    closeRowMenu();

    // Prefer the popup opened on pointerdown (user gesture); otherwise open now.
    const popup = openPrintWindow();
    if (!popup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn. Hãy cho phép pop-up và thử lại.');
      return;
    }

    try {
      if (popup.closed) {
        clearPendingPrintWindow(popup);
        window.alert('Cửa sổ in đã bị đóng. Vui lòng thử lại.');
        return;
      }

      const fullInvoice = await fetchInvoiceDetail(invoice);
      if (popup.closed) {
        clearPendingPrintWindow(popup);
        return;
      }

      const items = giftOnly
        ? productLines(fullInvoice).filter((item) => item?.isGift === true || item?.gift === true || item?.giftForProductId)
        : productLines(fullInvoice);

      if (giftOnly && items.length === 0) {
        try { popup.close(); } catch { /* ignore */ }
        window.alert('Hóa đơn này không có sản phẩm tặng kèm');
        return;
      }

      const branch = await resolvePrintBranch(fullInvoice);
      if (popup.closed) {
        clearPendingPrintWindow(popup);
        return;
      }
      const shop = branch ? {} : await getStoreSetting().catch(() => ({}));
      if (popup.closed) {
        clearPendingPrintWindow(popup);
        return;
      }

      const html = buildPrintDocument(
        fullInvoice,
        branch,
        shop,
        items,
        'HÓA ĐƠN',
        giftOnly,
      );

      writeAndPrintPopup(popup, html);
    } catch (err: any) {
      try {
        if (!popup.closed) popup.close();
      } catch {
        // ignore
      }
      window.alert(err.response?.data?.message || 'Không thể in hóa đơn.');
    } finally {
      clearPendingPrintWindow(popup);
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
        `Tổng tiền: ${safeMoney(invoiceTotalValue(invoice))}`,
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
      closeRowMenu();
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
      { label: '% chiết khấu', key: 'discountRate', getValue: (invoice: Invoice) => discountPercentRate(invoice) ?? 0 },
      { label: 'Tổng tiền', key: 'value', getValue: (invoice: Invoice) => invoiceTotalValue(invoice) },
      { label: 'Phương thức thanh toán', key: 'paymentMethods', getValue: (invoice: Invoice) => paymentRows(invoice).map((p) => p.label).join(', ') || '—' },
      { label: 'Đã thanh toán', key: 'paid', getValue: (invoice: Invoice) => invoicePaidValue(invoice) },
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
          const params: Record<string, string | number> = { page: nextPage, limit: nextLimit, channel, type: 'retail' };
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
    <div className="page-stack retail-root retail-invoice-page">
      <section className="data-card retail-toolbar-card retail-sticky-toolbar">
        {/* Row 1: title + KPI stats — single horizontal band, no overlap */}
        <div className="retail-toolbar-row retail-toolbar-row--summary" aria-label="Tóm tắt Bán lẻ">
          <div className="retail-compact-head">
            <h1 className="retail-compact-heading-sr">Hóa đơn bán lẻ</h1>
            <span className="retail-toolbar-eyebrow">Bán lẻ</span>
            <span className="retail-toolbar-title-chip">
              <ShoppingCart size={14} aria-hidden="true" />
              Hóa đơn bán lẻ
            </span>
          </div>

          <div className="retail-kpi-row">
            <div className="retail-kpi-card">
              <span className="retail-kpi-label">Tổng hóa đơn</span>
              <strong className="retail-kpi-value">{total.toLocaleString('vi-VN')}</strong>
            </div>
            <div className="retail-kpi-card">
              <span className="retail-kpi-label">Đang hiển thị</span>
              <strong className="retail-kpi-value">
                {total === 0
                  ? '0'
                  : `${rangeStart.toLocaleString('vi-VN')}–${rangeEnd.toLocaleString('vi-VN')}`}
              </strong>
            </div>
            <div className="retail-kpi-card retail-kpi-card--money">
              <span className="retail-kpi-label">Tổng tiền trang</span>
              <strong className="retail-kpi-value">{safeMoney(pageSummary.totalValue)}</strong>
            </div>
            <div className="retail-kpi-card retail-kpi-card--money">
              <span className="retail-kpi-label">Đã thu trang</span>
              <strong className="retail-kpi-value">{safeMoney(pageSummary.paid)}</strong>
            </div>
            {selectedIds.size > 0 ? (
              <div className="retail-kpi-card retail-kpi-card--selected">
                <span className="retail-kpi-label">Đã chọn</span>
                <strong className="retail-kpi-value">{selectedIds.size.toLocaleString('vi-VN')}</strong>
              </div>
            ) : null}
            {hasActiveFilters ? (
              <div className="retail-kpi-card retail-kpi-card--filter">
                <span className="retail-kpi-label">Bộ lọc</span>
                <strong className="retail-kpi-value">Đang lọc</strong>
              </div>
            ) : null}
          </div>
        </div>

        {/* Row 2: filters + actions only */}
        <form className="retail-toolbar-row retail-filter-bar" onSubmit={applyFilters}>
          <label className="retail-search">
            <Search size={15} aria-hidden="true" />
            <FilterSuggestInput
              bare
              value={draftFilters.invoiceCode}
              onChange={(next) => setDraftFilters((current) => ({ ...current, invoiceCode: next }))}
              fetchSuggestions={(query, signal) =>
                suggestSaleInvoices(query, signal, { type: 'retail', channel })
              }
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

          <label className="retail-date-field">
            <span>Từ</span>
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              aria-label="Từ ngày"
            />
          </label>

          <label className="retail-date-field">
            <span>Đến</span>
            <input
              type="date"
              value={draftFilters.dateTo}
              min={draftFilters.dateFrom || undefined}
              onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
              aria-label="Đến ngày"
            />
          </label>

          <label className="retail-search">
            <UserRound size={14} aria-hidden="true" />
            <FilterSuggestInput
              bare
              value={draftFilters.customerKeyword}
              onChange={(next) => setDraftFilters((current) => ({ ...current, customerKeyword: next }))}
              fetchSuggestions={suggestCustomers}
              placeholder="Tên hoặc số điện thoại"
              aria-label="Khách hàng"
            />
          </label>

          <label className="retail-search">
            <Package size={14} aria-hidden="true" />
            <FilterSuggestInput
              bare
              ref={productKeywordRef}
              value={draftFilters.productKeyword}
              onChange={(next) => setDraftFilters((current) => ({ ...current, productKeyword: next }))}
              fetchSuggestions={suggestProducts}
              data-product-search-scan="true"
              data-product-search-primary="true"
              placeholder="Mã, tên SP hoặc quét barcode"
              aria-label="Sản phẩm"
            />
          </label>

          <div className="retail-filter-actions">
            <button className="retail-btn retail-btn-primary" type="submit">
              <Search size={14} aria-hidden="true" />
              Lọc
            </button>
            <button className="retail-btn retail-btn-secondary" type="button" onClick={resetFilters} title="Đặt lại bộ lọc và làm mới">
              <RefreshCw size={14} aria-hidden="true" />
              Làm mới
            </button>
            <button className="retail-btn retail-btn-primary" type="button" onClick={() => void openBranchPicker()}>
              <Plus size={14} aria-hidden="true" />
              Thêm hóa đơn
            </button>
            <button className="retail-btn retail-btn-secondary" type="button" onClick={() => setShowExportModal(true)}>
              <FileDown size={14} aria-hidden="true" />
              Xuất dữ liệu
            </button>
          </div>
        </form>
      </section>

      {error && (
        <div className="retail-alert" role="alert">
          <AlertCircle size={18} />
          <div><strong>Không tải được dữ liệu</strong><span>{error}</span></div>
          <button type="button" onClick={() => void loadInvoices()}>Thử lại</button>
        </div>
      )}

      <section className="data-card retail-table-card" aria-label="Danh sách hóa đơn bán lẻ">
        <div className="data-card-header retail-table-header">
          <div>
            <h2 className="retail-table-title">Bảng dữ liệu Bán lẻ</h2>
            <p className="retail-table-subtitle">
              {total.toLocaleString('vi-VN')} hóa đơn
              {hasActiveFilters ? ' · Đang lọc' : ''}
              {total > 0 ? ` · Trang ${page}/${totalPages}` : ''}
            </p>
          </div>
          <span className={`retail-selected-count${selectedIds.size > 0 ? ' is-active' : ''}`}>
            Đã chọn {selectedIds.size.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="table-scroll retail-table-scroll retail-sales-table">
          <table className="data-table retail-data-table">
            <colgroup>
              <col className="col-check" style={{ width: 40 }} />
              <col className="col-creator" style={{ width: 165 }} />
              <col className="col-id" style={{ width: 145 }} />
              <col className="col-customer" style={{ width: 115 }} />
              <col className="col-product" style={{ width: 145 }} />
              <col className="col-gross" style={{ width: 135 }} />
              <col className="col-qty" style={{ width: 75 }} />
              <col className="col-discount" style={{ width: 95 }} />
              <col className="col-total" style={{ width: 125 }} />
              <col className="col-payment" style={{ width: 110 }} />
              <col className="col-status" style={{ width: 100 }} />
              <col className="col-action" style={{ width: 75 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="check col-check">
                  <input type="checkbox" checked={selectedAll} onChange={(event) => toggleAll(event.target.checked)} aria-label="Chọn tất cả" />
                </th>
                <th className="col-creator">Người tạo / Ngày tạo</th>
                <th className="col-id">ID hóa đơn</th>
                <th className="col-customer">Khách hàng</th>
                <th className="col-product">Sản phẩm</th>
                <th className="number col-center col-gross">Giá trị hàng hóa</th>
                <th className="number col-center col-qty">Tổng SL</th>
                <th className="number col-center col-discount">Giảm giá</th>
                <th className="number col-center col-total">Tổng tiền</th>
                <th className="col-center col-payment">Thanh toán</th>
                <th className="col-center col-status">Trạng thái</th>
                <th className="action-cell col-action">Thao tác</th>
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
                  <td colSpan={12} className="retail-empty-cell">
                    <div className="retail-empty-state">
                      <Package size={28} aria-hidden="true" />
                      <strong>Không có hóa đơn phù hợp</strong>
                      <span>Thử đổi bộ lọc hoặc tạo hóa đơn bán lẻ mới.</span>
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
                return (
                  <tr key={invoice._id}>
                    <td className="check col-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(invoice._id)}
                        onChange={(event) => toggleOne(invoice._id, event.target.checked)}
                        aria-label={`Chọn hóa đơn ${invoice.code || invoice._id}`}
                      />
                    </td>
                    <td className="col-creator">
                      <div className="retail-stack">
                        <strong title={creator || '—'}>{creator || '—'}</strong>
                        <span title={safeDate(invoice.createdAt)}>{safeDate(invoice.createdAt)}</span>
                      </div>
                    </td>
                    <td className="col-id">
                      <button className="retail-invoice-link" type="button" title={invoice.code || '—'} onClick={() => void openDetail(invoice)}>
                        {invoice.code || '—'}
                      </button>
                    </td>
                    <td className="col-customer">
                      <div className="retail-stack">
                        <strong title={customer?.name || 'Khách lẻ'}>{customer?.name || 'Khách lẻ'}</strong>
                        <span title={customer?.phone || '—'}>{customer?.phone || '—'}</span>
                      </div>
                    </td>
                    <td className="col-product">
                      {firstItem ? (
                        <div className="retail-product-cell">
                          <strong title={productName(firstItem)}>{productName(firstItem)}</strong>
                          <span title={productCode(firstItem) || '—'}>{productCode(firstItem) || '—'}</span>
                          {items.length > 1 && <em>+{items.length - 1} sản phẩm khác</em>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="number col-center col-gross" title={items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}>
                      {items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}
                    </td>
                    <td className="number col-center col-qty" title={items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}>
                      {items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td
                      className="number col-center discount col-discount"
                      title={discountMoneyAmount(invoice) > 0 ? `-${safeMoney(discountMoneyAmount(invoice))}${discountPercentRate(invoice) != null ? ` (${discountPercentRate(invoice)}%)` : ''}` : '—'}
                    >
                      {discountMoneyAmount(invoice) > 0 ? (
                        <span className="retail-discount-cell">
                          <span className="retail-discount-money">-{safeMoney(discountMoneyAmount(invoice))}</span>
                          {discountPercentRate(invoice) != null ? <span className="retail-discount-rate">{discountPercentRate(invoice)}%</span> : null}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="number col-center total col-total" title={safeMoney(invoiceTotalValue(invoice))}>
                      {safeMoney(invoiceTotalValue(invoice))}
                    </td>
                    <td className="col-center retail-payment-column col-payment">
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
                    <td className="col-center col-status">
                      <span className={`retail-status ${status.tone}`}>{status.label}</span>
                    </td>
                    <td className="action-cell col-action">
                      <div className="retail-actions">
                        <button
                          className="retail-row-menu-button"
                          type="button"
                          aria-label={`Thao tác hóa đơn ${invoice.code || invoice._id}`}
                          aria-expanded={rowActionOpen === invoice._id}
                          aria-haspopup="menu"
                          onClick={(event) => openRowActionMenu(invoice._id, event)}
                        >
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </button>
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
                  <td className="number col-center" title={safeMoney(pageSummary.gross)}>{safeMoney(pageSummary.gross)}</td>
                  <td className="number col-center" />
                  <td className="number col-center" />
                  <td className="number col-center total" title={safeMoney(pageSummary.totalValue)}>{safeMoney(pageSummary.totalValue)}</td>
                  <td className="number col-center retail-summary-paid" title={safeMoney(pageSummary.paid)}>{safeMoney(pageSummary.paid)}</td>
                  <td className="col-center" />
                  <td className="action-cell" />
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

      {openRowInvoice && rowMenuPos
        ? createPortal(
            <div
              className="retail-row-action-menu retail-row-action-menu--portal"
              role="menu"
              style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
            >
              <button type="button" role="menuitem" onClick={() => void openDetail(openRowInvoice)}>
                <Eye size={15} aria-hidden="true" /> Xem chi tiết
              </button>
              <button type="button" role="menuitem" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(openRowInvoice)}>
                <Printer size={15} aria-hidden="true" /> In hóa đơn
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasGiftItems(openRowInvoice)}
                title={!hasGiftItems(openRowInvoice) ? 'Hóa đơn này không có sản phẩm tặng kèm' : ''}
                onPointerDown={primePrintWindow}
                onClick={() => void handlePrintInvoice(openRowInvoice, true)}
              >
                <Gift size={15} aria-hidden="true" /> In hóa đơn quà tặng
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!refundActionState(openRowInvoice).enabled}
                title={refundActionState(openRowInvoice).title}
                onClick={() => {
                  closeRowMenu();
                  navigate(`/sales-channels/${channel}/refund/create?saleId=${openRowInvoice._id}`);
                }}
              >
                <RotateCcw size={15} aria-hidden="true" /> Đổi trả hàng
              </button>
              {canManageSales ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!editActionState(openRowInvoice).enabled}
                  title={editActionState(openRowInvoice).title}
                  onClick={() => {
                    closeRowMenu();
                    navigate(`/sales-channels/${channel}/retail/create?editId=${openRowInvoice._id}`);
                  }}
                >
                  <FilePenLine size={15} aria-hidden="true" /> Sửa đơn hàng
                </button>
              ) : null}
              {canManageSales ? (
                <button
                  className="danger"
                  type="button"
                  role="menuitem"
                  disabled={!deleteActionState(openRowInvoice).enabled || actionBusyId === openRowInvoice._id}
                  title={deleteActionState(openRowInvoice).title}
                  onClick={() => void handleDeleteInvoice(openRowInvoice)}
                >
                  <Trash2 size={15} aria-hidden="true" /> {actionBusyId === openRowInvoice._id ? 'Đang xử lý...' : 'Xóa hóa đơn'}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

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
            <div><dt>Giảm giá</dt><dd className="discount">{discountMoneyAmount(invoice) > 0 ? (
              <span className="retail-discount-detail">
                <span>-{safeMoney(discountMoneyAmount(invoice))}</span>
                {discountPercentRate(invoice) != null ? <span className="retail-discount-rate">{discountPercentRate(invoice)}%</span> : null}
              </span>
            ) : '—'}</dd></div>
            <div className="grand"><dt>Tổng tiền</dt><dd>{safeMoney(invoiceTotalValue(invoice))}</dd></div>
            <div><dt>Đã thanh toán</dt><dd>{safeMoney(invoicePaidValue(invoice))}</dd></div>
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

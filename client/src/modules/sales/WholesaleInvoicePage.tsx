import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FilePenLine,
  FileSpreadsheet,
  Gift,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Package,
  Percent,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  Trash2,
  UserRound,
  WalletCards,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react';
import { http } from '../../core/api/http';
import { isAdminRole } from '../../core/auth/access';
import { buildInvoiceProfile, getBranch, getStoreSetting } from '../../core/api/branch.api';
import { buildReceiptHtml } from './invoicePrint';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import {
  productLines,
  productName,
  productCode,
  totalQuantity,
  grossValue,
  discountMoneyAmount,
  statusMeta,
  hasGiftItems,
  refundActionState,
  editActionState,
  deleteActionState,
} from './invoiceHelpers';
import './wholesale-invoice-page.css';

type WholesaleInvoicePageProps = {
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
  isDefault?: boolean;
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

type WholesaleTab = 'all' | 'discount' | 'debt';

const PAGE_SIZE = 15;
const PRINT_WINDOW_NAME = 'wholesale-invoice-print';
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

// paymentRows, matchesTab, matchesInvoiceCode are wholesale-specific (kept local).
function paymentRows(invoice: Invoice) {
  const rows = Array.isArray(invoice.typePayment)
    ? invoice.typePayment
        .map((entry: any) => ({
          label:
            entry?.methodId?.name ||
            entry?.methodId?.code ||
            entry?.method?.name ||
            entry?.method?.code ||
            entry?.methodName ||
            (typeof entry?.methodId === 'string' && entry.methodId ? 'Thanh toán' : null) ||
            invoice.paymentMethod ||
            'Thanh toán',
          amount: Number(entry?.amount),
        }))
        .filter((entry: any) => Number.isFinite(entry.amount) && entry.amount > 0)
    : [];
  if (rows.length > 0) return rows;
  const paid = Number(invoice.valuePayment);
  if (Number.isFinite(paid) && paid > 0) {
    return [{ label: invoice.paymentMethod || 'Đã thanh toán', amount: paid }];
  }
  return [];
}

function matchesTab(invoice: Invoice, tab: WholesaleTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'discount') return Number(invoice.discountValue) > 0;
  if (tab === 'debt') {
    const status = String(invoice.status || '').toLowerCase();
    if (status === 'cancelled') return false;
    return Number(invoice.value || 0) - Number(invoice.valuePayment || 0) > 0;
  }
  return true;
}

function matchesInvoiceCode(invoice: Invoice, keyword: string): boolean {
  return String(invoice.code || '').toLowerCase().includes(keyword.toLowerCase());
}

const TAB_LIST: { key: WholesaleTab; label: string; icon: typeof FileSpreadsheet }[] = [
  { key: 'all', label: 'Hóa đơn bán sỉ', icon: FileSpreadsheet },
  { key: 'discount', label: 'Có chiết khấu', icon: Percent },
  { key: 'debt', label: 'Có công nợ', icon: WalletCards },
];

export function WholesaleInvoicePage({ channel }: WholesaleInvoicePageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: WholesaleTab =
    searchParams.get('tab') === 'discount'
      ? 'discount'
      : searchParams.get('tab') === 'debt'
        ? 'debt'
        : 'all';

  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const createInvoiceBtnRef = useRef<HTMLButtonElement | null>(null);
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
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canManageSales = isAdminRole(currentUser?.role);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState('');
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');

  const handleTabChange = (tab: WholesaleTab) => {
    setPage(1);
    setSearchParams(tab === 'all' ? {} : { tab }, { replace: true });
  };

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
      const items: Branch[] = Array.isArray(response.data) ? response.data : response.data.items ?? [];
      setBranches(items);
      if (items.length === 0) {
        setBranchError('Chưa có cửa hàng/kho hàng để tạo hóa đơn.');
      } else {
        setSelectedBranchId((current) => {
          if (current) return current;
          const def = items.find((branch) => branch.isDefault);
          return (def || items[0])._id;
        });
      }
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
      const qs = new URLSearchParams();
      qs.set('type', 'wholesale');
      qs.set('page', '1');
      qs.set('limit', '500');
      if (channel) qs.set('channel', channel);
      if (appliedFilters.storeId) qs.set('storeId', appliedFilters.storeId);
      if (appliedFilters.dateFrom) qs.set('dateFrom', appliedFilters.dateFrom);
      if (appliedFilters.dateTo) qs.set('dateTo', appliedFilters.dateTo);
      if (appliedFilters.customerKeyword) qs.set('customerKeyword', appliedFilters.customerKeyword);
      if (appliedFilters.productKeyword) qs.set('productKeyword', appliedFilters.productKeyword);
      const response = await http.get(`/products/sales?${qs.toString()}`, { signal });
      const items = Array.isArray(response.data) ? response.data : response.data.items ?? [];
      setInvoices(items);
      setTotal(Array.isArray(response.data) ? items.length : Number(response.data.total ?? items.length));
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err.code === 'ERR_CANCELED') return;
      setInvoices([]);
      setTotal(0);
      setError(err.response?.data?.message || 'Không tải được dữ liệu hóa đơn bán sỉ.');
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
    if (!rowActionOpen && !showToolsDropdown) return;
    const closeMenus = () => {
      setRowActionOpen(null);
      setRowMenuPos(null);
      setShowToolsDropdown(false);
    };
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest('.ws-row-action-menu')) return;
        if (target.closest('.ws-row-menu-button')) return;
        if (toolsMenuRef.current?.contains(target)) return;
      }
      closeMenus();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };
    const closeOnViewport = () => {
      setRowActionOpen(null);
      setRowMenuPos(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewport);
    document.addEventListener('scroll', closeOnViewport, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewport);
      document.removeEventListener('scroll', closeOnViewport, true);
    };
  }, [rowActionOpen, showToolsDropdown]);

  const branchName = useMemo(
    () => branches.find((branch) => branch._id === draftFilters.storeId)?.name,
    [branches, draftFilters.storeId],
  );

  const visibleInvoices = useMemo(() => {
    let rows = invoices;
    if (activeTab !== 'all') rows = rows.filter((invoice) => matchesTab(invoice, activeTab));
    const codeKeyword = appliedFilters.invoiceCode.trim();
    if (codeKeyword) rows = rows.filter((invoice) => matchesInvoiceCode(invoice, codeKeyword));
    return rows;
  }, [invoices, activeTab, appliedFilters.invoiceCode]);

  // Client-side paged view of the (tab + code) filtered results.
  // Ensures tabs work correctly with filters + pagination even when matching records span server pages.
  const pagedInvoices = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleInvoices.slice(start, start + PAGE_SIZE);
  }, [visibleInvoices, page]);

  // Pager and range now based on client filtered (tab+code) for correct behavior across tabs.
  const filteredTotal = visibleInvoices.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const rangeStart = filteredTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredTotal);

  const selectedAll = pagedInvoices.length > 0 && pagedInvoices.every((invoice) => selectedIds.has(invoice._id));

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

  const closeBranchModal = (restoreFocus = false) => {
    setShowBranchModal(false);
    if (restoreFocus) {
      window.setTimeout(() => createInvoiceBtnRef.current?.focus(), 0);
    }
  };

  const openBranchPicker = async () => {
    setShowBranchModal(true);
    if (branches.length === 0 && !branchLoading) await loadBranches();
  };

  const continueCreate = () => {
    if (!selectedBranchId) return;
    setShowBranchModal(false);
    navigate(`/sales-channels/${channel}/wholesale/create?branchId=${selectedBranchId}`);
  };

  // Escape closes branch modal only while open (listener cleaned on close/unmount)
  useEffect(() => {
    if (!showBranchModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeBranchModal(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showBranchModal]);

  const hasActiveFilters = Boolean(
    appliedFilters.invoiceCode.trim() ||
      appliedFilters.storeId ||
      appliedFilters.dateFrom ||
      appliedFilters.dateTo ||
      appliedFilters.customerKeyword.trim() ||
      appliedFilters.productKeyword.trim(),
  );

  const currentTabLabel = TAB_LIST.find((tab) => tab.key === activeTab)?.label ?? 'Hóa đơn bán sỉ';

  const openRowActionMenu = (invoiceId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (rowActionOpen === invoiceId) {
      setRowActionOpen(null);
      setRowMenuPos(null);
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

  const openDetail = async (invoice: Invoice) => {
    setRowActionOpen(null);
    setRowMenuPos(null);
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
    const totalAmount = Number(invoice.value || 0);
    const tendered = Number(invoice.tenderedValue ?? paid);
    const hasDistinctTendered = Number.isFinite(tendered) && tendered > 0 && Math.abs(tendered - paid) > 1;
    const change = hasDistinctTendered ? Math.max(tendered - totalAmount, 0) : 0;
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
        ...(invoice.hasVat && Number(invoice.vatAmount) > 0
          ? [{ label: `VAT${Number(invoice.vatPercent) > 0 ? ` (${Number(invoice.vatPercent)}%)` : ''}`, value: safeMoney(invoice.vatAmount) }]
          : []),
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
    setRowMenuPos(null);

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
      setRowMenuPos(null);
      if (detail?._id === invoice._id) setDetail(null);
      await loadInvoices();
    } catch (err: any) {
      window.alert(err.response?.data?.message || 'Không thể xóa hoặc hủy hóa đơn.');
    } finally {
      setActionBusyId((current) => (current === invoice._id ? '' : current));
    }
  };

  const openRowInvoice = rowActionOpen
    ? pagedInvoices.find((invoice) => invoice._id === rowActionOpen) ??
      invoices.find((invoice) => invoice._id === rowActionOpen) ??
      null
    : null;

  const exportCsv = () => {
    const fields: { label: string; get: (invoice: Invoice) => string }[] = [
      { label: 'Ngày', get: (invoice) => safeDate(invoice.createdAt) },
      { label: 'Mã hóa đơn', get: (invoice) => String(invoice.code || '') },
      { label: 'Khách hàng', get: (invoice) => String(invoice.customerId?.name || 'Khách lẻ') },
      { label: 'Số lượng SP', get: (invoice) => String(totalQuantity(invoice)) },
      { label: 'Giá trị hàng hóa', get: (invoice) => String(grossValue(invoice)) },
      { label: 'Giảm giá', get: (invoice) => String(discountMoneyAmount(invoice)) },
      { label: '% chiết khấu', get: (invoice) => String(invoice.discountType === 'percent' ? Number(invoice.discountValue) || 0 : 0) },
      { label: 'Tổng tiền', get: (invoice) => String(Number(invoice.value) || 0) },
      { label: 'Đã thanh toán', get: (invoice) => String(Number(invoice.valuePayment) || 0) },
      { label: 'Trạng thái', get: (invoice) => statusMeta(invoice.status, invoice.refundStatus).label },
    ];
    const csv = [
      fields.map((field) => `"${field.label.replace(/"/g, '""')}"`).join(','),
      ...visibleInvoices.map((invoice) => fields.map((field) => `"${String(field.get(invoice) ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hoa-don-ban-si.csv';
    link.click();
    URL.revokeObjectURL(url);
    setShowToolsDropdown(false);
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(pagedInvoices.map((invoice) => invoice._id)) : new Set());
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
        dataToExport = visibleInvoices;
      } else {
        const fetchPage = (nextPage: number, nextLimit: number) => {
          const qs = new URLSearchParams();
          qs.set('type', 'wholesale');
          qs.set('page', String(nextPage));
          qs.set('limit', String(nextLimit));
          if (channel) qs.set('channel', channel);
          if (appliedFilters.storeId) qs.set('storeId', appliedFilters.storeId);
          if (appliedFilters.dateFrom) qs.set('dateFrom', appliedFilters.dateFrom);
          if (appliedFilters.dateTo) qs.set('dateTo', appliedFilters.dateTo);
          if (appliedFilters.customerKeyword) qs.set('customerKeyword', appliedFilters.customerKeyword);
          if (appliedFilters.productKeyword) qs.set('productKeyword', appliedFilters.productKeyword);
          return http.get(`/products/sales?${qs.toString()}`);
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
        const codeKeyword = appliedFilters.invoiceCode.trim();
        dataToExport = allItems.filter((inv) => matchesTab(inv, activeTab) && matchesInvoiceCode(inv, codeKeyword));
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
    <div className="ws-invoice-page page-stack">
      <section className="data-card ws-toolbar-card ws-sticky-toolbar">
        <div className="ws-toolbar-header-slot">
          <div className="ws-compact-head">
            <h1 className="ws-compact-heading-sr">Hóa đơn bán sỉ</h1>
            <div className="ws-tabs-row ws-tabs-row--title-slot">
              <div className="ws-tabbar is-compact" role="tablist" aria-label="Bán sỉ tabs">
                {TAB_LIST.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`ws-tab is-compact ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleTabChange(tab.key)}
                    >
                      <Icon size={14} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="ws-summary-strip" aria-label="Tóm tắt Bán sỉ">
          <div className="ws-summary-cluster">
            <span className="ws-summary-main">
              <strong>{filteredTotal.toLocaleString('vi-VN')}</strong>
              <span>hóa đơn</span>
            </span>
            {selectedIds.size > 0 ? (
              <>
                <span className="ws-summary-divider" aria-hidden="true" />
                <span>{selectedIds.size.toLocaleString('vi-VN')} đã chọn</span>
              </>
            ) : null}
            {hasActiveFilters ? (
              <>
                <span className="ws-summary-divider" aria-hidden="true" />
                <span className="ws-summary-filter">Đang lọc</span>
              </>
            ) : null}
            {activeTab !== 'all' ? (
              <>
                <span className="ws-summary-divider" aria-hidden="true" />
                <span>{currentTabLabel}</span>
              </>
            ) : null}
          </div>
        </div>

        <form className="ws-filter-bar" onSubmit={applyFilters}>
          <div className="ws-search">
            <Search size={15} />
            <input
              value={draftFilters.invoiceCode}
              onChange={(event) => setDraftFilters((current) => ({ ...current, invoiceCode: event.target.value }))}
              placeholder="Mã hóa đơn sỉ..."
              aria-label="Mã hóa đơn"
            />
          </div>

          <select
            className="ws-filter-select"
            value={draftFilters.storeId}
            onChange={(event) => setDraftFilters((current) => ({ ...current, storeId: event.target.value }))}
            aria-label="Cửa hàng"
            title="Cửa hàng"
          >
            <option value="">Tất cả cửa hàng</option>
            {branches.map((branch) => (
              <option key={branch._id} value={branch._id}>{branch.name || branch.code || branch._id}</option>
            ))}
          </select>

          <input
            className="ws-filter-select"
            type="date"
            value={draftFilters.dateFrom}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            aria-label="Từ ngày"
            title="Từ ngày"
          />

          <input
            className="ws-filter-select"
            type="date"
            value={draftFilters.dateTo}
            min={draftFilters.dateFrom || undefined}
            onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
            aria-label="Đến ngày"
            title="Đến ngày"
          />

          <input
            className="ws-filter-input"
            value={draftFilters.customerKeyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, customerKeyword: event.target.value }))}
            placeholder="Khách hàng..."
            aria-label="Khách hàng"
          />

          <input
            className="ws-filter-input"
            value={draftFilters.productKeyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, productKeyword: event.target.value }))}
            placeholder="Sản phẩm..."
            aria-label="Sản phẩm"
          />

          <div className="ws-filter-actions">
            <button className="ws-btn ws-btn-primary" type="submit">
              <Search size={14} /> Lọc
            </button>
            <button className="ws-btn ws-btn-secondary" type="button" onClick={resetFilters} title="Đặt lại bộ lọc và làm mới">
              <RefreshCw size={14} /> Làm mới
            </button>
            <button
              ref={createInvoiceBtnRef}
              className="ws-btn ws-btn-success"
              type="button"
              onClick={() => void openBranchPicker()}
            >
              <Plus size={14} /> Tạo hóa đơn sỉ
            </button>
            <div className="ws-floating-menu ws-bulk-menu" ref={showToolsDropdown ? toolsMenuRef : null}>
              <button
                className="ws-btn ws-btn-secondary"
                type="button"
                aria-haspopup="menu"
                aria-expanded={showToolsDropdown}
                onClick={() => setShowToolsDropdown((current) => !current)}
              >
                <Wrench size={14} /> Công cụ
              </button>
              {showToolsDropdown ? (
                <div className="ws-floating-dropdown" role="menu" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="ws-dropdown-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowToolsDropdown(false);
                      setShowExportModal(true);
                    }}
                  >
                    <FileDown size={15} /> Xuất dữ liệu
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </form>
      </section>

      {error ? (
        <div className="ws-alert" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Không tải được dữ liệu</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => void loadInvoices()}>Thử lại</button>
        </div>
      ) : null}

      <section className="data-card ws-table-card" aria-label="Danh sách hóa đơn bán sỉ">
        <div className="data-card-header ws-table-header">
          <div>
            <h2 className="ws-table-title">Bảng dữ liệu Bán sỉ</h2>
            <p className="ws-table-subtitle">
              {filteredTotal.toLocaleString('vi-VN')} bản ghi
              {branchName && appliedFilters.storeId === draftFilters.storeId ? ` · ${branchName}` : ''}
              {' · '}
              {currentTabLabel}
              {' · '}
              Hiển thị {rangeStart.toLocaleString('vi-VN')}–{rangeEnd.toLocaleString('vi-VN')}
            </p>
          </div>
          {selectedIds.size > 0 ? (
            <span className="ws-selected-count">{selectedIds.size.toLocaleString('vi-VN')} đã chọn</span>
          ) : null}
        </div>

        <div className="table-scroll ws-table-scroll">
          <table className="data-table ws-data-table">
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    checked={selectedAll}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="Chọn tất cả"
                  />
                </th>
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
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 7 }).map((_, index) => (
                    <tr className="ws-skeleton" key={index}>
                      {Array.from({ length: 12 }).map((__, cellIndex) => (
                        <td key={cellIndex} className={cellIndex === 11 ? 'action-cell' : undefined}>
                          <span />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}

              {!loading && !error && invoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="ws-empty-cell">
                    <div className="ws-empty-state">
                      <Package size={28} />
                      <strong>Chưa có dữ liệu</strong>
                      <span>Thử đổi bộ lọc hoặc tạo hóa đơn bán sỉ mới.</span>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading && !error && invoices.length > 0 && visibleInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="ws-empty-cell">
                    <div className="ws-empty-state">
                      <Package size={28} />
                      <strong>Không có hóa đơn phù hợp</strong>
                      <span>Thử đổi tab hoặc bộ lọc, hoặc sang trang khác.</span>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading && !error
                ? pagedInvoices.map((invoice) => {
                    const items = productLines(invoice);
                    const firstItem = items[0];
                    const customer = invoice.customerId;
                    const creator = invoice.authorId?.name || invoice.userId?.name;
                    const payments = paymentRows(invoice);
                    const status = statusMeta(invoice.status, invoice.refundStatus);
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
                        <td className="ws-name-cell">
                          <div className="ws-name-main" title={creator || '—'}>{creator || '—'}</div>
                          <div className="ws-name-sub">{safeDate(invoice.createdAt)}</div>
                        </td>
                        <td>
                          <button
                            className="ws-invoice-link"
                            type="button"
                            title={invoice.code || '—'}
                            onClick={() => void openDetail(invoice)}
                          >
                            {invoice.code || '—'}
                          </button>
                        </td>
                        <td className="ws-name-cell">
                          <div className="ws-name-main" title={customer?.name || 'Khách lẻ'}>
                            {customer?.name || 'Khách lẻ'}
                          </div>
                          <div className="ws-name-sub">{customer?.phone || '—'}</div>
                        </td>
                        <td>
                          {firstItem ? (
                            <div className="ws-product-cell">
                              <strong title={productName(firstItem)}>{productName(firstItem)}</strong>
                              <span>{productCode(firstItem) || '—'}</span>
                              {items.length > 1 ? <em>+{items.length - 1} sản phẩm khác</em> : null}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="number" title={items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}>
                          {items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}
                        </td>
                        <td className="number" title={items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}>
                          {items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td
                          className="number discount"
                          title={
                            Number(invoice.discountValue) > 0
                              ? `-${safeMoney(discountMoneyAmount(invoice))}${invoice.discountType === 'percent' ? ` (${Number(invoice.discountValue)}%)` : ''}`
                              : '—'
                          }
                        >
                          {Number(invoice.discountValue) > 0 ? (
                            <span className="ws-discount-cell">
                              <span className="ws-discount-money">-{safeMoney(discountMoneyAmount(invoice))}</span>
                              {invoice.discountType === 'percent' ? (
                                <span className="ws-discount-rate">{Number(invoice.discountValue)}%</span>
                              ) : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="number total" title={safeMoney(invoice.value)}>
                          {safeMoney(invoice.value)}
                        </td>
                        <td className="ws-payment-column">
                          {payments.length > 0 ? (
                            <div className="ws-payments">
                              {payments.map((payment, index) => (
                                <span className="ws-payment-item" key={`${payment.label}-${index}`}>
                                  <strong className="ws-payment-amount" title={safeMoney(payment.amount)}>
                                    {safeMoney(payment.amount)}
                                  </strong>
                                  <small className="ws-payment-method" title={payment.label}>
                                    {payment.label}
                                  </small>
                                </span>
                              ))}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={`ws-status-badge ${status.tone}`}>{status.label}</span>
                        </td>
                        <td className="action-cell">
                          <div className="ws-actions">
                            <button
                              className="ws-row-menu-button"
                              type="button"
                              title="Thao tác"
                              aria-label={`Thao tác hóa đơn ${invoice.code || invoice._id}`}
                              aria-expanded={rowActionOpen === invoice._id}
                              aria-haspopup="menu"
                              onClick={(event) => openRowActionMenu(invoice._id, event)}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>

        <div className="ws-pagination">
          <span>
            Hiển thị {rangeStart.toLocaleString('vi-VN')} - {rangeEnd.toLocaleString('vi-VN')} /{' '}
            {filteredTotal.toLocaleString('vi-VN')}
          </span>
          <div>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <strong>
              Trang {page} / {totalPages}
            </strong>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {openRowInvoice && rowMenuPos
        ? createPortal(
            <div
              className="ws-row-action-menu ws-row-action-menu--portal"
              role="menu"
              style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
            >
              <button type="button" role="menuitem" onClick={() => void openDetail(openRowInvoice)}>
                <Eye size={15} /> Xem chi tiết
              </button>
              <button
                type="button"
                role="menuitem"
                onPointerDown={primePrintWindow}
                onClick={() => void handlePrintInvoice(openRowInvoice)}
              >
                <Printer size={15} /> In hóa đơn
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasGiftItems(openRowInvoice)}
                title={!hasGiftItems(openRowInvoice) ? 'Hóa đơn này không có sản phẩm tặng kèm' : ''}
                onPointerDown={primePrintWindow}
                onClick={() => void handlePrintInvoice(openRowInvoice, true)}
              >
                <Gift size={15} /> In hóa đơn quà tặng
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!refundActionState(openRowInvoice).enabled}
                title={refundActionState(openRowInvoice).title}
                onClick={() => {
                  setRowActionOpen(null);
                  setRowMenuPos(null);
                  navigate(`/sales-channels/${channel}/refund/create?saleId=${openRowInvoice._id}`);
                }}
              >
                <RotateCcw size={15} /> Đổi trả hàng
              </button>
              {canManageSales ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!editActionState(openRowInvoice).enabled}
                  title={editActionState(openRowInvoice).title}
                  onClick={() => {
                    setRowActionOpen(null);
                    setRowMenuPos(null);
                    navigate(`/sales-channels/${channel}/wholesale/create?editId=${openRowInvoice._id}`);
                  }}
                >
                  <FilePenLine size={15} /> Sửa đơn hàng
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
                  <Trash2 size={15} />{' '}
                  {actionBusyId === openRowInvoice._id ? 'Đang xử lý...' : 'Xóa hóa đơn'}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {showBranchModal && (
        <div className="ws-modal-backdrop" role="presentation" onClick={() => closeBranchModal(true)}>
          <div className="ws-modal branch-modal" role="dialog" aria-modal="true" aria-labelledby="ws-branch-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><Warehouse size={20} /><h2 id="ws-branch-title">Chọn Kho / Chi Nhánh Bán Sỉ</h2></div>
              <button type="button" onClick={() => closeBranchModal(true)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <div className="ws-modal-body">
              {branchLoading ? (
                <div className="ws-modal-state"><LoaderCircle className="spin" size={24} /> Đang tải kho hàng...</div>
              ) : branchError ? (
                <div className="ws-modal-error"><AlertCircle size={18} /> {branchError}<button type="button" onClick={() => void loadBranches()}>Thử lại</button></div>
              ) : (
                <div className="ws-branch-list">
                  {branches.map((branch) => {
                    const active = selectedBranchId === branch._id;
                    return (
                      <button className={active ? 'active' : ''} type="button" key={branch._id} onClick={() => setSelectedBranchId(branch._id)}>
                        <span className="ws-branch-check">{active && <Check size={16} />}</span>
                        <span className="ws-branch-info">
                          <strong>{branch.name || branch.code || branch._id}{branch.code ? ` · ${branch.code}` : ''}</strong>
                          <small>
                            {branch.address && <em><MapPin size={12} /> {branch.address}</em>}
                            {branch.phone && <em><Phone size={12} /> {branch.phone}</em>}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <footer>
              <button className="ws-btn ghost" type="button" onClick={() => closeBranchModal(true)}>Hủy</button>
              <button className="ws-btn success" type="button" disabled={!selectedBranchId || branchLoading} onClick={continueCreate}>Tiếp tục</button>
            </footer>
          </div>
        </div>
      )}

      {detail && (
        <div className="ws-modal-backdrop" role="presentation" onClick={() => setDetail(null)}>
          <div className="ws-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="ws-detail-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><Eye size={20} /><h2 id="ws-detail-title">{detail.code || 'Chi tiết hóa đơn'}</h2></div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <div className="ws-modal-body">
              {detailLoading ? (
                <div className="ws-modal-state"><LoaderCircle className="spin" size={24} /> Đang tải chi tiết hóa đơn...</div>
              ) : detailError ? (
                <div className="ws-modal-error"><AlertCircle size={18} /> {detailError}</div>
              ) : (
                <InvoiceDetail invoice={detail} />
              )}
            </div>
            <footer>
              <button className="ws-btn ghost" type="button" onClick={() => setDetail(null)}>Đóng</button>
              <button className="ws-btn primary" type="button" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(detail)}><Printer size={15} /> In hóa đơn</button>
              {hasGiftItems(detail) && <button className="ws-btn ghost" type="button" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(detail, true)}><Gift size={15} /> In hóa đơn quà tặng</button>}
              <button className="ws-btn primary" type="button" disabled={!refundActionState(detail).enabled} title={refundActionState(detail).title} onClick={() => navigate(`/sales-channels/${channel}/refund/create?saleId=${detail._id}`)}><RotateCcw size={15} /> Đổi trả hàng</button>
              {canManageSales ? (<button className="ws-btn ghost" type="button" disabled={!editActionState(detail).enabled} title={editActionState(detail).title} onClick={() => navigate(`/sales-channels/${channel}/wholesale/create?editId=${detail._id}`)}><FilePenLine size={15} /> Sửa đơn hàng</button>) : null}
            </footer>
          </div>
        </div>
      )}
      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Hóa đơn bán sỉ"
          defaultFilename={`hoa-don-ban-si-${new Date().toISOString().slice(0, 10)}`}
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
    <div className="ws-detail-grid">
      <div className="ws-detail-main">
        <section className="ws-detail-card">
          <h3>Khách hàng</h3>
          <div className="ws-info-grid">
            <span><small>Tên khách hàng</small><strong>{customer?.name || 'Khách lẻ'}</strong></span>
            <span><small>Số điện thoại</small><strong>{customer?.phone || '—'}</strong></span>
            <span><small>Mã khách hàng</small><strong>{customer?.code || '—'}</strong></span>
            <span><small>Trạng thái</small><strong><em className={`ws-status ${status.tone}`}>{status.label}</em></strong></span>
          </div>
        </section>

        <section className="ws-detail-card">
          <h3>Sản phẩm ({items.length})</h3>
          <div className="ws-detail-table">
            <table>
              <thead><tr><th>#</th><th>Sản phẩm</th><th className="number">SL</th><th className="number">Giá bán</th><th className="number">Thành tiền</th></tr></thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item._id || `${productCode(item)}-${index}`}>
                    <td>{index + 1}</td>
                    <td><div className="ws-stack"><strong>{productName(item)}</strong><span>{productCode(item) || '—'}</span></div></td>
                    <td className="number">{(Number(item.amount) || 0).toLocaleString('vi-VN')}</td>
                    <td className="number">{safeMoney(item.value)}</td>
                    <td className="number total">{safeMoney((Number(item.value) || 0) * (Number(item.amount) || 0))}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} className="ws-detail-empty">Không có dòng sản phẩm.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {invoice.note && <section className="ws-detail-card"><h3>Ghi chú</h3><p className="ws-note">{invoice.note}</p></section>}
      </div>

      <aside className="ws-detail-side">
        <section className="ws-detail-card">
          <h3>Thanh toán</h3>
          <dl className="ws-money-summary">
            <div><dt>Giá trị hàng hóa</dt><dd>{items.length ? safeMoney(grossValue(invoice)) : '—'}</dd></div>
            <div><dt>Giảm giá</dt><dd className="discount">{Number(invoice.discountValue) > 0 ? (
              <span className="ws-discount-detail">
                <span>-{safeMoney(discountMoneyAmount(invoice))}</span>
                {invoice.discountType === 'percent' ? <span className="ws-discount-rate">{Number(invoice.discountValue)}%</span> : null}
              </span>
            ) : '—'}</dd></div>
            {invoice.hasVat && Number(invoice.vatAmount) > 0 ? (
              <>
                {Number.isFinite(Number(invoice.subtotalBeforeVat ?? invoice.subtotalAfterProductDiscount)) ? (
                  <div>
                    <dt>Trước VAT</dt>
                    <dd>{safeMoney(invoice.subtotalBeforeVat ?? invoice.subtotalAfterProductDiscount)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>VAT{Number(invoice.vatPercent) > 0 ? ` (${Number(invoice.vatPercent)}%)` : ''}</dt>
                  <dd>{safeMoney(invoice.vatAmount)}</dd>
                </div>
              </>
            ) : null}
            <div className="grand"><dt>Tổng tiền</dt><dd>{safeMoney(invoice.value)}</dd></div>
            <div><dt>Đã thanh toán</dt><dd>{safeMoney(invoice.valuePayment)}</dd></div>
            {Number(invoice.prepaidFromOrder) > 0 ? (
              <div><dt>Đã TT từ đơn hàng</dt><dd>{safeMoney(invoice.prepaidFromOrder)}</dd></div>
            ) : null}
          </dl>
          {payments.length > 0 && (
            <div className="ws-payment-breakdown">
              {payments.map((payment, index) => <span key={`${payment.label}-${index}`}><small>{payment.label}</small><strong>{safeMoney(payment.amount)}</strong></span>)}
            </div>
          )}
        </section>

        <section className="ws-detail-card">
          <h3>Thông tin hóa đơn</h3>
          <div className="ws-detail-info">
            <span><Store size={15} /><div><small>Cửa hàng / Kho</small><strong>{branch?.name || branch?.code || '—'}</strong></div></span>
            <span><UserRound size={15} /><div><small>Người tạo</small><strong>{invoice.authorId?.name || invoice.userId?.name || '—'}</strong></div></span>
            <span><CalendarDays size={15} /><div><small>Ngày tạo</small><strong>{safeDate(invoice.createdAt)}</strong></div></span>
          </div>
        </section>
      </aside>
    </div>
  );
}

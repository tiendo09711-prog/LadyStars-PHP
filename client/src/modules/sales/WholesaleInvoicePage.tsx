import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  ShoppingBag,
  Store,
  Trash2,
  UserRound,
  WalletCards,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react';
import { http } from '../../core/api/http';
import { buildInvoiceProfile, getBranch, getStoreSetting } from '../../core/api/branch.api';
import { buildReceiptHtml } from './invoicePrint';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';

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

  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
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
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState('');
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionBusyId, setActionBusyId] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    document.title = activeTab === 'debt'
      ? 'Hóa đơn bán sỉ - Có công nợ'
      : activeTab === 'discount'
        ? 'Hóa đơn bán sỉ - Có chiết khấu'
        : 'Hóa đơn bán sỉ';
  }, [activeTab]);

  const handleTabChange = (tab: WholesaleTab) => {
    setSearchParams(tab === 'all' ? {} : { tab }, { replace: true });
  };

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
      qs.set('code', 'BHS');
      qs.set('page', String(page));
      qs.set('limit', String(PAGE_SIZE));
      if (appliedFilters.storeId) qs.set('storeId', appliedFilters.storeId);
      if (appliedFilters.dateFrom) qs.set('dateFrom', appliedFilters.dateFrom);
      if (appliedFilters.dateTo) qs.set('dateTo', appliedFilters.dateTo);
      if (appliedFilters.customerKeyword) qs.set('customerKeyword', appliedFilters.customerKeyword);
      if (appliedFilters.productKeyword) qs.set('productKeyword', appliedFilters.productKeyword);
      // invoiceCode được lọc phía client để giữ nguyên phạm vi "code=BHS" của bán sỉ.
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
  }, [appliedFilters, channel, page, activeTab]);

  useEffect(() => {
    if (!rowActionOpen && !showToolsDropdown) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element) {
        if (rowMenuRef.current?.contains(target)) return;
        if (toolsMenuRef.current?.contains(target)) return;
      }
      setRowActionOpen(null);
      setShowToolsDropdown(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRowActionOpen(null);
        setShowToolsDropdown(false);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
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

  const selectedAll = visibleInvoices.length > 0 && visibleInvoices.every((invoice) => selectedIds.has(invoice._id));

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
    setShowBranchModal(false);
    navigate(`/sales-channels/${channel}/wholesale/create?branchId=${selectedBranchId}`);
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
    setSelectedIds(checked ? new Set(visibleInvoices.map((invoice) => invoice._id)) : new Set());
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
          qs.set('code', 'BHS');
          qs.set('page', String(nextPage));
          qs.set('limit', String(nextLimit));
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
    <div className="ws-invoice-page">
      <style>{wholesaleStyles}</style>

      <header className="ws-hero">
        <div className="ws-hero-text">
          <span className="ws-eyebrow">Kênh bán - Cửa hàng</span>
          <h1>Hóa đơn bán sỉ</h1>
          <p>Tra cứu, lọc và quản lý hóa đơn bán sỉ của cửa hàng</p>
        </div>
        <div className="ws-hero-icon"><ShoppingBag size={26} /></div>
      </header>

      <div className="ws-tabbar" role="tablist" aria-label="Wholesale invoice tabs">
        {TAB_LIST.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ws-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ws-body">
        <aside className="ws-sidebar">
          <form className="ws-filter-panel" onSubmit={applyFilters}>
            <h3 className="ws-filter-title"><Search size={16} /> Bộ lọc</h3>

            <label className="ws-filter-field">
              <Search size={14} />
              <input
                value={draftFilters.invoiceCode}
                onChange={(event) => setDraftFilters((current) => ({ ...current, invoiceCode: event.target.value }))}
                placeholder="Mã hóa đơn sỉ"
                aria-label="Mã hóa đơn"
              />
            </label>

            <select
              className="ws-filter-select"
              value={draftFilters.storeId}
              onChange={(event) => setDraftFilters((current) => ({ ...current, storeId: event.target.value }))}
              aria-label="Cửa hàng"
            >
              <option value="">Tất cả cửa hàng</option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>{branch.name || branch.code || branch._id}</option>
              ))}
            </select>

            <label className="ws-filter-field ws-date-field">
              <span>Từ ngày</span>
              <input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                aria-label="Từ ngày"
              />
            </label>

            <label className="ws-filter-field ws-date-field">
              <span>Đến ngày</span>
              <input
                type="date"
                value={draftFilters.dateTo}
                min={draftFilters.dateFrom || undefined}
                onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
                aria-label="Đến ngày"
              />
            </label>

            <label className="ws-filter-field">
              <UserRound size={14} />
              <input
                value={draftFilters.customerKeyword}
                onChange={(event) => setDraftFilters((current) => ({ ...current, customerKeyword: event.target.value }))}
                placeholder="Tên hoặc số điện thoại"
                aria-label="Khách hàng"
              />
            </label>

            <label className="ws-filter-field">
              <Package size={14} />
              <input
                value={draftFilters.productKeyword}
                onChange={(event) => setDraftFilters((current) => ({ ...current, productKeyword: event.target.value }))}
                placeholder="Mã hoặc tên sản phẩm"
                aria-label="Sản phẩm"
              />
            </label>

            <div className="ws-filter-actions">
              <button className="ws-filter-button" type="submit"><Search size={15} /> Lọc</button>
              <button className="ws-reset-button" type="button" onClick={resetFilters}>Đặt lại</button>
            </div>
          </form>
        </aside>

        <div className="ws-main">
          <div className="ws-actionbar">
            <div className="ws-actionbar-left">
              <button className="ws-btn success" type="button" onClick={() => void openBranchPicker()}>
                <Plus size={16} /> Tạo hóa đơn sỉ
              </button>
              {selectedIds.size > 0 && <span className="ws-selected">{selectedIds.size} hóa đơn đã chọn</span>}
            </div>
            <div className="ws-actionbar-right">
              {branchName && appliedFilters.storeId === draftFilters.storeId && (
                <span className="ws-filter-chip"><Store size={13} /> {branchName}</span>
              )}
              {activeTab === 'all' ? (
                <span>Hiển thị {rangeStart.toLocaleString('vi-VN')} - {rangeEnd.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')}</span>
              ) : (
                <span>{visibleInvoices.length.toLocaleString('vi-VN')} phù hợp · {total.toLocaleString('vi-VN')} hóa đơn sỉ</span>
              )}
              <div className="ws-tools" ref={showToolsDropdown ? toolsMenuRef : null}>
                <button
                  className="ws-icon-btn ws-tools-btn"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={showToolsDropdown}
                  onClick={() => setShowToolsDropdown((current) => !current)}
                >
                  <Wrench size={15} /> Công cụ
                </button>
                {showToolsDropdown && (
                  <div className="ws-menu ws-tools-menu" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => { setShowToolsDropdown(false); setShowExportModal(true); }}><FileDown size={15} /> Xuất dữ liệu</button>
                  </div>
                )}
              </div>
              <button
                className="ws-icon-btn"
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
            <div className="ws-alert" role="alert">
              <AlertCircle size={18} />
              <div><strong>Không tải được dữ liệu</strong><span>{error}</span></div>
              <button type="button" onClick={() => void loadInvoices()}>Thử lại</button>
            </div>
          )}

          <section className="ws-table-card" aria-label="Danh sách hóa đơn bán sỉ">
            <div className="ws-table-scroll">
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
                    <tr className="ws-skeleton" key={index}>
                      {Array.from({ length: 12 }).map((__, cellIndex) => <td key={cellIndex}><span /></td>)}
                    </tr>
                  ))}

                  {!loading && !error && invoices.length === 0 && (
                    <tr>
                      <td colSpan={12}>
                        <div className="ws-empty">
                          <Package size={30} />
                          <strong>Chưa có dữ liệu phù hợp</strong>
                          <span>Hãy thay đổi bộ lọc hoặc tạo hóa đơn bán sỉ mới.</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && !error && invoices.length > 0 && visibleInvoices.length === 0 && (
                    <tr>
                      <td colSpan={12}>
                        <div className="ws-empty">
                          <Package size={30} />
                          <strong>Không có hóa đơn phù hợp</strong>
                          <span>Thử đổi tab hoặc bộ lọc, hoặc sang trang khác.</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && !error && visibleInvoices.map((invoice) => {
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
                          <div className="ws-stack">
                            <strong title={`${creator || '—'} · ${safeDate(invoice.createdAt)}`}>{creator || '—'}</strong>
                            <span>{safeDate(invoice.createdAt)}</span>
                          </div>
                        </td>
                        <td>
                          <button className="ws-invoice-link" type="button" title={invoice.code || '—'} onClick={() => void openDetail(invoice)}>
                            {invoice.code || '—'}
                          </button>
                        </td>
                        <td>
                          <div className="ws-stack">
                            <strong title={`${customer?.name || 'Khách lẻ'} · ${customer?.phone || '—'}`}>{customer?.name || 'Khách lẻ'}</strong>
                            <span>{customer?.phone || '—'}</span>
                          </div>
                        </td>
                        <td>
                          {firstItem ? (
                            <div className="ws-product-cell">
                              <strong title={productName(firstItem)}>{productName(firstItem)}</strong>
                              <span>{productCode(firstItem) || '—'}</span>
                              {items.length > 1 && <em>+{items.length - 1} sản phẩm khác</em>}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="number" title={items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}>{items.length > 0 ? safeMoney(grossValue(invoice)) : '—'}</td>
                        <td className="number" title={items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}>{items.length > 0 ? totalQuantity(invoice).toLocaleString('vi-VN') : '—'}</td>
                        <td className="number discount" title={Number(invoice.discountValue) > 0 ? `-${safeMoney(discountMoneyAmount(invoice))}${invoice.discountType === 'percent' ? ` (${Number(invoice.discountValue)}%)` : ''}` : '—'}>{Number(invoice.discountValue) > 0 ? (
                          <span className="ws-discount-cell">
                            <span className="ws-discount-money">-{safeMoney(discountMoneyAmount(invoice))}</span>
                            {invoice.discountType === 'percent' ? <span className="ws-discount-rate">{Number(invoice.discountValue)}%</span> : null}
                          </span>
                        ) : '—'}</td>
                        <td className="number total" title={safeMoney(invoice.value)}>{safeMoney(invoice.value)}</td>
                        <td className="ws-payment-column">
                          {payments.length > 0 ? (
                            <div className="ws-payments">
                              {payments.map((payment, index) => (
                                <span className="ws-payment-item" key={`${payment.label}-${index}`}>
                                  <strong className="ws-payment-amount" title={safeMoney(payment.amount)}>{safeMoney(payment.amount)}</strong>
                                  <small className="ws-payment-method" title={payment.label}>{payment.label}</small>
                                </span>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                        <td><span className={`ws-status ${status.tone}`}>{status.label}</span></td>
                        <td className="action">
                          <div className="ws-row-menu" ref={rowActionOpen === invoice._id ? rowMenuRef : null}>
                            <button
                              className="ws-icon-btn"
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
                              <div className="ws-menu" onClick={(event) => event.stopPropagation()}>
                                <button type="button" onClick={() => void openDetail(invoice)}><Eye size={15} /> Xem chi tiết</button>
                                <button type="button" onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(invoice)}><Printer size={15} /> In hóa đơn</button>
                                <button type="button" disabled={giftDisabled} title={giftDisabled ? 'Hóa đơn này không có sản phẩm tặng kèm' : ''} onPointerDown={primePrintWindow} onClick={() => void handlePrintInvoice(invoice, true)}><Gift size={15} /> In hóa đơn quà tặng</button>
                                <button type="button" disabled={!refundState.enabled} title={refundState.title} onClick={() => navigate(`/sales-channels/${channel}/refund/create?saleId=${invoice._id}`)}><RotateCcw size={15} /> Đổi trả hàng</button>
                                <button type="button" disabled={!editState.enabled} title={editState.title} onClick={() => navigate(`/sales-channels/${channel}/wholesale/create?editId=${invoice._id}`)}><FilePenLine size={15} /> Sửa đơn hàng</button>
                                <button type="button" disabled={!deleteState.enabled || actionBusyId === invoice._id} title={deleteState.title} onClick={() => void handleDeleteInvoice(invoice)}><Trash2 size={15} /> {actionBusyId === invoice._id ? 'Đang xử lý...' : 'Xóa hóa đơn'}</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ws-pagination">
              <span>Hiển thị {rangeStart.toLocaleString('vi-VN')} - {rangeEnd.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')}</span>
              <div>
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>
                <strong>Trang {page} / {totalPages}</strong>
                <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showBranchModal && (
        <div className="ws-modal-backdrop" role="presentation" onClick={() => setShowBranchModal(false)}>
          <div className="ws-modal branch-modal" role="dialog" aria-modal="true" aria-labelledby="ws-branch-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><Warehouse size={20} /><h2 id="ws-branch-title">Chọn Kho / Chi Nhánh Bán Sỉ</h2></div>
              <button type="button" onClick={() => setShowBranchModal(false)} aria-label="Đóng"><X size={18} /></button>
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
              <button className="ws-btn ghost" type="button" onClick={() => setShowBranchModal(false)}>Hủy</button>
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
              <button className="ws-btn ghost" type="button" disabled={!editActionState(detail).enabled} title={editActionState(detail).title} onClick={() => navigate(`/sales-channels/${channel}/wholesale/create?editId=${detail._id}`)}><FilePenLine size={15} /> Sửa đơn hàng</button>
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
            <div className="grand"><dt>Tổng tiền</dt><dd>{safeMoney(invoice.value)}</dd></div>
            <div><dt>Đã thanh toán</dt><dd>{safeMoney(invoice.valuePayment)}</dd></div>
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
const wholesaleStyles = `
/* Wholesale invoice list - mirror retail premium effect system, purple accent */
.ws-invoice-page{
  --ws-accent:#7c3aed;
  --ws-accent-2:#6d28d9;
  --ws-accent-rgb:124,58,237;
  --ws-border:rgba(148,163,184,.22);
  --ws-shadow-sm:0 8px 20px rgba(15,23,42,.06);
  --ws-shadow:0 18px 42px rgba(15,23,42,.10);
  --ws-surface:rgba(255,255,255,.96);
  --ws-radius:14px;
  --ws-radius-lg:18px;
  display:flex;flex-direction:column;min-width:0;gap:16px;
  min-height:calc(100vh - 76px);
  padding:22px clamp(18px,4vw,44px) 46px;
  background:
    radial-gradient(circle at top left,rgba(var(--ws-accent-rgb),.12),transparent 30%),
    radial-gradient(circle at 86% 8%,rgba(109,93,252,.10),transparent 26%),
    linear-gradient(180deg,#faf8ff 0%,#f4f3fc 100%);
  color:#0f172a;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}

/* ---------- Hero ---------- */
.ws-hero{
  position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:22px;
  padding:22px 24px;border:1px solid var(--ws-border);border-radius:var(--ws-radius-lg);
  background:
    radial-gradient(900px 240px at 92% -40%,rgba(var(--ws-accent-rgb),.16),transparent 70%),
    linear-gradient(135deg,rgba(237,233,254,.5),rgba(255,255,255,.96));
  box-shadow:var(--ws-shadow);backdrop-filter:blur(10px);animation:ws-rise 360ms ease both;overflow:hidden;
}
.ws-hero::after{content:"";position:absolute;inset:auto -60px -80px auto;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(109,93,252,.18),transparent 68%);pointer-events:none}
.ws-hero-text{position:relative;z-index:1;display:grid;gap:6px;min-width:0}
.ws-eyebrow{display:inline-flex;align-items:center;gap:8px;width:fit-content;min-height:28px;padding:0 12px;border-radius:999px;background:rgba(var(--ws-accent-rgb),.12);color:var(--ws-accent);font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.ws-hero h1{margin:0;font-size:clamp(22px,2vw,28px);font-weight:850;letter-spacing:-.03em;line-height:1.15;background:linear-gradient(120deg,#4c1d95,var(--ws-accent) 60%,var(--ws-accent-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.ws-hero p{margin:0;max-width:680px;color:#64748b;font-size:13px;line-height:1.55}
.ws-hero-icon{width:56px;height:56px;border-radius:18px;display:inline-grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2));box-shadow:0 14px 30px rgba(var(--ws-accent-rgb),.32);flex-shrink:0}

/* ---------- Tabs (products-style compact tabbar) ---------- */
.ws-tabbar{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border:1px solid var(--ws-border);border-radius:12px;background:#f1f0fb;box-shadow:var(--ws-shadow-sm);width:fit-content;animation:ws-rise 340ms ease both}
.ws-tab{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:34px;padding:0 16px;border:1px solid transparent;border-radius:9px;background:#fff;color:#475569;font-size:13px;font-weight:700;cursor:pointer;box-shadow:none;transition:background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease}
.ws-tab>span{line-height:1}
.ws-tab:hover{background:rgba(var(--ws-accent-rgb),.08);color:var(--ws-accent)}
.ws-tab.is-active{background:linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2));color:#fff;box-shadow:0 2px 8px rgba(var(--ws-accent-rgb),.28);border-color:transparent}
.ws-tab:focus-visible{outline:2px solid var(--ws-accent);outline-offset:2px}

/* ---------- Body layout: sidebar filter + full-width table ---------- */
.ws-body{display:grid;grid-template-columns:296px minmax(0,1fr);gap:16px;align-items:start;animation:ws-rise 340ms ease both}
.ws-sidebar{position:sticky;top:16px;min-width:0}
.ws-main{min-width:0;display:flex;flex-direction:column;gap:16px}

/* ---------- Filter sidebar ---------- */
.ws-filter-panel{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--ws-border);border-radius:var(--ws-radius);background:linear-gradient(180deg,#fbfaff,#f8f7fc);box-shadow:var(--ws-shadow-sm);animation:ws-rise 340ms ease both}
.ws-filter-title{display:flex;align-items:center;gap:8px;margin:0;font-size:14px;font-weight:800;color:#334155}
.ws-filter-field{min-height:40px;display:inline-flex;align-items:center;gap:8px;min-width:0;background:#fff;border:1px solid #d7d6ec;border-radius:13px;padding:0 11px;color:#64748b;box-shadow:0 8px 20px rgba(15,23,42,.04);transition:border-color .15s ease,box-shadow .15s ease}
.ws-filter-field:focus-within{border-color:var(--ws-accent);box-shadow:0 0 0 4px rgba(var(--ws-accent-rgb),.12)}
.ws-filter-field input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:#0f172a;font:inherit;font-size:13px;font-weight:600}
.ws-date-field{flex-direction:column;align-items:stretch;gap:4px;padding:8px 11px}
.ws-date-field span{white-space:nowrap;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b}
.ws-filter-select{min-height:40px;width:100%;min-width:0;border:1px solid #d7d6ec;border-radius:13px;background:#fff;padding:0 11px;color:#0f172a;font-size:13px;font-weight:600;box-shadow:0 8px 20px rgba(15,23,42,.04);transition:border-color .15s ease,box-shadow .15s ease}
.ws-filter-select:focus{outline:0;border-color:var(--ws-accent);box-shadow:0 0 0 4px rgba(var(--ws-accent-rgb),.12)}
.ws-filter-actions{display:flex;gap:10px}
.ws-filter-button,.ws-reset-button{min-height:40px;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 16px;border-radius:13px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;transition:box-shadow .15s ease,transform .15s ease,background .15s ease,border-color .15s ease,color .15s ease}
.ws-filter-button{border:0;background:linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2));color:#fff;box-shadow:0 12px 24px rgba(var(--ws-accent-rgb),.2)}
.ws-filter-button:hover{box-shadow:0 16px 30px rgba(var(--ws-accent-rgb),.28);transform:translateY(-1px)}
.ws-reset-button{border:1px solid #d7d6ec;background:#fff;color:#334155;box-shadow:0 8px 18px rgba(15,23,42,.04)}
.ws-reset-button:hover{border-color:var(--ws-accent);color:var(--ws-accent)}
.ws-filter-button:active,.ws-reset-button:active{transform:translateY(0);filter:brightness(.98)}

/* ---------- Buttons ---------- */
.ws-btn{height:38px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 14px;border:1px solid transparent;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;transition:box-shadow .16s ease,transform .16s ease,filter .16s ease,border-color .16s ease,color .16s ease}
.ws-btn:disabled{opacity:.55;cursor:not-allowed}
.ws-btn.primary{background:linear-gradient(135deg,var(--ws-accent),var(--ws-accent-2));color:#fff;box-shadow:0 8px 18px rgba(var(--ws-accent-rgb),.22)}
.ws-btn.primary:hover{box-shadow:0 12px 24px rgba(var(--ws-accent-rgb),.30);transform:translateY(-1px)}
.ws-btn.success{background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;box-shadow:0 8px 18px rgba(22,163,74,.22)}
.ws-btn.success:hover{box-shadow:0 12px 24px rgba(22,163,74,.30);transform:translateY(-1px)}
.ws-btn.ghost{background:#fff;border-color:#cfd7df;color:#475569}
.ws-btn.ghost:hover{border-color:rgba(var(--ws-accent-rgb),.45);color:var(--ws-accent)}
.ws-btn:active{transform:translateY(0);filter:brightness(.98)}

/* ---------- Actionbar ---------- */
.ws-actionbar{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border:1px solid var(--ws-border);border-radius:var(--ws-radius);background:var(--ws-surface);box-shadow:var(--ws-shadow-sm);backdrop-filter:blur(8px);animation:ws-rise 340ms ease both}
.ws-actionbar-left,.ws-actionbar-right{display:flex;align-items:center;gap:12px}
.ws-actionbar-right{font-size:12px;color:#687685;flex-wrap:wrap;justify-content:flex-end}
.ws-selected,.ws-filter-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;background:rgba(var(--ws-accent-rgb),.1);color:var(--ws-accent);font-size:12px;font-weight:700}
.ws-icon-btn{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d4dbe2;border-radius:10px;background:#fff;color:#657383;cursor:pointer;transition:border-color .16s ease,color .16s ease,background .16s ease}
.ws-icon-btn:hover{background:rgba(var(--ws-accent-rgb),.08);border-color:rgba(var(--ws-accent-rgb),.4);color:var(--ws-accent)}
.ws-tools-btn{width:auto;gap:6px;padding:0 12px;font-size:13px;font-weight:700}
.ws-tools{position:relative;display:inline-flex}

/* ---------- Alert ---------- */
.ws-alert{display:flex;align-items:center;gap:10px;margin:0;padding:12px 14px;border:1px solid rgba(220,38,38,.25);border-radius:var(--ws-radius);background:linear-gradient(135deg,rgba(254,242,242,.96),#fff);box-shadow:var(--ws-shadow-sm);color:#b42318;animation:ws-rise 340ms ease both}
.ws-alert div{display:flex;flex:1;flex-direction:column;gap:2px}
.ws-alert span{font-size:12px}
.ws-alert button{border:0;background:transparent;color:#b42318;font-weight:750;cursor:pointer}

/* ---------- Table (full width) ---------- */
.ws-table-card{min-width:0;overflow:hidden;border:1px solid var(--ws-border);border-radius:var(--ws-radius);background:var(--ws-surface);box-shadow:var(--ws-shadow-sm);backdrop-filter:blur(8px);animation:ws-rise 360ms ease both}
.ws-table-scroll{overflow:auto}
.ws-table-card table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:12px}
.ws-table-card colgroup col{width:auto}
.ws-table-card .col-check{width:3.5%}
.ws-table-card .col-creator{width:9.5%}
.ws-table-card .col-id{width:8%}
.ws-table-card .col-customer{width:13%}
.ws-table-card .col-product{width:17%}
.ws-table-card .col-gross{width:8.5%}
.ws-table-card .col-qty{width:4%}
.ws-table-card .col-discount{width:7%}
.ws-table-card .col-total{width:8.5%}
.ws-table-card .col-payment{width:7%}
.ws-table-card .col-status{width:8%}
.ws-table-card .col-action{width:6%}
.ws-table-card th:last-child,.ws-table-card td:last-child{border-right:0}
.ws-table-card th{position:sticky;top:0;z-index:1;padding:9px 10px;background:linear-gradient(180deg,#f3f0fb,#eef2f7);border-bottom:1px solid rgba(148,163,184,.4);border-right:1px solid rgba(148,163,184,.18);color:#334155;font-size:11px;font-weight:750;text-align:left;white-space:normal;letter-spacing:.02em}
.ws-table-card td{padding:9px 10px;border-bottom:1px solid #eef2f7;border-right:1px solid #f1f5f9;vertical-align:top;background:#fff;transition:background .14s ease}
.ws-table-card tbody tr{transition:transform .14s ease}
.ws-table-card tbody tr:hover td{background:linear-gradient(90deg,rgba(var(--ws-accent-rgb),.05),rgba(var(--ws-accent-rgb),.015))}
.ws-table-card .check,.ws-table-card .action{text-align:center}
.ws-table-card .number{text-align:right}
.ws-table-card td.number{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-stack,.ws-product-cell,.ws-payments{display:flex;flex-direction:column;gap:3px}
.ws-stack strong,.ws-product-cell strong{font-weight:700;color:#0f172a}
.ws-stack span,.ws-product-cell span{color:#64748b;font-size:11px}
.ws-stack strong,.ws-stack span{min-width:0;word-break:break-word}
.ws-product-cell{min-width:0;max-width:100%}
.ws-product-cell strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-product-cell em{color:var(--ws-accent);font-size:11px;font-style:normal;font-weight:700}
.ws-invoice-link{display:block;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;padding:0;border:0;background:transparent;color:var(--ws-accent);font-weight:700;cursor:pointer;transition:color .14s ease}
.ws-invoice-link:hover{color:var(--ws-accent-2);text-decoration:underline}
.ws-table-card td.discount{color:#ea580c}
.ws-discount-cell{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px;line-height:1.3}
.ws-discount-money{white-space:nowrap}
.ws-discount-rate{color:#b45309;font-size:11px;font-weight:600;white-space:nowrap}
.ws-discount-detail{display:inline-flex;flex-direction:column;align-items:flex-end;gap:1px;line-height:1.3}
.ws-table-card td.total{color:#16a34a;font-weight:800}
.ws-payment-column{min-width:0;max-width:100%}
.ws-payments{min-width:0;max-width:180px;gap:8px}
.ws-payment-item{display:flex;min-width:0;max-width:100%;flex-direction:column;align-items:flex-end;gap:3px}
.ws-payment-amount{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-weight:700;white-space:nowrap;color:#0f172a}
.ws-payment-method{display:block;min-width:0;max-width:100%;overflow:hidden;color:#64748b;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.ws-status{display:inline-flex;padding:3px 9px;border-radius:999px;background:#eef1f4;color:#5d6874;font-size:11px;font-style:normal;font-weight:700;white-space:nowrap}
.ws-status.success{background:rgba(22,163,74,.12);color:#15803d}
.ws-status.warning{background:rgba(180,83,9,.12);color:#b45309}
.ws-status.danger{background:rgba(220,38,38,.12);color:#b91c1c}
.ws-table-card .ws-status{white-space:normal;line-height:1.3}
.ws-row-menu{position:relative;display:inline-flex}

/* ---------- Dropdown menus ---------- */
.ws-menu{position:absolute;z-index:40;top:38px;right:0;width:220px;padding:6px;background:#fff;border:1px solid var(--ws-border);border-radius:12px;box-shadow:0 18px 40px rgba(15,23,42,.16);text-align:left;animation:ws-popover-in 160ms ease both}
.ws-menu button{width:100%;display:flex;align-items:center;gap:8px;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:#334155;font-size:12px;cursor:pointer;transition:background .14s ease,color .14s ease}
.ws-menu button:hover{background:rgba(var(--ws-accent-rgb),.08);color:var(--ws-accent)}
.ws-menu button:disabled{opacity:.45;cursor:not-allowed}
.ws-menu button:disabled:hover{background:transparent;color:#334155}
.ws-tools-menu{width:180px}

/* ---------- Empty / skeleton ---------- */
.ws-empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#94a3b8}
.ws-empty strong{color:#475569;font-size:14px}
.ws-skeleton td span{display:block;height:13px;border-radius:6px;background:linear-gradient(100deg,#e9edf4 30%,#f4f7fb 50%,#e9edf4 70%);background-size:200% 100%;animation:ws-shimmer 1.4s ease-in-out infinite}

/* ---------- Pagination ---------- */
.ws-pagination{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--ws-border);color:#687685;font-size:12px}
.ws-pagination>div{display:flex;align-items:center;gap:8px}
.ws-pagination button{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d5dde5;border-radius:9px;background:#fff;cursor:pointer;transition:border-color .16s ease,color .16s ease}
.ws-pagination button:hover:not(:disabled){border-color:rgba(var(--ws-accent-rgb),.45);color:var(--ws-accent)}
.ws-pagination button:disabled{opacity:.45;cursor:not-allowed}

/* ---------- Modals ---------- */
.ws-modal-backdrop{position:fixed;z-index:1000;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.52);backdrop-filter:blur(4px);animation:ws-fade 180ms ease both}
.ws-modal{width:min(560px,100%);max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:#fff;border:1px solid var(--ws-border);border-radius:18px;box-shadow:0 30px 70px rgba(15,23,42,.30);overflow:hidden;animation:ws-rise 220ms ease both}
.ws-modal.detail-modal{width:min(1040px,100%)}
.ws-modal header,.ws-modal footer{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eef2f7}
.ws-modal footer{justify-content:flex-end;gap:8px;border-top:1px solid #eef2f7;border-bottom:0}
.ws-modal header>div{display:flex;align-items:center;gap:9px}
.ws-modal h2{margin:0;font-size:16px;font-weight:800}
.ws-modal header>button{width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:#64748b;cursor:pointer;transition:color .16s ease,background .16s ease}
.ws-modal header>button:hover{color:#0f172a;background:#f1f5f9}
.ws-modal-body{padding:16px;overflow:auto}
.ws-modal-state{min-height:150px;display:flex;align-items:center;justify-content:center;gap:9px;color:#64748b}
.ws-modal-error{display:flex;align-items:center;gap:8px;padding:12px;border-radius:10px;background:#fff2f1;color:#b42318}
.ws-modal-error button{margin-left:auto;border:0;background:transparent;color:inherit;font-weight:700;cursor:pointer}

/* ---------- Branch picker ---------- */
.ws-branch-list{display:flex;flex-direction:column;gap:10px}
.ws-branch-list>button{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:12px;padding:14px;border:1px solid var(--ws-border);border-radius:12px;background:#fff;color:#475569;text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease}
.ws-branch-list>button:hover{border-color:rgba(var(--ws-accent-rgb),.4);background:rgba(var(--ws-accent-rgb),.04);transform:translateY(-1px);box-shadow:0 10px 22px rgba(15,23,42,.06)}
.ws-branch-list>button.active{border-color:var(--ws-accent);background:rgba(var(--ws-accent-rgb),.06);color:var(--ws-accent-2);box-shadow:0 10px 22px rgba(var(--ws-accent-rgb),.12)}
.ws-branch-check{width:22px;height:22px;border-radius:50%;border:2px solid rgba(var(--ws-accent-rgb),.25);display:inline-flex;align-items:center;justify-content:center;color:#fff;background:var(--ws-accent)}
.ws-branch-list>button:not(.active) .ws-branch-check{border:2px solid rgba(148,163,184,.35);background:transparent}
.ws-branch-info{display:flex;flex-direction:column;gap:4px;min-width:0}
.ws-branch-info strong{font-weight:700;color:#0f172a}
.ws-branch-info small{display:flex;flex-wrap:wrap;gap:10px;color:#64748b;font-size:12px}
.ws-branch-info em{display:inline-flex;align-items:center;gap:4px;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}

/* ---------- Detail modal ---------- */
.ws-detail-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.8fr);gap:14px}
.ws-detail-main,.ws-detail-side{display:flex;flex-direction:column;gap:12px}
.ws-detail-card{border:1px solid var(--ws-border);border-radius:12px;overflow:hidden;background:#fff}
.ws-detail-card h3{margin:0;padding:12px 14px;background:linear-gradient(180deg,#f8fafc,#f3f0fb);border-bottom:1px solid var(--ws-border);font-size:13px;font-weight:800;color:#334155}
.ws-info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:14px}
.ws-info-grid span{display:flex;flex-direction:column;gap:3px}
.ws-info-grid small,.ws-detail-info small{color:#64748b}
.ws-detail-table{overflow:auto}
.ws-detail-table table{min-width:620px}
.ws-detail-table th{position:static}
.ws-detail-empty{text-align:center;color:#64748b}
.ws-note{margin:0;padding:14px;white-space:pre-wrap}
.ws-money-summary{margin:0;padding:14px}
.ws-money-summary>div{display:flex;justify-content:space-between;gap:12px;padding:7px 0}
.ws-money-summary dt{color:#64748b}
.ws-money-summary dd{margin:0;font-weight:700}
.ws-money-summary .discount{color:#ea580c}
.ws-money-summary .grand{border-top:1px solid var(--ws-border);font-size:15px}
.ws-money-summary .grand dd{color:#16a34a}
.ws-payment-breakdown{display:flex;flex-direction:column;gap:6px;padding:0 14px 14px}
.ws-payment-breakdown span{display:flex;justify-content:space-between;padding:8px 10px;border-radius:8px;background:#f4f3f9}
.ws-payment-breakdown small{color:#64748b}
.ws-detail-info{display:flex;flex-direction:column;gap:12px;padding:14px}
.ws-detail-info>span{display:flex;align-items:flex-start;gap:9px}
.ws-detail-info>span>div{display:flex;flex-direction:column;gap:3px}

/* ---------- Animations ---------- */
.spin{animation:ws-spin 1s linear infinite}
@keyframes ws-spin{to{transform:rotate(360deg)}}
@keyframes ws-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes ws-fade{from{opacity:0}to{opacity:1}}
@keyframes ws-shimmer{0%{background-position:100% 0;opacity:.7}50%{opacity:1}100%{background-position:-100% 0;opacity:.7}}
@keyframes ws-popover-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

/* ---------- Responsive ---------- */
@media(max-width:1180px){.ws-body{grid-template-columns:260px minmax(0,1fr)}}
@media(max-width:1000px){.ws-body{grid-template-columns:1fr}.ws-sidebar{position:static}}
@media(max-width:900px){.ws-table-card table{table-layout:auto;min-width:980px}.ws-table-card th{white-space:nowrap}.ws-table-card colgroup col{width:auto}}
@media(max-width:760px){.ws-hero{flex-direction:column;align-items:stretch;gap:14px}.ws-actionbar{align-items:flex-start;flex-direction:column}.ws-actionbar-right{width:100%;flex-wrap:wrap}.ws-detail-grid{grid-template-columns:1fr}.ws-info-grid{grid-template-columns:1fr}.ws-pagination{align-items:flex-start;flex-direction:column;gap:8px}}
`;

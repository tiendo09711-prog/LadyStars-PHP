import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProductScanTarget } from '../../core/hooks/productScanner';
import {
  FileDown,
  Filter,
  Percent,
  RefreshCw,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal
} from 'lucide-react';
import { productApi } from '../../core/api/product.api';
import type { IStorageDuration, ICategory, IStorageDurationKpis } from '../../types/product.type';
import { Pagination } from '../../core/components/Pagination';
import { http } from '../../core/api/http';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from './components/ExportExcelModal';
import './product-compact.css';
import './products-page.css';

const STORAGE_ALERT_DAYS = 30;
type StorageTab = 'all' | 'unsold_long' | 'slow_selling';

function normalizeStorageTab(value: string | null): StorageTab {
  return value === 'unsold_long' || value === 'slow_selling' ? value : 'all';
}

export function StorageDurationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Core lists & loading
  const [items, setItems] = useState<IStorageDuration[]>([]);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & counts
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Filters
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [tempSearch, setTempSearch] = useState(() => searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('categoryId') || '');
  const [activeTab, setActiveTab] = useState<StorageTab>(() => normalizeStorageTab(searchParams.get('tab')));
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(() => searchParams.get('branchId') || '');
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Advanced filters
  const [minStartDays, setMinStartDays] = useState(() => searchParams.get('minStartDays') || '');
  const [minSoldDays, setMinSoldDays] = useState(() => searchParams.get('minSoldDays') || '');
  const [minStock, setMinStock] = useState(() => searchParams.get('minStock') || '');
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // KPIs
  const [kpis, setKpis] = useState<IStorageDurationKpis>({
    totalProducts: 0,
    unsoldLong: 0,
    slowSelling: 0,
    totalValue: 0,
    thresholdDays: STORAGE_ALERT_DAYS
  });

  // Action Dialogs
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Discount Modal state
  const [discountProduct, setDiscountProduct] = useState<IStorageDuration | null>(null);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountVal, setDiscountVal] = useState<string>('10');
  const [discountNote, setDiscountNote] = useState('');

  // Auto clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Close action menu on click-outside or Escape
  useEffect(() => {
    if (!openActionMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      const isActionMenu = target instanceof Element ? target.closest('.storage-row-action-menu') != null : false;
      const isActionTrigger = target instanceof Element ? target.closest('.storage-row-menu-button') != null : false;
      if (!isActionMenu && !isActionTrigger) {
        setOpenActionMenu(null);
        setRowMenuPos(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenu(null);
        setRowMenuPos(null);
      }
    };
    const handleViewportChange = () => {
      setOpenActionMenu(null);
      setRowMenuPos(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [openActionMenu]);

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

  useEffect(() => {
    const urlTab = normalizeStorageTab(searchParams.get('tab'));
    const urlQ = searchParams.get('q') || '';
    const urlCategory = searchParams.get('categoryId') || '';
    const urlBranch = searchParams.get('branchId') || '';
    const urlMinStart = searchParams.get('minStartDays') || '';
    const urlMinSold = searchParams.get('minSoldDays') || '';
    const urlMinStock = searchParams.get('minStock') || '';
    setActiveTab((current) => (current === urlTab ? current : urlTab));
    setSearch((current) => (current === urlQ ? current : urlQ));
    setTempSearch((current) => (current === urlQ ? current : urlQ));
    setSelectedCategory((current) => (current === urlCategory ? current : urlCategory));
    setSelectedBranch((current) => (current === urlBranch ? current : urlBranch));
    setMinStartDays((current) => (current === urlMinStart ? current : urlMinStart));
    setMinSoldDays((current) => (current === urlMinSold ? current : urlMinSold));
    setMinStock((current) => (current === urlMinStock ? current : urlMinStock));
  }, [searchParams]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (activeTab !== 'all') next.set('tab', activeTab);
    if (search) next.set('q', search);
    if (selectedCategory) next.set('categoryId', selectedCategory);
    if (selectedBranch) next.set('branchId', selectedBranch);
    if (minStartDays) next.set('minStartDays', minStartDays);
    if (minSoldDays) next.set('minSoldDays', minSoldDays);
    if (minStock) next.set('minStock', minStock);
    setSearchParams(next, { replace: true });
  }, [activeTab, search, selectedCategory, selectedBranch, minStartDays, minSoldDays, minStock, setSearchParams]);

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
        thresholdDays: STORAGE_ALERT_DAYS,
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
  }, [page, activeTab, selectedCategory, search, selectedBranch, minStartDays, minSoldDays, minStock, fetchTrigger]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(tempSearch);
    if (page === 1) {
      setFetchTrigger(prev => prev + 1);
    } else {
      setPage(1);
    }
  };

  const searchRef = useRef<HTMLInputElement>(null);
  useProductScanTarget(searchRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    setTempSearch(query);
    setSearch(query);
    if (page === 1) {
      setFetchTrigger(prev => prev + 1);
    } else {
      setPage(1);
    }
  });

  const handleClearFilters = () => {
    setTempSearch('');
    setSearch('');
    setSelectedCategory('');
    setMinStartDays('');
    setMinSoldDays('');
    setMinStock('');
    setSelectedBranch('');
    setActiveTab('all');
    setPage(1);
    setFetchTrigger((prev) => prev + 1);
  };

  const openTransferDraft = (product: IStorageDuration) => {
    const params = new URLSearchParams();
    if (selectedBranch) params.set('sourceWarehouseId', selectedBranch);
    params.set('productId', product._id);
    params.set('productCode', product.code);
    params.set('quantity', '1');
    params.set('note', 'Đề xuất chuyển kho từ báo cáo hàng tồn lâu / bán chậm');
    navigate(`/warehouse/transfers/create?${params.toString()}`);
  };

  const openVendorReturnVoucher = (product: IStorageDuration) => {
    const params = new URLSearchParams();
    if (selectedBranch) params.set('branchId', selectedBranch);
    params.set('productId', product._id);
    params.set('productCode', product.code);
    params.set('quantity', '1');
    params.set('type', 'Xuất trả hàng');
    params.set('note', 'Xử lý hàng tồn lâu / bán chậm');
    navigate(`/warehouse/transactions/vouchers/export?${params.toString()}`);
  };

  const handleStopClearance = async (product: IStorageDuration) => {
    setOpenActionMenu(null);
    setRowMenuPos(null);
    const confirmed = window.confirm('Bỏ giá xả hàng cho sản phẩm này? Giá bán chính không thay đổi.');
    if (!confirmed) return;
    try {
      await productApi.updateProduct(product._id, {
        clearanceActive: false,
        clearancePrice: 0,
        clearanceNote: ''
      } as any);
      setToast({ message: `Đã bỏ giá xả hàng cho sản phẩm ${product.code}.`, type: 'success' });
      loadData();
    } catch (err) {
      console.error('Failed to stop clearance', err);
      setToast({ message: 'Có lỗi khi bỏ giá xả hàng.', type: 'error' });
    }
  };

  // Discount (Xả hàng) Action handlers
  const handleOpenDiscount = (product: IStorageDuration) => {
    setOpenActionMenu(null);
    setRowMenuPos(null);
    setDiscountProduct(product);
    setDiscountType('percent');
    setDiscountVal('10');
    setDiscountNote(`Đặt giá xả hàng riêng cho sản phẩm lưu kho lâu / bán chậm, không ảnh hưởng giá bán chính.`);
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
      const confirmed = window.confirm('Thao tác này sẽ lưu GIÁ XẢ HÀNG riêng, không đổi giá bán chính. Bạn có chắc không?');
      if (!confirmed) return;
      await productApi.updateProduct(discountProduct._id, {
        clearancePrice: newPrice,
        clearanceActive: true,
        clearanceNote: discountNote,
        clearanceStartedAt: new Date().toISOString()
      } as any);
      setToast({
        message: `Đã lưu giá xả hàng cho sản phẩm ${discountProduct.code}: ${newPrice.toLocaleString('vi-VN')} đ (giá bán chính không đổi)`,
        type: 'success'
      });
      setDiscountProduct(null);
      loadData();
    } catch (err) {
      console.error('Failed to apply discount', err);
      setToast({ message: 'Có lỗi xảy ra khi áp dụng giảm giá xả hàng.', type: 'error' });
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
        thresholdDays: STORAGE_ALERT_DAYS,
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
      const headers = ['Mã SP', 'Tên SP', 'Nhóm', 'NCC', 'Giá vốn', 'Giá bán', 'Tồn', 'Chi nhánh', 'Ngày nhập đầu', 'Ngày XNK cuối', 'Ngày bán cuối', 'Số ngày lưu từ nhập đầu', 'Số ngày từ XNK cuối', 'Số ngày chưa bán/bán chậm', 'Trạng thái'];
      const rows = exportItems.map(item => [
        item.code,
        `"${item.name.replace(/"/g, '""')}"`,
        item.categoryName || '',
        item.supplierName || '',
        item.cost || 0,
        item.price || 0,
        item.qty || 0,
        item.branchName || branches.find((branch) => branch._id === selectedBranch)?.name || '',
        formatDate(item.firstTransactionDate),
        formatDate(item.lastTransactionDate),
        item.lastSoldDate ? formatDate(item.lastSoldDate) : 'Chưa bán lần nào',
        item.daysFromStart,
        item.daysFromLast,
        item.daysFromLastSold !== null ? item.daysFromLastSold : 'Chưa bán lần nào',
        item.statusLabel || getStorageStatusLabel(item)
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
    if (days >= STORAGE_ALERT_DAYS * 3) return 'danger';
    if (days >= STORAGE_ALERT_DAYS) return 'warning';
    return 'success';
  };

  const getStorageStatusLabel = (item: IStorageDuration) => {
    // Prefer backend computed status (source of truth) for consistent classification with threshold used in API
    if (item.status === 'unsold_long') return 'Nhập lâu - chưa bán';
    if (item.status === 'slow_selling') return 'Bán chậm';
    if (item.status === 'normal') return 'Bình thường';
    // Fallback to label or local calc using configured threshold (in case status missing)
    if (item.statusLabel && !/^[A-Za-z ]+$/.test(item.statusLabel)) return item.statusLabel;
    const thr = STORAGE_ALERT_DAYS;
    if (item.daysFromStart >= thr && item.daysFromLastSold === null) return 'Nhập lâu - chưa bán';
    if (item.daysFromLastSold !== null && item.daysFromLastSold >= thr) return 'Bán chậm';
    return 'Bình thường';
  };

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã SP', key: 'code', getValue: (item: IStorageDuration) => item.code },
      { label: 'Tên SP', key: 'name', getValue: (item: IStorageDuration) => item.name },
      { label: 'Danh mục', key: 'categoryName', getValue: (item: IStorageDuration) => item.categoryName || '' },
      { label: 'Nhà cung cấp', key: 'supplierName', getValue: (item: IStorageDuration) => item.supplierName || '' },
      { label: 'Giá vốn', key: 'cost', getValue: (item: IStorageDuration) => item.cost || 0 },
      { label: 'Giá bán', key: 'price', getValue: (item: IStorageDuration) => item.price || 0 },
      { label: 'Tồn kho', key: 'qty', getValue: (item: IStorageDuration) => item.qty || 0 },
      { label: 'Chi nhánh', key: 'branchName', getValue: (item: IStorageDuration) => item.branchName || (branches.find((b: any) => b._id === selectedBranch)?.name || '') },
      { label: 'Ngày nhập đầu', key: 'firstTransactionDate', getValue: (item: IStorageDuration) => item.firstTransactionDate ? new Date(item.firstTransactionDate).toLocaleDateString('vi-VN') : '—' },
      { label: 'Ngày XNK cuối', key: 'lastTransactionDate', getValue: (item: IStorageDuration) => item.lastTransactionDate ? new Date(item.lastTransactionDate).toLocaleDateString('vi-VN') : '—' },
      { label: 'Ngày bán cuối', key: 'lastSoldDate', getValue: (item: IStorageDuration) => item.lastSoldDate ? new Date(item.lastSoldDate).toLocaleDateString('vi-VN') : 'Chưa bán lần nào' },
      { label: 'Số ngày từ nhập', key: 'daysFromStart', getValue: (item: IStorageDuration) => item.daysFromStart },
      { label: 'Số ngày từ XNK cuối', key: 'daysFromLast', getValue: (item: IStorageDuration) => item.daysFromLast },
      { label: 'Số ngày từ bán cuối', key: 'daysFromLastSold', getValue: (item: IStorageDuration) => item.daysFromLastSold !== null ? item.daysFromLastSold : 'Chưa bán lần nào' },
      { label: 'Trạng thái', key: 'status', getValue: (item: IStorageDuration) => getStorageStatusLabel(item) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, selectedBranch],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: IStorageDuration[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = (nextPage: number, nextLimit: number) =>
          productApi.getStorageDuration({
            page: nextPage,
            limit: nextLimit,
            q: search || undefined,
            categoryId: selectedCategory || undefined,
            tab: activeTab,
            thresholdDays: STORAGE_ALERT_DAYS,
            minStartDays: minStartDays ? Number(minStartDays) : undefined,
            minSoldDays: minSoldDays ? Number(minSoldDays) : undefined,
            minStock: minStock ? Number(minStock) : undefined,
            branchId: selectedBranch || undefined,
          });
        const pageSize = 100;
        const firstPage = await fetchPage(1, pageSize);
        let allItems = [...(firstPage.items || [])];
        const totalItems = firstPage.total || 0;
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => fetchPage(index + 2, pageSize)),
          );
          responses.forEach((res) => { allItems = allItems.concat(res.items || []); });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setToast({ message: 'Không có dữ liệu để xuất.', type: 'error' });
        return;
      }
      const mappedRows = dataToExport.map((item) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((col) => {
          const exportColumn = exportColumns.find((c) => c.key === col.key);
          row[col.customLabel] = exportColumn ? exportColumn.getValue(item) : '';
        });
        return row;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err) {
      console.error('Lỗi xuất Excel thời gian lưu kho:', err);
      setToast({ message: 'Xuất Excel thất bại.', type: 'error' });
    } finally {
      setExportLoading(false);
    }
  };

  const branchFilterLabel =
    branches.find((b) => b._id === selectedBranch)?.name || (selectedBranch ? selectedBranch : 'Tất cả chi nhánh');
  const formatKpiMoney = (val?: number) =>
    `${Number(val || 0).toLocaleString('vi-VN')} đ`;
  const activeTabLabel = activeTab === 'all' ? 'Tất cả' : activeTab === 'unsold_long' ? 'Tồn lâu' : 'Bán chậm';
  const hasActiveFilters = Boolean(
    search ||
    selectedCategory ||
    selectedBranch ||
    minStartDays ||
    minSoldDays ||
    minStock ||
    activeTab !== 'all',
  );
  const openRowActionMenu = (productId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (openActionMenu === productId) {
      setOpenActionMenu(null);
      setRowMenuPos(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 232;
    const menuHeight = 176;
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
    setOpenActionMenu(productId);
  };
  const openActionItem = openActionMenu ? items.find((item) => item._id === openActionMenu) ?? null : null;

  return (
    <div className="product-compact-shell storage-duration-page">
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
          padding: '10px 14px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: toast.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: toast.type === 'success' ? '#047857' : '#b91c1c',
          animation: 'slideIn 0.3s ease'
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span style={{ fontWeight: 600, fontSize: '13px' }}>{toast.message}</span>
        </div>
      )}

      <section className="data-card storage-toolbar-card storage-sticky-toolbar">
        <div className="storage-toolbar-header-slot">
          <div className="storage-compact-head">
            <h1 className="storage-compact-heading-sr">Hàng tồn lâu &amp; bán chậm</h1>
            <div className="storage-tabs-row storage-tabs-row--title-slot">
              <span className="storage-toolbar-eyebrow">STORAGE DURATION</span>
              <div className="storage-tabbar is-compact" role="tablist" aria-label="Hàng tồn lâu tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'all'}
                  aria-controls="storage-duration-table"
                  className={`storage-tab is-compact${activeTab === 'all' ? ' is-active' : ''}`}
                  onClick={() => { setActiveTab('all'); setPage(1); }}
                >
                  Tất cả ({Number(kpis.totalProducts || 0).toLocaleString('vi-VN')})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'unsold_long'}
                  aria-controls="storage-duration-table"
                  className={`storage-tab is-compact${activeTab === 'unsold_long' ? ' is-active' : ''}`}
                  onClick={() => { setActiveTab('unsold_long'); setPage(1); }}
                >
                  Tồn lâu ({Number(kpis.unsoldLong || 0).toLocaleString('vi-VN')})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'slow_selling'}
                  aria-controls="storage-duration-table"
                  className={`storage-tab is-compact${activeTab === 'slow_selling' ? ' is-active' : ''}`}
                  onClick={() => { setActiveTab('slow_selling'); setPage(1); }}
                >
                  Bán chậm ({Number(kpis.slowSelling || 0).toLocaleString('vi-VN')})
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="storage-summary-strip" aria-label="Tóm tắt Hàng tồn lâu">
          <div className="storage-summary-cluster">
            <span className="storage-summary-main">
              <strong>{Number(total || 0).toLocaleString('vi-VN')}</strong>
              <span>dòng</span>
            </span>
            <span className="storage-summary-divider" aria-hidden="true" />
            <span>{activeTabLabel}</span>
            {hasActiveFilters ? (
              <>
                <span className="storage-summary-divider" aria-hidden="true" />
                <span className="storage-summary-filter">Đang lọc</span>
              </>
            ) : null}
            <span className="storage-summary-divider" aria-hidden="true" />
            <span className="storage-summary-value">{formatKpiMoney(kpis.totalValue)}</span>
          </div>
        </div>

        <form className="storage-filter-bar" onSubmit={handleSearchSubmit}>
          <div className="storage-search">
            <Search size={15} />
            <input
              value={tempSearch}
              onChange={(e) => setTempSearch(e.target.value)}
              ref={searchRef}
              data-product-search-scan="true"
              data-product-search-primary="true"
              placeholder="Tìm theo tên, mã SP..."
            />
          </div>

          <select
            className="storage-filter-select"
            value={selectedBranch}
            onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }}
            title="Chi nhánh"
            disabled={loadingBranches}
          >
            <option value="">Tất cả chi nhánh</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
            ))}
          </select>

          <select
            className="storage-filter-select"
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
            title="Nhóm sản phẩm"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>

          <div className="storage-filter-actions">
            <button
              className="storage-btn storage-btn-secondary"
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
            >
              <Filter size={14} />
              {showAdvancedFilters ? 'Ẩn nâng cao' : 'Bộ lọc nâng cao'}
            </button>
            <button
              className={`storage-btn storage-btn-secondary${Number(minStartDays) >= (kpis.thresholdDays || STORAGE_ALERT_DAYS) ? ' is-active' : ''}`}
              type="button"
              onClick={() => {
                const thr = String(kpis.thresholdDays || STORAGE_ALERT_DAYS);
                setMinStartDays(thr);
                setPage(1);
                setShowAdvancedFilters(true);
              }}
            >
              Tuổi cao
            </button>
            <button className="storage-btn storage-btn-primary" type="submit">
              Lọc
            </button>
            <button className="storage-btn storage-btn-secondary" type="button" onClick={handleClearFilters} title="Đặt lại bộ lọc và làm mới">
              <RefreshCw size={14} /> Làm mới
            </button>
            <button className="storage-btn storage-btn-accent" type="button" onClick={() => setShowExportModal(true)}>
              <FileDown size={14} /> Xuất
            </button>
            <button className="storage-btn storage-btn-secondary" type="button" onClick={() => navigate('/products')}>
              Sản phẩm
            </button>
            <button className="storage-btn storage-btn-secondary" type="button" onClick={() => navigate('/products/inventory')}>
              Tồn kho
            </button>
          </div>
        </form>

        <div className={`storage-advanced-filters${showAdvancedFilters ? ' is-open' : ''}`} aria-hidden={!showAdvancedFilters}>
          <label>
            Nhập đầu ≥
            <input
              className="storage-filter-input"
              type="number"
              min="0"
              value={minStartDays}
              onChange={(e) => { setMinStartDays(e.target.value); setPage(1); }}
              placeholder="30"
            />
          </label>
          <label>
            Chưa bán ≥
            <input
              className="storage-filter-input"
              type="number"
              min="0"
              value={minSoldDays}
              onChange={(e) => { setMinSoldDays(e.target.value); setPage(1); }}
              placeholder="30"
            />
          </label>
          <label>
            Tồn ≥
            <input
              className="storage-filter-input"
              type="number"
              min="1"
              value={minStock}
              onChange={(e) => { setMinStock(e.target.value); setPage(1); }}
              placeholder="1"
            />
          </label>
        </div>

        <p className="storage-info-note">
          <strong>Cách đọc:</strong> Lưu từ nhập đầu = ngày từ lô nhập đầu; Lưu từ XNK cuối = từ giao dịch kho cuối;
          Chưa bán ra = từ đơn bán gần nhất (hoặc “Chưa bán lần nào”). Ngưỡng cảnh báo {kpis.thresholdDays || STORAGE_ALERT_DAYS} ngày.
        </p>
      </section>

      <section className="data-card storage-table-card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div className="data-card-header storage-table-header">
          <div>
            <h2 className="storage-table-title">Bảng dữ liệu Hàng tồn lâu</h2>
            <p className="storage-table-subtitle">
              {total.toLocaleString('vi-VN')} sản phẩm · Tab {activeTabLabel} · {branchFilterLabel}
            </p>
          </div>
          <span className="storage-selected-count">{total.toLocaleString('vi-VN')} dòng</span>
        </div>

        <div className="table-scroll storage-table-scroll">
          <table id="storage-duration-table" className="data-table storage-data-table">
            {/* Fixed-layout widths: name is widest; short/numeric cols stay compact; action always visible */}
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '88px' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="storage-col-code">Mã SP</th>
                <th className="storage-col-name">Tên sản phẩm</th>
                <th className="storage-col-group">Nhóm / NCC</th>
                <th className="storage-col-price">Giá nhập | Giá bán</th>
                <th className="storage-col-qty">Tồn kho</th>
                <th className="storage-col-xnk">XNK Đầu / Cuối</th>
                <th className="storage-col-sold">Bán cuối</th>
                <th className="storage-col-days">Lưu từ đầu</th>
                <th className="storage-col-days">Lưu từ XNK cuối</th>
                <th className="storage-col-unsold">Chưa bán ra</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={11} className="storage-empty-cell">Đang tải dữ liệu...</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={11} className="storage-empty-cell">Chưa có sản phẩm nào phù hợp. Trang này chỉ hiển thị sản phẩm còn tồn theo điều kiện lọc. Hãy thử giảm tồn tối thiểu, chọn Tất cả chi nhánh hoặc kiểm tra dữ liệu nhập/bán hàng.</td></tr>}
              {!loading && items.map((item) => (
                <tr key={item._id}>
                  <td className="storage-col-code"><strong className="storage-code">{item.code}</strong></td>
                  <td className="storage-name-cell storage-col-name" title={item.name}>
                    <div className="storage-name-main">{item.name}</div>
                  </td>
                  <td className="storage-col-group">
                    <span className="storage-group-main">{item.categoryName || 'Chưa phân loại'}</span>
                    <small className="storage-name-sub">
                      NCC: {item.supplierName || 'Mặc định'}
                    </small>
                  </td>
                  <td className="number storage-col-price">
                    <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{formatMoney(item.cost)}</span>
                    <span style={{ margin: '0 4px', color: '#cbd5e1' }}>|</span>
                    <strong style={{ color: '#0f172a', fontSize: '12px' }}>{formatMoney(item.price)}</strong>
                    {item.clearanceActive && item.clearancePrice ? (
                      <small style={{ display: 'block', color: '#c2410c', fontWeight: 700, fontSize: '11px' }}>Xả: {formatMoney(item.clearancePrice)}</small>
                    ) : null}
                  </td>
                  <td className="number storage-col-qty">
                    <strong style={{ color: '#1e293b' }}>{Number(item.qty || 0).toLocaleString('vi-VN')}</strong>
                  </td>
                  <td className="storage-col-xnk">
                    <span style={{ fontSize: '12px', display: 'block' }}>{formatDate(item.firstTransactionDate)}</span>
                    <small style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>
                      Cuối: {formatDate(item.lastTransactionDate)}
                    </small>
                  </td>
                  <td className="storage-col-sold">
                    <span style={{ fontSize: '12px' }}>{formatDate(item.lastSoldDate)}</span>
                  </td>
                  <td className="storage-col-days">
                    <span className={`status-badge ${getDaysStartBadgeClass(item.daysFromStart)}`}>
                      {item.daysFromStart} ngày
                    </span>
                  </td>
                  <td className="storage-col-days">
                    <span style={{ fontSize: '13px', color: '#475569' }}>
                      {item.daysFromLast} ngày
                    </span>
                  </td>
                  <td className="storage-col-unsold">
                    {item.daysFromLastSold === null ? (
                      <span className="storage-unsold-empty" style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '12px' }}>Chưa bán lần nào</span>
                    ) : (
                      <span style={{
                        fontWeight: 600,
                        color: item.daysFromLastSold >= STORAGE_ALERT_DAYS ? 'var(--danger)' : '#475569',
                        fontSize: '13px'
                      }}>
                        {item.daysFromLastSold} ngày
                      </span>
                    )}
                  </td>
                  <td className="action-cell storage-action-cell">
                    <div className="storage-actions">
                      <button
                        className="storage-row-menu-button"
                        type="button"
                        aria-label={`Mở thao tác cho ${item.code}`}
                        aria-expanded={openActionMenu === item._id}
                        aria-haspopup="menu"
                        onClick={(event) => openRowActionMenu(item._id, event)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
      </section>

      {openActionItem && rowMenuPos
        ? createPortal(
            <div
              className="storage-row-action-menu storage-row-action-menu--portal"
              role="menu"
              style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
            >
              <button
                className="storage-action-option-primary"
                type="button"
                role="menuitem"
                onClick={() => handleOpenDiscount(openActionItem)}
              >
                <Percent size={12} />
                <span>Đặt giá xả hàng</span>
              </button>
              {openActionItem.clearanceActive ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleStopClearance(openActionItem)}
                >
                  Bỏ giá xả hàng
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpenActionMenu(null); setRowMenuPos(null); openTransferDraft(openActionItem); }}
              >
                Đề xuất chuyển kho
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpenActionMenu(null); setRowMenuPos(null); openVendorReturnVoucher(openActionItem); }}
              >
                Mở phiếu xuất trả NCC
              </button>
            </div>,
            document.body,
          )
        : null}

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
                <h2>Lưu giá xả hàng</h2>
                <p>Giá xả hàng riêng, không đổi giá bán chính. Giá này chỉ dùng để hiển thị/gợi ý khi bán và trên báo cáo tồn lâu.</p>
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
                <span>Mức giảm giá xả</span>
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
                <span>Giá xả hàng (không đổi giá chính)</span>
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
                <span>Ghi chú giá xả hàng</span>
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
                Lưu giá xả hàng
              </button>
            </div>
          </form>
        </div>
      )}
      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Báo cáo thời gian lưu kho"
          defaultFilename={`bao-cao-thoi-gian-luu-kho-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}

    </div>
  );
}

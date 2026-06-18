import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  Filter,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { http } from '../../core/api/http';
import './vendor-page.css';

type TabKey = 'vendors' | 'supplier-products';

type Vendor = {
  _id: string;
  code: string;
  name: string;
  type?: 'person' | 'company';
  phone?: string;
  email?: string;
  vat?: string;
  company?: string;
  address?: string;
  status?: 'active' | 'inactive';
  note?: string;
  userCreatedId?: { name?: string };
};

type Product = {
  _id: string;
  code: string;
  name: string;
  barcode?: string;
  supplierName?: string;
  parentCode?: string;
  batchCode?: string;
  vendorCode?: string;
  supplierProductCode?: string;
};

type ListResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

type VendorFilters = {
  q: string;
  code: string;
  name: string;
  phone: string;
  type: string;
  status: string;
};

type ProductFilters = {
  q: string;
  supplierName: string;
  code: string;
  parentCode: string;
};

const PAGE_SIZE = 15;

const emptyVendorFilters: VendorFilters = {
  q: '',
  code: '',
  name: '',
  phone: '',
  type: '',
  status: '',
};

const emptyProductFilters: ProductFilters = {
  q: '',
  supplierName: '',
  code: '',
  parentCode: '',
};

const emptyVendorForm = {
  code: '',
  name: '',
  type: 'company',
  phone: '',
  email: '',
  vat: '',
  company: '',
  address: '',
  status: 'active',
  note: '',
};

function listItems<T>(data: T[] | ListResponse<T>) {
  return Array.isArray(data) ? { items: data, total: data.length } : {
    items: data.items ?? [],
    total: data.total ?? data.items?.length ?? 0,
  };
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('vi-VN');
}

function escapeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-');
}

export function VendorPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('vendors');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendorTotal, setVendorTotal] = useState(0);
  const [productTotal, setProductTotal] = useState(0);
  const [vendorPage, setVendorPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [vendorFilters, setVendorFilters] = useState(emptyVendorFilters);
  const [vendorAppliedFilters, setVendorAppliedFilters] = useState(emptyVendorFilters);
  const [productFilters, setProductFilters] = useState(emptyProductFilters);
  const [productAppliedFilters, setProductAppliedFilters] = useState(emptyProductFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [vendorModal, setVendorModal] = useState<{ open: boolean; editing?: Vendor }>({ open: false });
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);
  const [assignmentModal, setAssignmentModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [assignmentProductId, setAssignmentProductId] = useState('');
  const [assignmentVendorId, setAssignmentVendorId] = useState('');
  const [assignmentProductSearch, setAssignmentProductSearch] = useState('');
  const [lookupProducts, setLookupProducts] = useState<Product[]>([]);
  const [lookupVendors, setLookupVendors] = useState<Vendor[]>([]);
  const [modalBusy, setModalBusy] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState('');
  const [exportModal, setExportModal] = useState(false);
  const [exportName, setExportName] = useState('');
  const [exportFields, setExportFields] = useState<Set<string>>(new Set());
  const [exportAllPages, setExportAllPages] = useState(true);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const currentPage = activeTab === 'vendors' ? vendorPage : productPage;
  const currentTotal = activeTab === 'vendors' ? vendorTotal : productTotal;
  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));

  const loadVendors = async (page = vendorPage, filters = vendorAppliedFilters) => {
    const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    const response = await http.get<ListResponse<Vendor>>('/vendors/vendors', { params });
    const result = listItems(response.data);
    setVendors(result.items);
    setVendorTotal(result.total);
  };

  const loadProducts = async (page = productPage, filters = productAppliedFilters) => {
    const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    const response = await http.get<ListResponse<Product>>('/products/products', { params });
    const result = listItems(response.data);
    setProducts(result.items);
    setProductTotal(result.total);
  };

  const loadCurrentTab = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'vendors') await loadVendors();
      else await loadProducts();
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không tải được dữ liệu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentTab();
  }, [activeTab, vendorPage, productPage, vendorAppliedFilters, productAppliedFilters]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (addMenuRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
      setShowAddMenu(false);
      setShowBulkMenu(false);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setOpenMenu(null);
    setShowBulkMenu(false);
  };

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    if (activeTab === 'vendors') {
      setVendorPage(1);
      setVendorAppliedFilters({ ...vendorFilters });
    } else {
      setProductPage(1);
      setProductAppliedFilters({ ...productFilters });
    }
  };

  const resetFilters = () => {
    if (activeTab === 'vendors') {
      setVendorFilters(emptyVendorFilters);
      setVendorAppliedFilters(emptyVendorFilters);
      setVendorPage(1);
    } else {
      setProductFilters(emptyProductFilters);
      setProductAppliedFilters(emptyProductFilters);
      setProductPage(1);
    }
  };

  const openVendorCreate = () => {
    setVendorForm(emptyVendorForm);
    setVendorModal({ open: true });
    setShowAddMenu(false);
  };

  const openVendorEdit = (vendor: Vendor) => {
    setVendorForm({
      code: vendor.code ?? '',
      name: vendor.name ?? '',
      type: vendor.type ?? 'company',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      vat: vendor.vat ?? '',
      company: vendor.company ?? '',
      address: vendor.address ?? '',
      status: vendor.status ?? 'active',
      note: vendor.note ?? '',
    });
    setVendorModal({ open: true, editing: vendor });
    setOpenMenu(null);
  };

  const submitVendor = async (event: FormEvent) => {
    event.preventDefault();
    setModalBusy(true);
    setError('');
    try {
      if (vendorModal.editing) await http.patch(`/vendors/vendors/${vendorModal.editing._id}`, vendorForm);
      else await http.post('/vendors/vendors', vendorForm);
      setVendorModal({ open: false });
      await loadVendors();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không lưu được nhà cung cấp.');
    } finally {
      setModalBusy(false);
    }
  };

  const removeVendor = async (vendor: Vendor) => {
    setOpenMenu(null);
    if (!window.confirm(`Xóa nhà cung cấp "${vendor.name}"?`)) return;
    setError('');
    try {
      await http.delete(`/vendors/vendors/${vendor._id}`);
      await loadVendors();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không xóa được nhà cung cấp.');
    }
  };

  const prepareAssignment = async (product?: Product) => {
    setModalBusy(true);
    setError('');
    setAssignmentModal({ open: true, product });
    setAssignmentProductId(product?._id ?? '');
    setAssignmentProductSearch(product ? `${product.code} — ${product.name}` : '');
    setAssignmentVendorId('');
    setShowAddMenu(false);
    setOpenMenu(null);
    try {
      const [vendorResponse, productResponse] = await Promise.all([
        http.get<ListResponse<Vendor>>('/vendors/vendors', { params: { limit: 5000, sort: 'name', order: 'asc' } }),
        http.get<ListResponse<Product>>('/products/products', { params: { limit: 5000, sort: 'name', order: 'asc' } }),
      ]);
      const vendorItems = listItems(vendorResponse.data).items;
      const productItems = listItems(productResponse.data).items;
      setLookupVendors(vendorItems);
      setLookupProducts(productItems);
      if (product?.supplierName) {
        const linkedVendor = vendorItems.find((vendor) => normalize(vendor.name) === normalize(product.supplierName));
        setAssignmentVendorId(linkedVendor?._id ?? '');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không tải được danh sách sản phẩm và nhà cung cấp.');
    } finally {
      setModalBusy(false);
    }
  };

  const filteredLookupProducts = useMemo(() => {
    const query = normalize(assignmentProductSearch);
    if (!query) return lookupProducts.slice(0, 100);
    return lookupProducts.filter((product) =>
      [product.code, product.barcode, product.name].some((value) => normalize(value).includes(query)),
    ).slice(0, 100);
  }, [assignmentProductSearch, lookupProducts]);

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    const vendor = lookupVendors.find((item) => item._id === assignmentVendorId);
    if (!assignmentProductId || !vendor) {
      setError('Vui lòng chọn sản phẩm và nhà cung cấp.');
      return;
    }
    setModalBusy(true);
    setError('');
    try {
      await http.patch(`/products/products/${assignmentProductId}`, { supplierName: vendor.name });
      setAssignmentModal({ open: false });
      if (activeTab === 'supplier-products') await loadProducts();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không lưu được sản phẩm nhà cung cấp.');
    } finally {
      setModalBusy(false);
    }
  };

  const unlinkProduct = async (product: Product) => {
    setOpenMenu(null);
    if (!window.confirm(`Gỡ liên kết nhà cung cấp khỏi sản phẩm "${product.name}"? Sản phẩm sẽ không bị xóa.`)) return;
    setError('');
    try {
      await http.patch(`/products/products/${product._id}`, { supplierName: '' });
      await loadProducts();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không gỡ được liên kết nhà cung cấp.');
    }
  };

  const unlinkSelected = async () => {
    setShowBulkMenu(false);
    const selectedProducts = products.filter((product) => selectedIds.has(product._id));
    if (!selectedProducts.length) {
      setError('Vui lòng chọn ít nhất một dòng.');
      return;
    }
    if (!window.confirm(`Gỡ liên kết nhà cung cấp của ${selectedProducts.length} dòng đã chọn? Sản phẩm sẽ không bị xóa.`)) return;
    setLoading(true);
    setError('');
    try {
      await Promise.all(selectedProducts.map((product) =>
        http.patch(`/products/products/${product._id}`, { supplierName: '' }),
      ));
      await loadProducts();
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không gỡ được toàn bộ các liên kết đã chọn.');
    } finally {
      setLoading(false);
    }
  };

  const openImport = () => {
    setImportFile(null);
    setImportResult('');
    setImportModal(true);
    setShowAddMenu(false);
  };

  const importSupplierProducts = async (event: FormEvent) => {
    event.preventDefault();
    if (!importFile) {
      setError('Vui lòng chọn file Excel.');
      return;
    }
    setModalBusy(true);
    setError('');
    setImportResult('');
    try {
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      const [vendorResponse, productResponse] = await Promise.all([
        http.get<ListResponse<Vendor>>('/vendors/vendors', { params: { limit: 5000 } }),
        http.get<ListResponse<Product>>('/products/products', { params: { limit: 5000 } }),
      ]);
      const allVendors = listItems(vendorResponse.data).items;
      const allProducts = listItems(productResponse.data).items;
      const vendorByIdentity = new Map<string, Vendor>();
      allVendors.forEach((vendor) => {
        [vendor.name, vendor.phone].filter(Boolean).forEach((value) => vendorByIdentity.set(normalize(value), vendor));
      });
      const productByIdentity = new Map<string, Product>();
      allProducts.forEach((product) => {
        [product.code, product.barcode, product.name].filter(Boolean).forEach((value) => productByIdentity.set(normalize(value), product));
      });

      let updated = 0;
      let skipped = 0;
      for (const row of rows) {
        const productIdentity = row['Mã/ Mã vạch/ Tên Sản phẩm'] || row['Mã SP'] || row['Mã sản phẩm'] || row['Tên SP'];
        const vendorIdentity = row['Tên/ Số điện thoại NCC'] || row['Nhà cung cấp'];
        const product = productByIdentity.get(normalize(productIdentity));
        const vendor = vendorByIdentity.get(normalize(vendorIdentity));
        if (!product || !vendor) {
          skipped++;
          continue;
        }
        await http.patch(`/products/products/${product._id}`, { supplierName: vendor.name });
        updated++;
      }
      setImportResult(`Đã cập nhật ${updated} dòng. Bỏ qua ${skipped} dòng không tìm thấy đúng sản phẩm hoặc nhà cung cấp.`);
      if (activeTab === 'supplier-products') await loadProducts();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không đọc hoặc import được file Excel.');
    } finally {
      setModalBusy(false);
    }
  };

  const currentExportColumns = activeTab === 'vendors'
    ? [
        ['code', 'Mã'],
        ['name', 'Tên nhà cung cấp'],
        ['type', 'Loại'],
        ['phone', 'Điện thoại'],
        ['email', 'Email'],
        ['address', 'Địa chỉ'],
        ['status', 'Trạng thái'],
        ['note', 'Ghi chú'],
      ]
    : [
        ['supplierName', 'Nhà cung cấp'],
        ['code', 'Mã SP'],
        ['barcode', 'Mã vạch'],
        ['name', 'Tên SP'],
        ['batchCode', 'Lô hàng'],
        ['vendorCode', 'Mã NCC'],
        ['supplierProductCode', 'Mã sản phẩm NCC'],
      ];

  const openExport = () => {
    setExportFields(new Set(currentExportColumns.map(([key]) => key)));
    setExportName(activeTab === 'vendors' ? 'Danh-sach-nha-cung-cap' : 'San-pham-nha-cung-cap');
    setExportAllPages(true);
    setExportModal(true);
    setShowBulkMenu(false);
  };

  const exportData = async () => {
    const columns = currentExportColumns.filter(([key]) => exportFields.has(key));
    if (!columns.length) {
      setError('Vui lòng chọn ít nhất một cột để xuất.');
      return;
    }
    setModalBusy(true);
    setError('');
    try {
      let source: Array<Vendor | Product> = activeTab === 'vendors' ? vendors : products;
      if (exportAllPages) {
        const filters = activeTab === 'vendors' ? vendorAppliedFilters : productAppliedFilters;
        const params: Record<string, string | number> = { page: 1, limit: 5000 };
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        const endpoint = activeTab === 'vendors' ? '/vendors/vendors' : '/products/products';
        const response = await http.get<ListResponse<Vendor | Product>>(endpoint, { params });
        source = listItems(response.data).items;
      }
      const rows = source.map((item: any) => Object.fromEntries(columns.map(([key, label]) => {
        let value = item[key] ?? '';
        if (key === 'type') value = value === 'person' ? 'Cá nhân' : value === 'company' ? 'Công ty' : value;
        if (key === 'status') value = value === 'active' ? 'Hoạt động' : value === 'inactive' ? 'Ngừng hoạt động' : value;
        return [label, value];
      })));
      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, activeTab === 'vendors' ? 'Nhà cung cấp' : 'Sản phẩm NCC');
      XLSX.writeFile(workbook, `${escapeFileName(exportName) || 'xuat-du-lieu'}.xlsx`);
      setExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không xuất được dữ liệu.');
    } finally {
      setModalBusy(false);
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const currentRows = activeTab === 'vendors' ? vendors : products;
  const allCurrentSelected = currentRows.length > 0 && currentRows.every((item) => selectedIds.has(item._id));

  const changePage = (page: number) => {
    const next = Math.min(Math.max(page, 1), totalPages);
    if (activeTab === 'vendors') setVendorPage(next);
    else setProductPage(next);
  };

  return (
    <div className="supplier-page">
      <div className="supplier-tabs" role="tablist" aria-label="Quản lý nhà cung cấp">
        <button className={activeTab === 'vendors' ? 'active' : ''} type="button" onClick={() => switchTab('vendors')}>Nhà cung cấp</button>
        <button className={activeTab === 'supplier-products' ? 'active' : ''} type="button" onClick={() => switchTab('supplier-products')}>Sản phẩm nhà cung cấp</button>
      </div>

      <section className="supplier-workspace">
        <form className="supplier-filter-bar" onSubmit={applyFilters}>
          <div className="supplier-filter-title"><Filter size={17} /> Bộ lọc</div>
          {activeTab === 'vendors' ? (
            <div className="supplier-filter-grid vendor-filters">
              <input value={vendorFilters.q} onChange={(e) => setVendorFilters({ ...vendorFilters, q: e.target.value })} placeholder="ID hoặc từ khóa" />
              <input value={vendorFilters.name} onChange={(e) => setVendorFilters({ ...vendorFilters, name: e.target.value })} placeholder="Nhà cung cấp" />
              <input value={vendorFilters.phone} onChange={(e) => setVendorFilters({ ...vendorFilters, phone: e.target.value })} placeholder="Số điện thoại" />
              <select value={vendorFilters.type} onChange={(e) => setVendorFilters({ ...vendorFilters, type: e.target.value })}>
                <option value="">Loại</option><option value="person">Cá nhân</option><option value="company">Công ty</option>
              </select>
              <select value={vendorFilters.status} onChange={(e) => setVendorFilters({ ...vendorFilters, status: e.target.value })}>
                <option value="">Trạng thái</option><option value="active">Hoạt động</option><option value="inactive">Ngừng hoạt động</option>
              </select>
            </div>
          ) : (
            <div className="supplier-filter-grid product-filters">
              <input value={productFilters.q} onChange={(e) => setProductFilters({ ...productFilters, q: e.target.value })} placeholder="ID hoặc từ khóa" />
              <input value={productFilters.supplierName} onChange={(e) => setProductFilters({ ...productFilters, supplierName: e.target.value })} placeholder="Nhà cung cấp" />
              <input value={productFilters.parentCode} onChange={(e) => setProductFilters({ ...productFilters, parentCode: e.target.value })} placeholder="SP cha" />
              <input value={productFilters.code} onChange={(e) => setProductFilters({ ...productFilters, code: e.target.value })} placeholder="Sản phẩm" />
            </div>
          )}
          <div className="supplier-filter-actions">
            <button className="supplier-btn supplier-btn-ghost" type="button" onClick={resetFilters}>Đặt lại</button>
            <button className="supplier-btn supplier-btn-filter" type="submit"><Search size={15} /> Lọc</button>
          </div>
        </form>

        <div className="supplier-toolbar">
          <div className="supplier-toolbar-actions">
            <div className="supplier-split-button" ref={addMenuRef}>
              <button className="supplier-btn supplier-btn-add" type="button" onClick={() => prepareAssignment()}><Plus size={16} /> Thêm mới</button>
              <button
                className="supplier-btn supplier-btn-add supplier-btn-toggle"
                type="button"
                aria-label="Mở lựa chọn thêm mới"
                aria-expanded={showAddMenu}
                onClick={(event) => {
                  event.stopPropagation();
                  setShowAddMenu((value) => !value);
                  setShowBulkMenu(false);
                }}
              >
                <ChevronDown size={15} />
              </button>
              {showAddMenu && (
                <div className="supplier-dropdown supplier-add-menu">
                  <button type="button" onClick={() => prepareAssignment()}><Plus size={15} /> Thêm sản phẩm nhà cung cấp</button>
                  <button type="button" onClick={openVendorCreate}><Plus size={15} /> Thêm nhà cung cấp</button>
                  <button type="button" onClick={openImport}><Upload size={15} /> Thêm Excel</button>
                </div>
              )}
            </div>

            {activeTab === 'vendors' ? (
              <button className="supplier-btn supplier-btn-outline" type="button" onClick={openExport}><Download size={15} /> Xuất dữ liệu</button>
            ) : (
              <div className="supplier-menu-wrap">
                <button
                  className="supplier-btn supplier-btn-outline"
                  type="button"
                  aria-expanded={showBulkMenu}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowBulkMenu((value) => !value);
                    setShowAddMenu(false);
                  }}
                >
                  Thao tác <ChevronDown size={14} />
                </button>
                {showBulkMenu && (
                  <div className="supplier-dropdown supplier-bulk-menu">
                    <button type="button" onClick={openExport}><Download size={15} /> Xuất dữ liệu</button>
                    <button className="danger" type="button" onClick={unlinkSelected}><Trash2 size={15} /> Xóa các dòng đã chọn</button>
                  </div>
                )}
              </div>
            )}

            <button className="supplier-icon-btn" type="button" title="Làm mới" onClick={loadCurrentTab}><RefreshCw size={16} /></button>
          </div>
          <div className="supplier-page-summary">
            {currentTotal > 0 ? `${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, currentTotal)} / ${currentTotal}` : '0 bản ghi'}
          </div>
        </div>

        {error && (
          <div className="supplier-alert" role="alert">
            <AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => setError('')}><X size={15} /></button>
          </div>
        )}

        <div className="supplier-table-wrap">
          <table className="supplier-table">
            <thead>
              <tr>
                <th className="supplier-check-cell">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={allCurrentSelected}
                    onChange={(event) => setSelectedIds(event.target.checked ? new Set(currentRows.map((item) => item._id)) : new Set())}
                  />
                </th>
                {activeTab === 'vendors' ? (
                  <>
                    <th>Mã</th><th>Tên</th><th>Loại</th><th>Điện thoại</th><th>Người tạo</th><th>Ghi chú</th>
                    <th className="supplier-status-cell"><Check size={15} /></th>
                  </>
                ) : (
                  <>
                    <th>Nhà cung cấp</th><th>Mã SP</th><th>Mã vạch</th><th>Tên SP</th><th>Lô hàng</th><th>Mã NCC</th><th>Mã sản phẩm NCC</th>
                  </>
                )}
                <th className="supplier-action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 7 }).map((_, index) => (
                <tr className="supplier-skeleton" key={index}>
                  {Array.from({ length: 9 }).map((__, cellIndex) => <td key={cellIndex}><span /></td>)}
                </tr>
              ))}
              {!loading && currentRows.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="supplier-empty"><Inbox size={28} /><strong>Chưa có dữ liệu phù hợp</strong><span>Thử thay đổi bộ lọc hoặc thêm dữ liệu mới.</span></div>
                  </td>
                </tr>
              )}
              {!loading && activeTab === 'vendors' && vendors.map((vendor) => (
                <tr key={vendor._id}>
                  <td className="supplier-check-cell"><input type="checkbox" aria-label={`Chọn ${vendor.name}`} checked={selectedIds.has(vendor._id)} onChange={(e) => toggleSelected(vendor._id, e.target.checked)} /></td>
                  <td>{vendor.code || '—'}</td>
                  <td className="supplier-link-cell">{vendor.name || '—'}</td>
                  <td>{vendor.type === 'person' ? 'Cá nhân' : vendor.type === 'company' ? 'Công ty' : '—'}</td>
                  <td>{vendor.phone || '—'}</td>
                  <td>{vendor.userCreatedId?.name || '—'}</td>
                  <td>{vendor.note || '—'}</td>
                  <td className="supplier-status-cell">
                    <span className={`supplier-status ${vendor.status === 'inactive' ? 'inactive' : ''}`} title={vendor.status === 'inactive' ? 'Ngừng hoạt động' : 'Hoạt động'}><Check size={14} /></span>
                  </td>
                  <td className="supplier-action-cell">
                    <RowMenu id={vendor._id} openMenu={openMenu} setOpenMenu={setOpenMenu} onEdit={() => openVendorEdit(vendor)} onDelete={() => removeVendor(vendor)} />
                  </td>
                </tr>
              ))}
              {!loading && activeTab === 'supplier-products' && products.map((product) => (
                <tr key={product._id}>
                  <td className="supplier-check-cell"><input type="checkbox" aria-label={`Chọn ${product.name}`} checked={selectedIds.has(product._id)} onChange={(e) => toggleSelected(product._id, e.target.checked)} /></td>
                  <td className="supplier-link-cell">{product.supplierName || '—'}</td>
                  <td className="supplier-link-cell">{product.code || '—'}</td>
                  <td className="supplier-link-cell">{product.barcode || '—'}</td>
                  <td className="supplier-link-cell">{product.name || '—'}</td>
                  <td>{product.batchCode || '—'}</td>
                  <td>{product.vendorCode || '—'}</td>
                  <td>{product.supplierProductCode || '—'}</td>
                  <td className="supplier-action-cell">
                    <RowMenu id={product._id} openMenu={openMenu} setOpenMenu={setOpenMenu} onEdit={() => prepareAssignment(product)} onDelete={() => unlinkProduct(product)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="supplier-pagination">
          <span>Trang {currentPage} / {totalPages}</span>
          <div>
            <button type="button" aria-label="Trang đầu" disabled={currentPage === 1} onClick={() => changePage(1)}><ChevronsLeft size={15} /></button>
            <button type="button" aria-label="Trang trước" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={15} /></button>
            <button type="button" aria-label="Trang sau" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}><ChevronRight size={15} /></button>
            <button type="button" aria-label="Trang cuối" disabled={currentPage === totalPages} onClick={() => changePage(totalPages)}><ChevronsRight size={15} /></button>
          </div>
        </div>
      </section>

      {vendorModal.open && (
        <Modal title={vendorModal.editing ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp'} onClose={() => setVendorModal({ open: false })}>
          <form onSubmit={submitVendor}>
            <div className="supplier-form-grid">
              <label><span>Mã NCC *</span><input required value={vendorForm.code} onChange={(e) => setVendorForm({ ...vendorForm, code: e.target.value })} /></label>
              <label><span>Tên nhà cung cấp *</span><input required value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} /></label>
              <label><span>Loại</span><select value={vendorForm.type} onChange={(e) => setVendorForm({ ...vendorForm, type: e.target.value })}><option value="person">Cá nhân</option><option value="company">Công ty</option></select></label>
              <label><span>Trạng thái</span><select value={vendorForm.status} onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value })}><option value="active">Hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label>
              <label><span>Số điện thoại</span><input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} /></label>
              <label><span>Email</span><input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} /></label>
              <label><span>Mã số thuế</span><input value={vendorForm.vat} onChange={(e) => setVendorForm({ ...vendorForm, vat: e.target.value })} /></label>
              <label><span>Công ty</span><input value={vendorForm.company} onChange={(e) => setVendorForm({ ...vendorForm, company: e.target.value })} /></label>
              <label className="wide"><span>Địa chỉ</span><input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} /></label>
              <label className="wide"><span>Ghi chú</span><textarea rows={3} value={vendorForm.note} onChange={(e) => setVendorForm({ ...vendorForm, note: e.target.value })} /></label>
            </div>
            <ModalFooter busy={modalBusy} onCancel={() => setVendorModal({ open: false })} />
          </form>
        </Modal>
      )}

      {assignmentModal.open && (
        <Modal title={assignmentModal.product ? 'Sửa sản phẩm nhà cung cấp' : 'Thêm mới 1 sản phẩm'} onClose={() => setAssignmentModal({ open: false })} wide>
          <form onSubmit={submitAssignment}>
            <div className="supplier-assignment-note">Chọn sản phẩm có sẵn và gắn với nhà cung cấp. Dữ liệu sản phẩm gốc vẫn được giữ nguyên.</div>
            <div className="supplier-form-grid">
              <label className="wide">
                <span>Tìm sản phẩm</span>
                <div className="supplier-search-input"><Search size={15} /><input value={assignmentProductSearch} onChange={(e) => setAssignmentProductSearch(e.target.value)} placeholder="Mã, mã vạch hoặc tên sản phẩm" /></div>
              </label>
              <label className="wide">
                <span>Sản phẩm *</span>
                <select required value={assignmentProductId} onChange={(e) => setAssignmentProductId(e.target.value)} disabled={modalBusy}>
                  <option value="">Chọn sản phẩm</option>
                  {filteredLookupProducts.map((product) => <option key={product._id} value={product._id}>{product.code} — {product.name}</option>)}
                </select>
              </label>
              <label className="wide">
                <span>Nhà cung cấp *</span>
                <select required value={assignmentVendorId} onChange={(e) => setAssignmentVendorId(e.target.value)} disabled={modalBusy}>
                  <option value="">Chọn nhà cung cấp</option>
                  {lookupVendors.map((vendor) => <option key={vendor._id} value={vendor._id}>{vendor.name}{vendor.phone ? ` — ${vendor.phone}` : ''}</option>)}
                </select>
              </label>
            </div>
            <ModalFooter busy={modalBusy} onCancel={() => setAssignmentModal({ open: false })} />
          </form>
        </Modal>
      )}

      {importModal && (
        <Modal title="Import sản phẩm nhà cung cấp" onClose={() => setImportModal(false)}>
          <form onSubmit={importSupplierProducts}>
            <div className="supplier-template-box">
              <FileSpreadsheet size={18} />
              <span>Hỗ trợ cột “Mã/ Mã vạch/ Tên Sản phẩm” và “Tên/ Số điện thoại NCC”, hoặc file xuất có “Mã SP” và “Nhà cung cấp”.</span>
            </div>
            <label className="supplier-file-input">
              <Upload size={18} /><span>{importFile?.name || 'Chọn file Excel (.xlsx, .xlsm)'}</span>
              <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(e: ChangeEvent<HTMLInputElement>) => setImportFile(e.target.files?.[0] ?? null)} />
            </label>
            {importResult && <div className="supplier-import-result">{importResult}</div>}
            <ModalFooter busy={modalBusy} submitLabel="Import" onCancel={() => setImportModal(false)} />
          </form>
        </Modal>
      )}

      {exportModal && (
        <Modal title="Xuất dữ liệu" onClose={() => setExportModal(false)} wide>
          <div className="supplier-export-layout">
            <div className="supplier-export-settings">
              <label><span>Tên bảng tính</span><input value={exportName} onChange={(e) => setExportName(e.target.value)} /></label>
              <label className="supplier-export-all">
                <input type="checkbox" checked={exportAllPages} onChange={(e) => setExportAllPages(e.target.checked)} />
                <span>Xuất tất cả trang theo bộ lọc hiện tại</span>
              </label>
            </div>
            <div>
              <strong>Chọn cột dữ liệu</strong>
              <div className="supplier-export-columns">
                {currentExportColumns.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={exportFields.has(key)}
                      onChange={(e) => setExportFields((current) => {
                        const next = new Set(current);
                        if (e.target.checked) next.add(key);
                        else next.delete(key);
                        return next;
                      })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="supplier-modal-footer">
            <button className="supplier-btn supplier-btn-ghost" type="button" onClick={() => setExportModal(false)}>Đóng</button>
            <button className="supplier-btn supplier-btn-primary" type="button" disabled={modalBusy} onClick={exportData}>
              <Download size={15} /> {modalBusy ? 'Đang xuất...' : 'Xuất dữ liệu'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RowMenu({
  id,
  openMenu,
  setOpenMenu,
  onEdit,
  onDelete,
}: {
  id: string;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="supplier-row-menu">
      <button
        className="supplier-row-menu-trigger"
        type="button"
        aria-label="Mở thao tác"
        aria-expanded={openMenu === id}
        onClick={(event) => {
          event.stopPropagation();
          setOpenMenu(openMenu === id ? null : id);
        }}
      >
        <MoreHorizontal size={17} /><ChevronDown size={12} />
      </button>
      {openMenu === id && (
        <div className="supplier-dropdown supplier-row-dropdown">
          <button type="button" onClick={onEdit}><Pencil size={15} /> Sửa</button>
          <button className="danger" type="button" onClick={onDelete}><Trash2 size={15} /> Xóa</button>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="supplier-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className={`supplier-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="supplier-modal-header">
          <h2>{title}</h2>
          <button type="button" aria-label="Đóng" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="supplier-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ busy, onCancel, submitLabel = 'Lưu' }: { busy: boolean; onCancel: () => void; submitLabel?: string }) {
  return (
    <div className="supplier-modal-footer">
      <button className="supplier-btn supplier-btn-ghost" type="button" onClick={onCancel}>Hủy</button>
      <button className="supplier-btn supplier-btn-primary" type="submit" disabled={busy}>{busy ? 'Đang xử lý...' : submitLabel}</button>
    </div>
  );
}

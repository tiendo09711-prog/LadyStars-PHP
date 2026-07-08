import { useEffect, useMemo, useRef, useState } from 'react';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
import {
  Boxes,
  ChevronDown,
  Eye,
  FileDown,
  Filter,
  FolderTree,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Pagination } from '../../../core/components/Pagination';
import { productApi } from '../../../core/api/product.api';
import { listBranches } from '../../../core/api/branch.api';
import type { BranchRecord } from '../../../core/api/branch.api';
import type { ICategory, IInventory } from '../../../types/product.type';
import { ColumnOption, ExportExcelModal } from './ExportExcelModal';
import { getInventoryBranchStock } from './inventoryStock';

type EditorMode = 'create' | 'edit' | null;
type ImportMode = 'create' | 'update';

type CategoryFormValues = {
  name: string;
  code: string;
  parentId: string;
  isActive: boolean;
  url: string;
};

const CATEGORY_IMPORT_HEADERS = [
  'Danh mục cấp 1',
  'Danh mục cấp 2',
  'Danh mục cấp 3',
  'Danh mục cấp 4',
  'Hoạt động',
];

function defaultCategoryFormValues(): CategoryFormValues {
  return {
    name: '',
    code: '',
    parentId: '',
    isActive: true,
    url: '',
  };
}

function generateCategoryCode(items: ICategory[]) {
  let maxNumber = 0;
  for (const item of items) {
    const rawCode = String(item.code || '').trim().toUpperCase();
    const match = rawCode.match(/^DM-(\d+)$/);
    if (!match) continue;
    maxNumber = Math.max(maxNumber, Number(match[1]));
  }
  return `DM-${String(maxNumber + 1).padStart(4, '0')}`;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as { response?: { data?: { message?: string } }; message?: string };
  return apiError.response?.data?.message || apiError.message || fallback;
}

function formatCategoryDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('vi-VN');
}

function parseTemplateBoolean(value: string, fallback: boolean) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'co', 'c\u00f3', 'hien thi', 'hi\u1ec3n th\u1ecb', 'hoat dong', 'ho\u1ea1t \u0111\u1ed9ng', 'active'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'khong', 'kh\u00f4ng', 'an', '\u1ea9n', 'ngung', 'ng\u1eebng', 'inactive'].includes(normalized)) return false;
  return fallback;
}

export function CategoryList() {
  const [items, setItems] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewProductsCategory, setViewProductsCategory] = useState<ICategory | null>(null);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [openAddMenu, setOpenAddMenu] = useState(false);
  const [openBulkMenu, setOpenBulkMenu] = useState(false);
  const [openBulkStatusMenu, setOpenBulkStatusMenu] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editingCategory, setEditingCategory] = useState<ICategory | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<ICategory[]>([]);
  const [loadingCategoryOptions, setLoadingCategoryOptions] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('create');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = 15;

  const load = async (options?: { nextPage?: number; nextSearch?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await productApi.getCategories({
        page: options?.nextPage ?? page,
        limit,
        q: options?.nextSearch ?? search,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, 'Không thể tải danh sách danh mục.'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryOptions = async () => {
    setLoadingCategoryOptions(true);
    try {
      const res = await productApi.getCategories({ page: 1, limit: 5000 });
      setCategoryOptions(res.items || []);
    } catch (err) {
      console.error(err);
      setCategoryOptions([]);
    } finally {
      setLoadingCategoryOptions(false);
    }
  };

  useEffect(() => {
    listBranches({ page: 1, limit: 200 }).then(data => {
      setBranches((data.items || []).filter(b => b.isActive !== false));
    }).catch(() => {});
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void load();
  }, [page, refreshKey]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item._id === id)));
  }, [items]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('.categories-floating-menu')) return;
      setOpenAddMenu(false);
      setOpenBulkMenu(false);
      setOpenBulkStatusMenu(false);
      setOpenActionMenuId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'T\u00ean danh m\u1ee5c', key: 'name', getValue: (item: ICategory) => item.name },
      { label: 'M\u00e3 danh m\u1ee5c', key: 'code', getValue: (item: ICategory) => item.code || '' },
      { label: 'Tr\u1ea1ng th\u00e1i', key: 'isActive', getValue: (item: ICategory) => (item.isActive !== false ? '\u0110ang ho\u1ea1t \u0111\u1ed9ng' : 'Ng\u1eebng') },
      { label: 'S\u1ed1 s\u1ea3n ph\u1ea9m', key: 'productCount', getValue: (item: ICategory) => item.productCount || 0 },
      { label: 'Ng\u00e0y t\u1ea1o', key: 'createdAt', getValue: (item: ICategory) => formatCategoryDate(item.createdAt) },
    ],
    [],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedCols: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: ICategory[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = async (nextPage: number, nextLimit: number) =>
          productApi.getCategories({ page: nextPage, limit: nextLimit, q: search || undefined });

        const pageSize = 100;
        const firstPage = await fetchPage(1, pageSize);
        let allItems = [...firstPage.items];
        const totalItems = firstPage.total;

        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const promises = [];
          for (let pageNum = 2; pageNum <= pagesToFetch; pageNum += 1) {
            promises.push(fetchPage(pageNum, pageSize));
          }
          const results = await Promise.all(promises);
          results.forEach((res) => {
            allItems = allItems.concat(res.items);
          });
        }
        dataToExport = allItems;
      }

      const mappedData = dataToExport.map((item) => {
        const row: Record<string, unknown> = {};
        selectedCols.forEach((col) => {
          const matchingCol = exportColumns.find((column) => column.key === col.key);
          row[col.customLabel] = matchingCol ? matchingCol.getValue(item) : '';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(mappedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err) {
      console.error(err);
      alert('Xu\u1ea5t file th\u1ea5t b\u1ea1i!');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRefresh = () => {
    setSearch('');
    setPage(1);
    setError(null);
    setRefreshKey((value) => value + 1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) {
      setPage(1);
      return;
    }

    void load({ nextPage: 1 });
  };

  const openCreateEditor = async () => {
    await loadCategoryOptions();
    setEditingCategory(null);
    setEditorMode('create');
    setOpenAddMenu(false);
    setOpenBulkMenu(false);
  };

  const openEditEditor = async (item: ICategory) => {
    await loadCategoryOptions();
    setEditingCategory(item);
    setEditorMode('edit');
    setOpenActionMenuId(null);
    setOpenBulkMenu(false);
  };

  const handleDeleteCategory = async (item: ICategory) => {
    const confirmed = window.confirm(`X\u00f3a danh m\u1ee5c "${item.name}"?`);
    if (!confirmed) return;
    try {
      await productApi.deleteCategory(item._id);
      setOpenActionMenuId(null);
      await load();
    } catch (err) {
      console.error(err);
      alert('X\u00f3a danh m\u1ee5c th\u1ea5t b\u1ea1i.');
    }
  };

  const handleToggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : current.concat(id)));
  };

  const handleToggleSelectPage = (checked: boolean) => {
    setSelectedIds(checked ? items.map((item) => item._id) : []);
  };

  const handleBulkStatus = async (isActive: boolean) => {
    if (selectedIds.length === 0) {
      alert('Vui l\u00f2ng ch\u1ecdn \u00edt nh\u1ea5t m\u1ed9t danh m\u1ee5c.');
      return;
    }
    setActionLoading(true);
    try {
      const targetIds = [...selectedIds];
      const results = await Promise.allSettled(targetIds.map((id) => productApi.updateCategory(id, { isActive })));
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      setOpenBulkMenu(false);
      setOpenBulkStatusMenu(false);
      if (failed.length === 0) {
        alert(`Đã cập nhật trạng thái ${targetIds.length} danh mục.`);
      } else {
        const firstMessage = getApiErrorMessage(failed[0].reason, 'Một số danh mục cập nhật thất bại.');
        alert(`Đã cập nhật ${targetIds.length - failed.length}/${targetIds.length} danh mục. Thất bại ${failed.length}: ${firstMessage}`);
      }
      await load();
    } catch (err) {
      console.error(err);
      alert(getApiErrorMessage(err, '\u0110\u1ed5i tr\u1ea1ng th\u00e1i danh m\u1ee5c th\u1ea5t b\u1ea1i.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      alert('Vui l\u00f2ng ch\u1ecdn \u00edt nh\u1ea5t m\u1ed9t danh m\u1ee5c.');
      return;
    }
    const confirmed = window.confirm(`X\u00f3a ${selectedIds.length} danh m\u1ee5c \u0111\u00e3 ch\u1ecdn?`);
    if (!confirmed) return;
    setActionLoading(true);
    try {
      const targetIds = [...selectedIds];
      const results = await Promise.allSettled(targetIds.map((id) => productApi.deleteCategory(id)));
      const failedIds = results
        .map((result, index) => ({ result, id: targetIds[index] }))
        .filter((entry): entry is { result: PromiseRejectedResult; id: string } => entry.result.status === 'rejected');
      const failedIdSet = new Set(failedIds.map((entry) => entry.id));
      setSelectedIds(targetIds.filter((id) => failedIdSet.has(id)));
      setOpenBulkMenu(false);
      if (failedIds.length === 0) {
        alert(`Đã xóa ${targetIds.length} danh mục.`);
      } else {
        const firstMessage = getApiErrorMessage(failedIds[0].result.reason, 'Một số danh mục không thể xóa.');
        alert(`Đã xóa ${targetIds.length - failedIds.length}/${targetIds.length} danh mục. Thất bại ${failedIds.length}: ${firstMessage}`);
      }
      await load();
    } catch (err) {
      console.error(err);
      alert(getApiErrorMessage(err, 'X\u00f3a c\u00e1c d\u00f2ng \u0111\u00e3 ch\u1ecdn th\u1ea5t b\u1ea1i.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadImportTemplate = () => {
    const wb = XLSX.utils.book_new();
    const noteSheet = XLSX.utils.aoa_to_sheet([
      ['C\u00e1c l\u01b0u \u00fd khi import danh m\u1ee5c s\u1ea3n ph\u1ea9m'],
      ['1', 'Kh\u00f4ng \u0111\u1ed5i t\u00ean ho\u1eb7c th\u1ee9 t\u1ef1 c\u00e1c c\u1ed9t trong sheet Danh m\u1ee5c s\u1ea3n ph\u1ea9m'],
      ['2', 'M\u1ed7i d\u00f2ng th\u1ec3 hi\u1ec7n m\u1ed9t danh m\u1ee5c \u1edf c\u1ea5p s\u00e2u nh\u1ea5t \u0111\u01b0\u1ee3c \u0111i\u1ec1n'],
      ['3', 'Mã danh mục được hệ thống tự động tạo theo dạng DM-Số thứ tự'],
      ['4', 'C\u1ed9t Ho\u1ea1t \u0111\u1ed9ng c\u00f3 th\u1ec3 \u0111\u1ec3 tr\u1ed1ng \u0111\u1ec3 d\u00f9ng m\u1eb7c \u0111\u1ecbnh'],
    ]);
    const dataSheet = XLSX.utils.aoa_to_sheet([CATEGORY_IMPORT_HEADERS]);
    const suggestSheet = XLSX.utils.aoa_to_sheet([
      ['V\u00ed d\u1ee5'],
      ['Danh mục cấp 1', 'Danh mục cấp 2', 'Danh mục cấp 3', 'Danh mục cấp 4', 'Hoạt động'],
    ]);
    XLSX.utils.book_append_sheet(wb, noteSheet, 'Ghi ch\u00fa');
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh m\u1ee5c s\u1ea3n ph\u1ea9m');
    XLSX.utils.book_append_sheet(wb, suggestSheet, 'suggestView');
    XLSX.writeFile(wb, 'Nhanh.vn_Import_ProductCategory_template.xlsx');
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      alert('Vui l\u00f2ng ch\u1ecdn file Excel.');
      return;
    }
    setImporting(true);
    try {
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: 'array' });
      const dataSheet = workbook.Sheets[workbook.SheetNames[1]] || workbook.Sheets['Danh m\u1ee5c s\u1ea3n ph\u1ea9m'];
      if (!dataSheet) {
        alert('Kh\u00f4ng t\u00ecm th\u1ea5y sheet "Danh m\u1ee5c s\u1ea3n ph\u1ea9m" trong file import.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json<string[]>(dataSheet, { header: 1, blankrows: false, defval: '' });
      const headerRow = rows[0] || [];
      const hasCodeColumn = String(headerRow[0] || '').toLowerCase().includes('mã');
      const importRows = rows.slice(1);
      if (importRows.length === 0) {
        alert('File import kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u.');
        return;
      }

      const existingRes = await productApi.getCategories({ page: 1, limit: 5000 });
      const categoryByCode = new Map(existingRes.items.filter((item) => item.code).map((item) => [String(item.code).trim().toLowerCase(), item]));
      const categoryByName = new Map(existingRes.items.map((item) => [item.name.trim().toLowerCase(), item]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of importRows) {
        const cells = row.map((cell) => String(cell || '').trim());
        const [codeRaw, level1, level2, level3, level4, activeRaw] = hasCodeColumn
          ? cells
          : ['', cells[0], cells[1], cells[2], cells[3], cells[4]];
        const names = [level1, level2, level3, level4].filter(Boolean);
        if (names.length === 0) continue;
        const name = names[names.length - 1];
        if (!name) {
          skipped += 1;
          continue;
        }

        const parentName = names.length > 1 ? names[names.length - 2] : '';
        const parent = parentName ? categoryByName.get(parentName.toLowerCase()) : undefined;

        const payload = {
          code: codeRaw || undefined,
          name,
          parentId: parent?._id || undefined,
          isActive: parseTemplateBoolean(activeRaw, true),
        };

        const existing = codeRaw ? categoryByCode.get(codeRaw.toLowerCase()) : categoryByName.get(name.toLowerCase());

        if (importMode === 'create') {
          if (existing) {
            skipped += 1;
            continue;
          }
          const createdItem = await productApi.createCategory(payload);
          categoryByName.set(createdItem.name.trim().toLowerCase(), createdItem);
          if (createdItem.code) categoryByCode.set(String(createdItem.code).trim().toLowerCase(), createdItem);
          created += 1;
        } else {
          if (!existing) {
            skipped += 1;
            continue;
          }
          const updatedItem = await productApi.updateCategory(existing._id, payload);
          categoryByName.set(updatedItem.name.trim().toLowerCase(), updatedItem);
          if (updatedItem.code) categoryByCode.set(String(updatedItem.code).trim().toLowerCase(), updatedItem);
          updated += 1;
        }
      }

      await load();
      setShowImportModal(false);
      setImportFile(null);
      alert(`Import ho\u00e0n t\u1ea5t. T\u1ea1o m\u1edbi: ${created}, c\u1eadp nh\u1eadt: ${updated}, b\u1ecf qua: ${skipped}.`);
    } catch (err) {
      console.error(err);
      alert('Import danh m\u1ee5c t\u1eeb Excel th\u1ea5t b\u1ea1i.');
    } finally {
      setImporting(false);
    }
  };

  const allRowsSelected = items.length > 0 && selectedIds.length === items.length;
  const selectedCount = selectedIds.length;
  const activeCount = items.filter((item) => item.isActive !== false).length;
  const showingFrom = total === 0 ? 0 : (page - 1) * limit + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * limit, total);
  const hasSearch = search.trim().length > 0;

  if (editorMode) {
    return (
      <CategoryEditorPanel
        mode={editorMode}
        category={editingCategory}
        categories={categoryOptions}
        loadingCategoryOptions={loadingCategoryOptions}
        onCancel={() => {
          setEditorMode(null);
          setEditingCategory(null);
        }}
        onSaved={async () => {
          setEditorMode(null);
          setEditingCategory(null);
          await load();
        }}
      />
    );
  }

  return (
    <div className="page-stack categories-page-shell">
      <section className="data-card categories-top-card">
        <div className="categories-overview-bar">
          <span className="categories-hero-kicker">
            <Sparkles size={14} />
            <span>Danh mục sản phẩm</span>
          </span>
          <div className="categories-hero-stats" aria-label="Tổng quan danh mục hiện tại">
            <article className="categories-stat-card accent-blue">
              <div className="categories-stat-icon">
                <FolderTree size={18} />
              </div>
              <div>
                <strong>{total.toLocaleString('vi-VN')}</strong>
                <span>Tổng danh mục</span>
              </div>
            </article>
            <article className="categories-stat-card accent-green">
              <div className="categories-stat-icon">
                <Boxes size={18} />
              </div>
              <div>
                <strong>{activeCount.toLocaleString('vi-VN')}</strong>
                <span>Đang hoạt động</span>
              </div>
            </article>
          </div>
        </div>

        <div className="categories-toolbar-shell">
          <div className="categories-toolbar-simple">
            <div className="categories-toolbar-left categories-floating-menu">
              <div className="categories-split-add">
                <button className="btn categories-primary-button" type="button" onClick={openCreateEditor}>
                  <Plus size={16} />
                  <span>Thêm mới</span>
                </button>
                <button className="btn categories-primary-button categories-split-toggle" type="button" onClick={() => setOpenAddMenu((current) => !current)}>
                  <ChevronDown size={15} />
                </button>
                {openAddMenu && (
                  <div className="categories-floating-dropdown categories-add-dropdown">
                    <button className="categories-dropdown-item" type="button" onClick={() => { setOpenAddMenu(false); setShowImportModal(true); }}>
                      <Upload size={15} />
                      <span>Nhập từ Excel</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="categories-bulk-menu categories-floating-menu">
                <button className="btn categories-dropdown-button categories-bulk-trigger" type="button" onClick={() => setOpenBulkMenu((current) => !current)}>
                  <span>Thao tác</span>
                  <ChevronDown size={15} />
                </button>
                {openBulkMenu && (
                  <div className="categories-floating-dropdown categories-bulk-dropdown">
                    <button className="categories-dropdown-item" type="button" onClick={() => { setOpenBulkMenu(false); setShowExportModal(true); }}>
                      <FileDown size={15} />
                      <span>Xuất dữ liệu</span>
                    </button>
                    <div className="categories-dropdown-group">
                      <button className="categories-dropdown-item" type="button" onClick={() => setOpenBulkStatusMenu((current) => !current)}>
                        <RefreshCw size={15} />
                        <span>Đổi trạng thái</span>
                        <ChevronDown size={14} />
                      </button>
                      {openBulkStatusMenu && (
                        <div className="categories-sub-dropdown">
                          <button className="categories-dropdown-item" type="button" disabled={actionLoading} onClick={() => handleBulkStatus(true)}>Hoạt động</button>
                          <button className="categories-dropdown-item" type="button" disabled={actionLoading} onClick={() => handleBulkStatus(false)}>Ngừng hoạt động</button>
                        </div>
                      )}
                    </div>
                    <button className="categories-dropdown-item danger" type="button" disabled={actionLoading} onClick={handleDeleteSelected}>
                      <Trash2 size={15} />
                      <span>Xóa các dòng đã chọn</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <form className="categories-search-inline" onSubmit={handleSearch}>
              <div className="categories-search-field">
                <label className="categories-field-label">Tìm kiếm</label>
                <div className="search-box categories-search-box">
                  <Search size={16} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên danh mục, mã..." />
                </div>
              </div>
              <button className="btn categories-filter-button" type="submit">
                <Filter size={15} />
                <span>Lọc</span>
              </button>
              <button className="btn categories-ghost-button" type="button" onClick={handleRefresh} title="Làm mới">
                <RefreshCw size={16} />
                <span>Làm mới</span>
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="data-card categories-table-card">
        <div className="categories-table-meta">
          <span>{hasSearch ? `Tìm thấy ${total.toLocaleString('vi-VN')} kết quả` : `${total.toLocaleString('vi-VN')} danh mục`}</span>
          <div className="categories-table-summary">
            <div className="categories-summary-pill">
              <span>Hiển thị</span>
              <strong>{showingFrom.toLocaleString('vi-VN')} - {showingTo.toLocaleString('vi-VN')}</strong>
            </div>
            <div className="categories-summary-pill">
              <span>Đã chọn</span>
              <strong>{selectedCount.toLocaleString('vi-VN')}</strong>
            </div>
          </div>
        </div>

        <div className="table-scroll categories-table-scroll">
          <table className="data-table categories-data-table">
            <thead>
              <tr>
                <th className="check-cell">
                  <input type="checkbox" checked={allRowsSelected} onChange={(e) => handleToggleSelectPage(e.target.checked)} />
                </th>
                <th>Mã danh mục</th>
                <th>Tên danh mục</th>
                <th>Hoạt động</th>
                <th>Số sản phẩm</th>
                <th>Ngày tạo</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={7} className="empty-cell" style={{ color: '#b91c1c' }}>
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => (
                  <tr key={item._id}>
                    <td className="check-cell">
                      <input type="checkbox" checked={selectedIds.includes(item._id)} onChange={() => handleToggleSelected(item._id)} />
                    </td>
                    <td className="categories-code-cell">
                      <span className="categories-code-badge">{item.code || '-'}</span>
                    </td>
                    <td className="categories-name-cell">
                      <button
                        className="categories-link-button"
                        type="button"
                        onClick={() => setViewProductsCategory(item)}
                        title={'B\u1ea5m \u0111\u1ec3 xem s\u1ea3n ph\u1ea9m thu\u1ed9c danh m\u1ee5c n\u00e0y'}
                      >
                        <span className="categories-name-title">{item.name}</span>
                        <span className="categories-name-meta">{item.url?.trim() ? item.url : 'Ch\u01b0a c\u00f3 \u0111\u01b0\u1eddng d\u1eabn / URL'}</span>
                      </button>
                    </td>
                    <td>
                      <span className={`status-badge ${item.isActive !== false ? 'success' : 'danger'}`}>
                        {item.isActive !== false ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="categories-count-button"
                        type="button"
                        onClick={() => setViewProductsCategory(item)}
                        title={'B\u1ea5m \u0111\u1ec3 xem s\u1ea3n ph\u1ea9m thu\u1ed9c danh m\u1ee5c n\u00e0y'}
                      >
                        <strong>{Number(item.productCount || 0).toLocaleString('vi-VN')}</strong>
                        <span>{'S\u1ea3n ph\u1ea9m'}</span>
                      </button>
                    </td>
                    <td>{formatCategoryDate(item.createdAt)}</td>
                    <td className="action-cell">
                      <div className="categories-row-actions">
                        <div className="categories-floating-menu">
                          <button
                            className="btn categories-action-trigger"
                            type="button"
                            onClick={() => setOpenActionMenuId((current) => (current === item._id ? null : item._id))}
                            aria-expanded={openActionMenuId === item._id}
                            aria-haspopup="menu"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          {openActionMenuId === item._id && (
                            <div className="categories-action-dropdown" role="menu">
                              <button
                                className="categories-action-item categories-view-button"
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  setViewProductsCategory(item);
                                }}
                              >
                                <Eye size={14} />
                                <span>Xem sản phẩm</span>
                              </button>
                              <button
                                className="categories-action-item categories-muted-action"
                                type="button"
                                role="menuitem"
                                onClick={() => openEditEditor(item)}
                              >
                                <span>Sửa</span>
                              </button>
                              <button
                                className="categories-action-item categories-delete-button"
                                type="button"
                                role="menuitem"
                                onClick={() => handleDeleteCategory(item)}
                              >
                                <Trash2 size={14} />
                                <span>Xóa</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="categories-pagination-wrap">
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </div>
      </section>

      {showExportModal && (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Danh mục sản phẩm"
          defaultFilename={`danh-muc-san-pham-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      )}

      {showImportModal && (
        <CategoryImportModal
          importMode={importMode}
          importing={importing}
          importFile={importFile}
          onChangeImportMode={setImportMode}
          onClose={() => {
            setShowImportModal(false);
            setImportFile(null);
          }}
          onDownloadTemplate={handleDownloadImportTemplate}
          onFileChange={setImportFile}
          onSubmit={handleImportSubmit}
        />
      )}

      {viewProductsCategory && <CategoryProductsModal category={viewProductsCategory} onClose={() => setViewProductsCategory(null)} />}
    </div>
  );
}

type CategoryEditorPanelProps = {
  mode: 'create' | 'edit';
  category: ICategory | null;
  categories: ICategory[];
  loadingCategoryOptions: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
};

function CategoryEditorPanel({ mode, category, categories, loadingCategoryOptions, onCancel, onSaved }: CategoryEditorPanelProps) {
  const [form, setForm] = useState<CategoryFormValues>(() => ({
    ...defaultCategoryFormValues(),
    name: category?.name || '',
    code: category?.code || '',
    parentId: category?.parentId || '',
    isActive: category?.isActive !== false,
    url: category?.url || '',
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== 'create' || form.code.trim()) return;
    setForm((current) => {
      if (current.code.trim()) return current;
      return { ...current, code: generateCategoryCode(categories) };
    });
  }, [categories, form.code, mode]);

  const parentOptions = categories.filter((item) => item._id !== category?._id);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Tên danh mục là bắt buộc.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        parentId: form.parentId || undefined,
        isActive: form.isActive,
        url: form.url.trim() || undefined,
      };

      if (mode === 'create') {
        await productApi.createCategory(payload);
      } else if (category) {
        await productApi.updateCategory(category._id, payload);
      }

      await onSaved();
    } catch (err) {
      console.error(err);
      alert(mode === 'create' ? 'Thêm mới danh mục thất bại.' : 'Cập nhật danh mục thất bại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="page-stack categories-editor-shell" onSubmit={handleSave}>
      <section className="data-card categories-editor-header">
        <div>
          <span className="categories-editor-kicker">{mode === 'create' ? 'Thêm mới danh mục' : 'Chỉnh sửa danh mục'}</span>
          <h2>{mode === 'create' ? 'Tạo danh mục sản phẩm mới' : `Cập nhật danh mục: ${category?.name || ''}`}</h2>
          <p>Điền các thông tin cần thiết rồi lưu để cập nhật danh mục sản phẩm.</p>
        </div>
        <div className="categories-editor-header-actions">
          <button className="btn categories-ghost-button" type="button" onClick={onCancel}>
            Hủy
          </button>
          <button className="btn categories-primary-button" type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </section>

      <div className="categories-editor-grid">
        <section className="data-card categories-editor-card">
          <div className="categories-editor-card-title">Thông tin</div>
          <div className="categories-form-grid">
            <label className="categories-form-field">
              <span>Tên *</span>
              <input className="form-control" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </label>
            <label className="categories-form-field">
              <span>Mã</span>
              <input className="form-control" value={form.code} readOnly={mode === 'create'} placeholder="Tự động tạo DM-xxxx" onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))} />
            </label>
            <label className="categories-form-field categories-form-field-wide">
              <span>Chọn danh mục cha</span>
              <select
                className="form-control"
                value={form.parentId}
                onChange={(e) => setForm((current) => ({ ...current, parentId: e.target.value }))}
                disabled={loadingCategoryOptions}
              >
                <option value="">{loadingCategoryOptions ? 'Đang tải danh mục...' : 'Không có danh mục cha'}</option>
                {parentOptions.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="categories-form-field">
              <span>Trạng thái</span>
              <select
                className="form-control"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.value === 'active' }))}
              >
                <option value="active">Hoạt động</option>
                <option value="inactive">Ngừng hoạt động</option>
              </select>
            </label>
            <label className="categories-form-field categories-form-field-wide">
              <span>Đường dẫn / URL</span>
              <input className="form-control" value={form.url} onChange={(e) => setForm((current) => ({ ...current, url: e.target.value }))} />
            </label>
          </div>
        </section>

        <section className="data-card categories-editor-card categories-editor-help-card">
          <div className="categories-editor-card-title">Gợi ý nhập liệu</div>
          <ul className="categories-editor-help-list">
            <li>Tên danh mục là thông tin bắt buộc.</li>
            <li>Nếu cần phân cấp, hãy chọn danh mục cha trước khi lưu.</li>
            <li>Trạng thái và hiển thị được lưu trực tiếp vào danh mục.</li>
            <li>Nhập từ Excel sử dụng đúng định dạng file mẫu đã cung cấp.</li>
          </ul>
        </section>
      </div>
    </form>
  );
}

type CategoryImportModalProps = {
  importMode: ImportMode;
  importing: boolean;
  importFile: File | null;
  onChangeImportMode: (mode: ImportMode) => void;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
};

function CategoryImportModal({
  importMode,
  importing,
  importFile,
  onChangeImportMode,
  onClose,
  onDownloadTemplate,
  onFileChange,
  onSubmit,
}: CategoryImportModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card categories-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header categories-import-header">
          <div>
            <h2>Nhập danh mục sản phẩm từ Excel</h2>
            <p>Nhập file Excel để thêm mới hoặc cập nhật danh sách danh mục. Mã danh mục được tạo tự động.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={importing}>
            <X size={18} />
          </button>
        </div>

        <div className="categories-import-body">
          <div className="categories-import-dropzone">
            <UploadCloud size={34} />
            <div>
              <strong>{importFile ? importFile.name : 'Chọn file Excel (.xlsx, .xls, .csv)'}</strong>
              <span>Nhấn để chọn file cần import</span>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            />
          </div>

          <div className="categories-import-helper">
            <strong>File import mẫu</strong>
            <span>File mẫu không cần cột mã danh mục. Hệ thống sẽ tự sinh mã theo dạng DM-Số thứ tự.</span>
            <button className="btn btn-light" type="button" onClick={onDownloadTemplate} disabled={importing}>
              Tải file Excel mẫu
            </button>
          </div>

          <div className="categories-import-mode">
            <label>
              <input type="radio" checked={importMode === 'create'} onChange={() => onChangeImportMode('create')} />
              <span>Thêm mới danh mục</span>
            </label>
            <label>
              <input type="radio" checked={importMode === 'update'} onChange={() => onChangeImportMode('update')} />
              <span>Cập nhật danh mục</span>
            </label>
          </div>
        </div>

        <div className="modal-footer categories-import-footer">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={importing}>Hủy</button>
          <button className="btn categories-primary-button" type="button" onClick={onSubmit} disabled={importing || !importFile}>
            {importing ? 'Đang xử lý...' : 'Upload và nhập'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CategoryProductsModalProps {
  category: ICategory;
  onClose: () => void;
}

function CategoryProductsModal({ category, onClose }: CategoryProductsModalProps) {
  const [items, setItems] = useState<IInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const limit = 10;

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError(null);
    try {
      const res = await productApi.getInventories({
        page: nextPage,
        limit,
        q: nextSearch || undefined,
        categoryId: category._id,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
      setError(getApiErrorMessage(err, 'Không thể tải sản phẩm của danh mục.'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listBranches({ page: 1, limit: 200 }).then(data => {
      setBranches((data.items || []).filter(b => b.isActive !== false));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    void load();
  }, [page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) {
      setPage(1);
      return;
    }

    void load(1, search);
  };

  const modalSearchRef = useRef<HTMLInputElement>(null);
  useProductScanTarget(modalSearchRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    setSearch(query);
    setPage(1);
  });

  const formatMoney = (val?: number) => `${Number(val || 0).toLocaleString('vi-VN')} đ`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide categories-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header categories-modal-header">
          <div>
            <span className="categories-modal-kicker">Sản phẩm thuộc danh mục</span>
            <h2>{category.name}</h2>
            <p>Tổng số: <strong>{total}</strong> sản phẩm thuộc danh mục này.</p>
          </div>
          <button className="icon-button categories-modal-close" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="categories-modal-body">
          <div className="categories-modal-search-row">
            <form className="categories-modal-search-form" onSubmit={handleSearch}>
              <div className="search-box categories-search-box">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  ref={modalSearchRef}
                  data-product-search-scan="true" data-product-search-primary="true" placeholder="Tìm sản phẩm trong danh mục..."
                />
              </div>
            </form>
          </div>

          <div className="table-scroll categories-modal-table-scroll">
            <table className="data-table categories-modal-table">
              <thead>
                <tr>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Giá nhập</th>
                  <th>Giá bán</th>
                  {branches.map(b => (
                    <th key={b._id}>{b.name}</th>
                  ))}
                  <th>Tổng tồn</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5 + branches.length} className="empty-cell">
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={5 + branches.length} className="empty-cell" style={{ color: '#b91c1c' }}>
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && items.length === 0 && (
                  <tr>
                    <td colSpan={5 + branches.length} className="empty-cell">
                      Không có sản phẩm nào thuộc danh mục này.
                    </td>
                  </tr>
                )}
                {!loading &&
                  items.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <strong className="categories-modal-code">{item.code}</strong>
                      </td>
                      <td className="categories-modal-name" title={item.name}>
                        {item.name}
                      </td>
                      <td className="categories-modal-money categories-modal-cost">{formatMoney(item.cost)}</td>
                      <td className="categories-modal-money categories-modal-price">{formatMoney(item.price)}</td>
                      {branches.map(b => (
                        <td key={b._id} className="categories-modal-stock">
                          {Number(getInventoryBranchStock(item, b)).toLocaleString('vi-VN')}
                        </td>
                      ))}
                      <td className="categories-modal-stock categories-modal-total">
                        <strong>{Number(item.totalStock || 0).toLocaleString('vi-VN')}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="categories-modal-pagination">
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </div>
        </div>

        <div className="modal-footer categories-modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}




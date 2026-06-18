import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, FileDown, Filter, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Pagination } from '../../../core/components/Pagination';
import { productApi } from '../../../core/api/product.api';
import type { ICategory, IInventory } from '../../../types/product.type';
import { ColumnOption, ExportExcelModal } from './ExportExcelModal';

type EditorMode = 'create' | 'edit' | null;
type ImportMode = 'create' | 'update';

type CategoryFormValues = {
  name: string;
  code: string;
  parentId: string;
  isActive: boolean;
  isVisible: boolean;
  url: string;
};

const CATEGORY_IMPORT_HEADERS = ['Mã danh mục', 'Danh mục cấp 1', 'Danh mục cấp 2', 'Danh mục cấp 3', 'Danh mục cấp 4', 'Hoạt động', 'Hiển thị'];

function defaultCategoryFormValues(): CategoryFormValues {
  return {
    name: '',
    code: '',
    parentId: '',
    isActive: true,
    isVisible: true,
    url: '',
  };
}

function parseTemplateBoolean(value: string, fallback: boolean) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'co', 'có', 'hien thi', 'hiển thị', 'hoat dong', 'hoạt động', 'active'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'khong', 'không', 'an', 'ẩn', 'ngung', 'ngừng', 'inactive'].includes(normalized)) return false;
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

  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getCategories({ page, limit, q: search });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryOptions = async () => {
    setLoadingCategoryOptions(true);
    try {
      const res = await productApi.getCategories({ page: 1, limit: 5000 });
      setCategoryOptions(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCategoryOptions(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

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
      { label: 'Tên danh mục', key: 'name', getValue: (item: ICategory) => item.name },
      { label: 'Mã danh mục', key: 'code', getValue: (item: ICategory) => item.code || '' },
      { label: 'Trạng thái', key: 'isActive', getValue: (item: ICategory) => (item.isActive !== false ? 'Đang hoạt động' : 'Ngừng') },
      { label: 'Hiển thị', key: 'isVisible', getValue: (item: ICategory) => (item.isVisible !== false ? 'Có' : 'Không') },
      { label: 'Số sản phẩm', key: 'productCount', getValue: (item: ICategory) => item.productCount || 0 },
      { label: 'Ngày tạo', key: 'createdAt', getValue: (item: ICategory) => new Date(item.createdAt).toLocaleDateString('vi-VN') },
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
      alert('Xuất file thất bại!');
    } finally {
      setExportLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
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
    const confirmed = window.confirm(`Xóa danh mục "${item.name}"?`);
    if (!confirmed) return;
    try {
      await productApi.deleteCategory(item._id);
      setOpenActionMenuId(null);
      await load();
    } catch (err) {
      console.error(err);
      alert('Xóa danh mục thất bại.');
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
      alert('Vui lòng chọn ít nhất một danh mục.');
      return;
    }
    setActionLoading(true);
    try {
      await Promise.all(selectedIds.map((id) => productApi.updateCategory(id, { isActive })));
      setOpenBulkMenu(false);
      setOpenBulkStatusMenu(false);
      await load();
    } catch (err) {
      console.error(err);
      alert('Đổi trạng thái danh mục thất bại.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      alert('Vui lòng chọn ít nhất một danh mục.');
      return;
    }
    const confirmed = window.confirm(`Xóa ${selectedIds.length} danh mục đã chọn?`);
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await Promise.all(selectedIds.map((id) => productApi.deleteCategory(id)));
      setSelectedIds([]);
      setOpenBulkMenu(false);
      await load();
    } catch (err) {
      console.error(err);
      alert('Xóa các dòng đã chọn thất bại.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadImportTemplate = () => {
    const wb = XLSX.utils.book_new();
    const noteSheet = XLSX.utils.aoa_to_sheet([
      ['Các lưu ý khi import danh mục sản phẩm'],
      ['1', 'Không đổi tên hoặc thứ tự các cột trong sheet Danh mục sản phẩm'],
      ['2', 'Mỗi dòng thể hiện một danh mục ở cấp sâu nhất được điền'],
      ['3', 'Có thể dùng cột Mã danh mục để cập nhật dữ liệu có sẵn'],
      ['4', 'Cột Hoạt động và Hiển thị có thể để trống để dùng mặc định'],
    ]);
    const dataSheet = XLSX.utils.aoa_to_sheet([CATEGORY_IMPORT_HEADERS]);
    const suggestSheet = XLSX.utils.aoa_to_sheet([
      ['Ví dụ'],
      ['Mã danh mục', 'Danh mục cấp 1', 'Danh mục cấp 2', 'Danh mục cấp 3', 'Danh mục cấp 4', 'Hoạt động', 'Hiển thị'],
    ]);
    XLSX.utils.book_append_sheet(wb, noteSheet, 'Ghi chú');
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh mục sản phẩm');
    XLSX.utils.book_append_sheet(wb, suggestSheet, 'suggestView');
    XLSX.writeFile(wb, 'Nhanh.vn_Import_ProductCategory_template.xlsx');
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      alert('Vui lòng chọn file Excel.');
      return;
    }
    setImporting(true);
    try {
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: 'array' });
      const dataSheet = workbook.Sheets[workbook.SheetNames[1]] || workbook.Sheets['Danh mục sản phẩm'];
      if (!dataSheet) {
        alert('Không tìm thấy sheet "Danh mục sản phẩm" trong file import.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json<string[]>(dataSheet, { header: 1, blankrows: false, defval: '' });
      const importRows = rows.slice(1);
      if (importRows.length === 0) {
        alert('File import không có dữ liệu.');
        return;
      }

      const existingRes = await productApi.getCategories({ page: 1, limit: 5000 });
      const categoryByCode = new Map(existingRes.items.filter((item) => item.code).map((item) => [String(item.code).trim().toLowerCase(), item]));
      const categoryByName = new Map(existingRes.items.map((item) => [item.name.trim().toLowerCase(), item]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of importRows) {
        const [codeRaw, level1, level2, level3, level4, activeRaw, visibleRaw] = row.map((cell) => String(cell || '').trim());
        const names = [level1, level2, level3, level4].filter(Boolean);
        if (!codeRaw && names.length === 0) continue;
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
          isVisible: parseTemplateBoolean(visibleRaw, true),
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
      alert(`Import hoàn tất. Tạo mới: ${created}, cập nhật: ${updated}, bỏ qua: ${skipped}.`);
    } catch (err) {
      console.error(err);
      alert('Import danh mục từ Excel thất bại.');
    } finally {
      setImporting(false);
    }
  };

  const allRowsSelected = items.length > 0 && selectedIds.length === items.length;

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
      <section className="data-card categories-top-card compact">
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
                    <span>Nhập từ excel</span>
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
                        <button className="categories-dropdown-item" type="button" disabled={actionLoading} onClick={() => handleBulkStatus(true)}>
                          Hoạt động
                        </button>
                        <button className="categories-dropdown-item" type="button" disabled={actionLoading} onClick={() => handleBulkStatus(false)}>
                          Ngừng
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="categories-dropdown-item" type="button" onClick={() => { setOpenBulkMenu(false); alert('Chức năng xóa cache hiện chưa được cấu hình.'); }}>
                    <Trash2 size={15} />
                    <span>Xóa cache</span>
                  </button>
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
          </form>
        </div>
      </section>

      <section className="data-card categories-table-card">
        <div className="data-card-header categories-table-header compact">
          <div>
            <h2>Danh mục sản phẩm</h2>
            <p className="categories-table-subtitle">{total.toLocaleString('vi-VN')} bản ghi đang hiển thị. Chọn nhiều dòng để đổi trạng thái hoặc xóa hàng loạt.</p>
          </div>
          <div className="categories-secondary-actions">
            <button className="btn categories-ghost-button" type="button" onClick={load} title="Làm mới">
              <RefreshCw size={16} />
              <span>Làm mới</span>
            </button>
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
                <th>Hiển thị</th>
                <th>Số sản phẩm</th>
                <th>Ngày tạo</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
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
                        title="Bấm để xem sản phẩm thuộc danh mục này"
                      >
                        {item.name}
                      </button>
                    </td>
                    <td>
                      <span className={`status-badge ${item.isActive !== false ? 'success' : 'danger'}`}>
                        {item.isActive !== false ? 'Đang hoạt động' : 'Ngừng'}
                      </span>
                    </td>
                    <td>
                      <span className={`categories-visibility-chip ${item.isVisible !== false ? 'visible' : 'hidden'}`}>
                        {item.isVisible !== false ? 'Có' : 'Không'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="categories-count-button"
                        type="button"
                        onClick={() => setViewProductsCategory(item)}
                        title="Bấm để xem sản phẩm thuộc danh mục này"
                      >
                        {item.productCount || 0}
                      </button>
                    </td>
                    <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="action-cell">
                      <div className="categories-row-actions categories-floating-menu">
                        <button
                          className="btn categories-action-trigger"
                          type="button"
                          onClick={() => setOpenActionMenuId((current) => (current === item._id ? null : item._id))}
                          aria-expanded={openActionMenuId === item._id}
                          aria-haspopup="menu"
                        >
                          <span>Thao tác</span>
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
    isVisible: category?.isVisible !== false,
    url: category?.url || '',
  }));
  const [saving, setSaving] = useState(false);

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
        isVisible: form.isVisible,
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
          <p>Màn hình này dùng đúng các trường backend hiện có để đảm bảo lưu danh mục chạy được ngay trên hệ thống hiện tại.</p>
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
              <input className="form-control" value={form.code} onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))} />
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
              <span>Hiển thị</span>
              <select
                className="form-control"
                value={form.isVisible ? 'visible' : 'hidden'}
                onChange={(e) => setForm((current) => ({ ...current, isVisible: e.target.value === 'visible' }))}
              >
                <option value="visible">Có</option>
                <option value="hidden">Không</option>
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
                <option value="inactive">Ngừng</option>
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
            <li>Tên danh mục là bắt buộc và đang được backend kiểm tra duy nhất.</li>
            <li>Nếu cần phân cấp, hãy chọn danh mục cha trước khi lưu.</li>
            <li>Trạng thái và hiển thị sẽ được lưu trực tiếp qua API danh mục hiện có.</li>
            <li>Nhập từ Excel ở màn danh sách sẽ dùng đúng format file mẫu bạn đã cung cấp.</li>
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
          <h2>Import danh mục sản phẩm từ excel</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="categories-import-body">
          <button className="categories-template-link" type="button" onClick={onDownloadTemplate}>
            Tải file mẫu Excel Excel 2003 hoặc cho Excel 2007 trở lên
          </button>

          <label className="categories-import-file-field">
            <span>Chọn file</span>
            <input type="file" accept=".xls,.xlsx,.xlsm" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
            <strong>{importFile?.name || 'No file chosen'}</strong>
          </label>

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
          <button className="btn categories-primary-button" type="button" onClick={onSubmit} disabled={importing}>
            {importing ? 'Đang lưu...' : 'Lưu'}
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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getInventories({
        page,
        limit,
        q: search || undefined,
        categoryId: category._id,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const formatMoney = (val?: number) => `${Number(val || 0).toLocaleString('vi-VN')} đ`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide categories-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header categories-modal-header">
          <div>
            <span className="categories-modal-kicker">Category Products</span>
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
                  placeholder="Tìm sản phẩm trong danh mục..."
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
                  <th>Kho Hà Nội</th>
                  <th>Kho HCM</th>
                  <th>Tổng tồn</th>
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
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
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
                      <td className="categories-modal-stock categories-modal-hanoi">{Number(item.stockHanoi || 0).toLocaleString('vi-VN')}</td>
                      <td className="categories-modal-stock categories-modal-hcm">{Number(item.stockHCM || 0).toLocaleString('vi-VN')}</td>
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

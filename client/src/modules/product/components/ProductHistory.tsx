import { useEffect, useMemo, useState } from 'react';
import { Clock3, FileDown, Filter, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { productApi } from '../../../core/api/product.api';
import { Pagination } from '../../../core/components/Pagination';
import type { IProductHistory } from '../../../types/product.type';
import { ExportExcelModal, type ColumnOption } from './ExportExcelModal';

interface HistoryFilters {
  search: string;
  logType: string;
  logAction: string;
  createdBy: string;
  fromDate: string;
  toDate: string;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'vi'));
}

export function ProductHistory() {
  const [items, setItems] = useState<IProductHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftFilters, setDraftFilters] = useState<HistoryFilters>({
    search: '',
    logType: '',
    logAction: '',
    createdBy: '',
    fromDate: '',
    toDate: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<HistoryFilters>({
    search: '',
    logType: '',
    logAction: '',
    createdBy: '',
    fromDate: '',
    toDate: '',
  });
  const [filterOptions, setFilterOptions] = useState<{
    logTypes: string[];
    logActions: string[];
    editors: string[];
  }>({
    logTypes: [],
    logActions: [],
    editors: [],
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const limit = 20;

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã SP', key: 'productCode', getValue: (item: IProductHistory) => item.productCode || '' },
      { label: 'Tên sản phẩm', key: 'productName', getValue: (item: IProductHistory) => item.productName || '' },
      { label: 'Loại log', key: 'logType', getValue: (item: IProductHistory) => item.logType || '' },
      { label: 'Kiểu log', key: 'logAction', getValue: (item: IProductHistory) => item.logAction || '' },
      { label: 'Người thao tác', key: 'createdBy', getValue: (item: IProductHistory) => item.createdBy || '' },
      {
        label: 'Thời gian',
        key: 'createdAt',
        getValue: (item: IProductHistory) => new Date(item.createdAt).toLocaleString('vi-VN'),
      },
    ],
    [],
  );

  const load = async () => {
    setLoading(true);

    try {
      const response = await productApi.getProductLogs({
        page,
        limit,
        q: appliedFilters.search || undefined,
        logType: appliedFilters.logType || undefined,
        logAction: appliedFilters.logAction || undefined,
        createdBy: appliedFilters.createdBy || undefined,
        fromDate: appliedFilters.fromDate || undefined,
        toDate: appliedFilters.toDate || undefined,
      });

      setItems(response.items);
      setTotal(response.total);

      setFilterOptions((current) => ({
        logTypes: uniqueSorted(current.logTypes.concat(response.items.map((item) => item.logType || ''))),
        logActions: uniqueSorted(current.logActions.concat(response.items.map((item) => item.logAction || ''))),
        editors: uniqueSorted(current.editors.concat(response.items.map((item) => item.createdBy || ''))),
      }));
    } catch (error) {
      console.error('Lỗi tải lịch sử sản phẩm:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, appliedFilters]);

  const handleApplyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({
      ...draftFilters,
      search: draftFilters.search.trim(),
    });
  };

  const handleReset = () => {
    const emptyFilters: HistoryFilters = {
      search: '',
      logType: '',
      logAction: '',
      createdBy: '',
      fromDate: '',
      toDate: '',
    };

    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);

    try {
      let dataToExport: IProductHistory[] = [];

      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const pageSize = 100;
        const firstPage = await productApi.getProductLogs({
          page: 1,
          limit: pageSize,
          q: appliedFilters.search || undefined,
          logType: appliedFilters.logType || undefined,
          logAction: appliedFilters.logAction || undefined,
          createdBy: appliedFilters.createdBy || undefined,
          fromDate: appliedFilters.fromDate || undefined,
          toDate: appliedFilters.toDate || undefined,
        });

        let allItems = [...firstPage.items];
        const pagesToFetch = Math.ceil(firstPage.total / pageSize);

        if (pagesToFetch > 1) {
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) =>
              productApi.getProductLogs({
                page: index + 2,
                limit: pageSize,
                q: appliedFilters.search || undefined,
                logType: appliedFilters.logType || undefined,
                logAction: appliedFilters.logAction || undefined,
                createdBy: appliedFilters.createdBy || undefined,
                fromDate: appliedFilters.fromDate || undefined,
                toDate: appliedFilters.toDate || undefined,
              }),
            ),
          );

          responses.forEach((response) => {
            allItems = allItems.concat(response.items);
          });
        }

        dataToExport = allItems;
      }

      const mappedRows = dataToExport.map((item) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((column) => {
          const exportColumn = exportColumns.find((option) => option.key === column.key);
          row[column.customLabel] = exportColumn ? exportColumn.getValue(item) : '';
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (error) {
      console.error('Lỗi xuất Excel lịch sử sản phẩm:', error);
      alert('Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    return Object.values(appliedFilters).filter(Boolean).length;
  }, [appliedFilters]);

  return (
    <div className="products-panel">
      <section className="products-control-card">
        <div className="products-control-top">
          <div className="products-title-stack">
            <h2>Lịch sử sửa/xóa sản phẩm</h2>
            <p>Tất cả dữ liệu đang lấy từ audit log hiện có, không thay đổi nghiệp vụ ghi nhận log.</p>
            <div className="products-stat-row">
              <span className="record-badge">{total.toLocaleString('vi-VN')} bản ghi</span>
              <span className="products-stat-chip">
                <Clock3 size={14} />
                Trang {page} / {Math.max(1, Math.ceil(total / limit))}
              </span>
              <span className="products-stat-chip">
                <Filter size={14} />
                {activeFilterCount} bộ lọc đang áp dụng
              </span>
            </div>
          </div>

          <div className="products-action-row">
            <button className="btn btn-light" type="button" onClick={() => void load()}>
              <RefreshCw size={15} />
              Làm mới
            </button>
            <button
              className="btn btn-light"
              type="button"
              style={{ borderColor: '#bbf7d0', color: '#047857' }}
              onClick={() => setShowExportModal(true)}
            >
              <FileDown size={15} />
              Xuất Excel
            </button>
          </div>
        </div>

        <form className="products-filter-form" onSubmit={handleApplyFilters}>
          <div className="products-filter-grid products-grid-history">
            <label className="products-inline-field">
              <span>Sản phẩm</span>
              <div className="products-inline-control">
                <Search size={16} />
                <input
                  value={draftFilters.search}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Mã hoặc tên sản phẩm..."
                />
              </div>
            </label>

            <label className="products-inline-field">
              <span>Loại log</span>
              <div className="products-inline-control">
                <select
                  value={draftFilters.logType}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, logType: event.target.value }))}
                >
                  <option value="">Tất cả</option>
                  {filterOptions.logTypes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="products-inline-field">
              <span>Kiểu log</span>
              <div className="products-inline-control">
                <select
                  value={draftFilters.logAction}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, logAction: event.target.value }))}
                >
                  <option value="">Tất cả</option>
                  {filterOptions.logActions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="products-inline-field">
              <span>Người sửa</span>
              <div className="products-inline-control">
                <select
                  value={draftFilters.createdBy}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, createdBy: event.target.value }))}
                >
                  <option value="">Tất cả</option>
                  {filterOptions.editors.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="products-inline-field">
              <span>Từ ngày</span>
              <div className="products-inline-control">
                <input
                  type="date"
                  value={draftFilters.fromDate}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))}
                />
              </div>
            </label>

            <label className="products-inline-field">
              <span>Đến ngày</span>
              <div className="products-inline-control">
                <input
                  type="date"
                  value={draftFilters.toDate}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, toDate: event.target.value }))}
                />
              </div>
            </label>

            <button className="btn btn-primary products-filter-submit" type="submit">
              <Search size={15} />
              Lọc
            </button>

            <button className="btn btn-light products-filter-submit" type="button" onClick={handleReset}>
              Reset
            </button>
          </div>

          <div className="products-filter-note">
            <p>
              Danh sách tùy chọn <strong>Người sửa</strong>, <strong>Loại log</strong> và <strong>Kiểu log</strong> hiện đã
              lấy động từ dữ liệu log, không còn seed cứng một người cố định.
            </p>
          </div>
        </form>
      </section>

      <section className="products-table-card">
        <div className="products-table-topbar">
          <div>
            <strong>Bảng lịch sử thay đổi</strong>
            <span>Dữ liệu được đọc từ endpoint log cũ và vẫn giữ nguyên cách lọc theo backend hiện tại.</span>
          </div>
          <div className="products-table-hint">
            <Clock3 size={14} />
            Theo dõi người sửa, kiểu sửa và thời điểm
          </div>
        </div>

        <div className="products-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã SP</th>
                <th className="products-history-name">Tên sản phẩm</th>
                <th className="products-history-type">Loại log</th>
                <th>Kiểu log</th>
                <th>Người thao tác</th>
                <th className="products-history-time">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : null}

              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    Chưa có dữ liệu lịch sử phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : null}

              {!loading
                ? items.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <strong>{item.productCode || '-'}</strong>
                      </td>
                      <td className="products-history-name">
                        <div className="products-name-main">{item.productName || '-'}</div>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            item.logType === 'Xóa sản phẩm'
                              ? 'danger'
                              : item.logType === 'Sửa sản phẩm'
                                ? 'warning'
                                : ''
                          }`}
                        >
                          {item.logType || 'Hệ thống'}
                        </span>
                      </td>
                      <td>{item.logAction || '-'}</td>
                      <td>{item.createdBy || '-'}</td>
                      <td className="products-history-time">
                        {new Date(item.createdAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
      </section>

      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Lịch sử sửa xóa"
          defaultFilename={`lich-su-sua-xoa-san-pham-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Clock3, FileDown, Filter, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
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

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultHistoryFilters(): HistoryFilters {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(toDate.getDate() - 6);
  return {
    search: '',
    logType: '',
    logAction: '',
    createdBy: '',
    fromDate: formatDateInput(fromDate),
    toDate: formatDateInput(toDate),
  };
}

export function ProductHistory({ actionSlot }: { actionSlot?: React.RefObject<HTMLDivElement | null> } = {}) {
  const [items, setItems] = useState<IProductHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftFilters, setDraftFilters] = useState<HistoryFilters>(() => defaultHistoryFilters());
  const [appliedFilters, setAppliedFilters] = useState<HistoryFilters>(() => defaultHistoryFilters());
  const [filterOptions, setFilterOptions] = useState<{
    logTypes: string[];
    logActions: string[];
    editors: string[];
    toneByLogType: Record<string, string>;
  }>({
    logTypes: [],
    logActions: [],
    editors: [],
    toneByLogType: {},
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const limit = 15;

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

      if (response.meta) {
        setFilterOptions({
          logTypes: response.meta.logTypes || [],
          logActions: response.meta.logActions || [],
          editors: response.meta.editors || [],
          toneByLogType: response.meta.toneByLogType || {},
        });
      }
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
    const emptyFilters = defaultHistoryFilters();

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

        {actionSlot?.current
          ? createPortal(
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
              </div>,
              actionSlot.current,
            )
          : null}
        <form className="products-filter-form" onSubmit={handleApplyFilters}>
          <div className="products-filter-grid products-grid-history">
            <label className="products-inline-field">
              <span>Sản phẩm</span>
              <div className="products-inline-control">
                <Search size={16} />
                <input
                  value={draftFilters.search}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                  data-product-search-scan="true" data-product-search-primary="true" placeholder="Mã hoặc tên sản phẩm..."
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
          </div>
        </form>
      </section>

      <section className="products-table-card">
        <div className="products-table-topbar">
          <div>
            <strong>Bảng lịch sử thay đổi</strong>

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
                          className={`status-badge ${filterOptions.toneByLogType[item.logType] || ''}`}
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

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { Clock3, FileDown, Filter, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { productApi } from '../../../core/api/product.api';
import { suggestProducts } from '../../../core/api/filterSuggestions';
import { Pagination } from '../../../core/components/Pagination';
import { FilterSuggestInput } from '../../../core/components/ui/FilterSuggestInput';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
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

function safeFormatDate(value: any): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
}

export function ProductHistory({ headerSlot }: { actionSlot?: React.RefObject<HTMLDivElement | null>; headerSlot?: ReactNode } = {}) {
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
  const searchRef = useRef<HTMLInputElement>(null);

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
        getValue: (item: IProductHistory) => safeFormatDate(item.createdAt),
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
      setItems(response.items || []);
      setTotal(response.total || 0);
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
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, appliedFilters]);

  useProductScanTarget(searchRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    setDraftFilters((current) => ({ ...current, search: query }));
    setAppliedFilters((current) => ({ ...current, search: query }));
    setPage(1);
  });

  const handleApplyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({
      ...draftFilters,
      search: draftFilters.search.trim(),
    });
  };

  const handleReset = () => {
    const next = defaultHistoryFilters();
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
  };

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedCols: { key: string; customLabel: string }[],
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
        let allItems = [...(firstPage.items || [])];
        const totalItems = firstPage.total || 0;
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
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
          responses.forEach((res) => {
            allItems = allItems.concat(res.items || []);
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

  const activeFilterCount = useMemo(() => {
    return Object.values(appliedFilters).filter(Boolean).length;
  }, [appliedFilters]);

  return (
    <div className="products-list-stack">
      <section className="data-card inventory-toolbar-card products-sticky-toolbar products-history-toolbar">
        {headerSlot ? <div className="products-toolbar-header-slot">{headerSlot}</div> : null}

        <div className="inv-kpi-row products-summary-strip" aria-label="Tóm tắt lịch sử sản phẩm">
          <div className="inv-kpi-card products-summary-chip">
            <div className="inv-kpi-label">Bản ghi</div>
            <div className="inv-kpi-value">{total.toLocaleString('vi-VN')}</div>
            <div className="inv-kpi-sub">Trang {page}/{Math.max(1, Math.ceil(total / limit))}</div>
          </div>
          <div className="inv-kpi-card products-summary-chip">
            <div className="inv-kpi-label">Bộ lọc</div>
            <div className="inv-kpi-value">{activeFilterCount}</div>
          </div>
          <div className="inv-kpi-card inv-kpi-card--value products-summary-chip products-summary-chip--wide">
            <div className="inv-kpi-label">Khoảng ngày</div>
            <div className="inv-kpi-value is-compact">
              {appliedFilters.fromDate || '—'} → {appliedFilters.toDate || '—'}
            </div>
          </div>
        </div>

        <form className="inv-filter-bar" onSubmit={handleApplyFilters}>
          <div className="inv-search">
            <Search size={15} />
            <FilterSuggestInput
              bare
              value={draftFilters.search}
              onChange={(next) => setDraftFilters((current) => ({ ...current, search: next }))}
              ref={searchRef}
              data-product-search-scan="true"
              data-product-search-primary="true"
              fetchSuggestions={suggestProducts}
              placeholder="Mã hoặc tên sản phẩm..."
              aria-label="Tìm mã hoặc tên sản phẩm"
            />
          </div>

          <select
            className="inv-filter-select"
            value={draftFilters.logType}
            onChange={(event) => setDraftFilters((current) => ({ ...current, logType: event.target.value }))}
            title="Loại log"
          >
            <option value="">Loại log</option>
            {filterOptions.logTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            className="inv-filter-select"
            value={draftFilters.logAction}
            onChange={(event) => setDraftFilters((current) => ({ ...current, logAction: event.target.value }))}
            title="Kiểu log"
          >
            <option value="">Kiểu log</option>
            {filterOptions.logActions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            className="inv-filter-select"
            value={draftFilters.createdBy}
            onChange={(event) => setDraftFilters((current) => ({ ...current, createdBy: event.target.value }))}
            title="Người sửa"
          >
            <option value="">Người sửa</option>
            {filterOptions.editors.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <input
            className="inv-filter-select"
            type="date"
            value={draftFilters.fromDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))}
            title="Từ ngày"
          />
          <input
            className="inv-filter-select"
            type="date"
            value={draftFilters.toDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, toDate: event.target.value }))}
            title="Đến ngày"
          />

          <div className="products-filter-actions inv-filter-actions">
            <button type="submit" className="inv-btn inv-btn-primary">
              <Filter size={14} />
              Lọc
            </button>
            <button type="button" className="inv-btn inv-btn-secondary" onClick={handleReset}>
              <RefreshCw size={14} />
              Làm mới
            </button>
            <button type="button" className="inv-btn inv-btn-accent" onClick={() => setShowExportModal(true)}>
              <FileDown size={14} />
              Xuất Excel
            </button>
          </div>
        </form>
      </section>

      <section className="data-card inventory-table-card">
        <div className="data-card-header inventory-table-header products-table-heading">
          <div>
            <h2 className="products-table-title">Bảng lịch sử thay đổi</h2>
            <p className="inventory-table-subtitle">
              Theo dõi người sửa, kiểu sửa và thời điểm
            </p>
          </div>
          <span className="products-selected-count">
            <Clock3 size={12} aria-hidden="true" />
            {total.toLocaleString('vi-VN')} bản ghi
          </span>
        </div>

        <div className="table-scroll inventory-table-scroll">
          <table className="data-table products-data-table products-history-table">
            <thead>
              <tr>
                <th className="products-history-code" scope="col">Mã SP</th>
                <th className="products-history-name" scope="col">Tên sản phẩm</th>
                <th className="products-history-type" scope="col">Loại log</th>
                <th className="products-history-action" scope="col">Kiểu log</th>
                <th className="products-history-actor" scope="col">Người thao tác</th>
                <th className="products-history-time" scope="col">Thời gian</th>
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
                      <td className="products-history-code">
                        <strong>{item.productCode || '-'}</strong>
                      </td>
                      <td className="products-history-name">
                        <div className="products-name-main" title={item.productName || undefined}>
                          {item.productName || '-'}
                        </div>
                      </td>
                      <td className="products-history-type">
                        <span className={`status-badge ${filterOptions.toneByLogType[item.logType] || ''}`}>
                          {item.logType || 'Hệ thống'}
                        </span>
                      </td>
                      <td className="products-history-action">
                        <span className="products-history-action-text" title={item.logAction || undefined}>
                          {item.logAction || '-'}
                        </span>
                      </td>
                      <td className="products-history-actor" title={item.createdBy || undefined}>
                        {item.createdBy || '-'}
                      </td>
                      <td className="products-history-time">{safeFormatDate(item.createdAt)}</td>
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
          title="Xuất Excel - Lịch sử sản phẩm"
          defaultFilename={`lich-su-san-pham-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}

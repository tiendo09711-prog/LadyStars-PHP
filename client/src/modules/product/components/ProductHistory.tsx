import { useEffect, useState, useMemo } from 'react';
import { Filter, RefreshCw, Search, FileDown } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { IProductHistory } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';
import * as XLSX from 'xlsx';
import { ExportExcelModal, ColumnOption } from './ExportExcelModal';

export function ProductHistory() {
  const [items, setItems] = useState<IProductHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filter states
  const [logType, setLogType] = useState('');
  const [logAction, setLogAction] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editorsList, setEditorsList] = useState<string[]>(['LÊ SỸ BÁCH']);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getProductLogs({ 
        page, 
        limit, 
        q: search || undefined,
        logType: logType || undefined,
        logAction: logAction || undefined,
        createdBy: createdBy || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
      setItems(res.items);
      setTotal(res.total);

      // Dynamically extract unique editors from loaded items to ensure options are always relevant
      const newEditors = res.items.map(item => item.createdBy).filter(Boolean) as string[];
      if (newEditors.length > 0) {
        setEditorsList(prev => Array.from(new Set([...prev, ...newEditors])));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, logType, logAction, createdBy, fromDate, toDate]);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const exportColumns: ColumnOption[] = useMemo(() => [
    { label: 'Mã SP', key: 'productCode', getValue: (item: IProductHistory) => item.productCode || '' },
    { label: 'Tên sản phẩm', key: 'productName', getValue: (item: IProductHistory) => item.productName || '' },
    { label: 'Loại log', key: 'logType', getValue: (item: IProductHistory) => item.logType || '' },
    { label: 'Kiểu log', key: 'logAction', getValue: (item: IProductHistory) => item.logAction || '' },
    { label: 'Người thao tác', key: 'createdBy', getValue: (item: IProductHistory) => item.createdBy || '' },
    { label: 'Thời gian', key: 'createdAt', getValue: (item: IProductHistory) => new Date(item.createdAt).toLocaleString('vi-VN') },
  ], []);

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedCols: { key: string; customLabel: string }[]
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: IProductHistory[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = async (p: number, l: number) => {
          return await productApi.getProductLogs({ 
            page: p, 
            limit: l, 
            q: search || undefined,
            logType: logType || undefined,
            logAction: logAction || undefined,
            createdBy: createdBy || undefined,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined
          });
        };

        const pageSize = 100;
        const firstPage = await fetchPage(1, pageSize);
        let allItems = [...firstPage.items];
        const totalItems = firstPage.total;

        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const promises = [];
          for (let pageNum = 2; pageNum <= pagesToFetch; pageNum++) {
            promises.push(fetchPage(pageNum, pageSize));
          }
          const results = await Promise.all(promises);
          results.forEach(res => {
            allItems = allItems.concat(res.items);
          });
        }
        dataToExport = allItems;
      }

      const mappedData = dataToExport.map(item => {
        const row: Record<string, any> = {};
        selectedCols.forEach(col => {
          const matchingCol = exportColumns.find(c => c.key === col.key);
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

  const handleReset = () => {
    setSearch('');
    setLogType('');
    setLogAction('');
    setCreatedBy('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const badgeCls = (type?: string) => {
    if (type === 'Xóa sản phẩm') return 'danger';
    if (type === 'Sửa sản phẩm') return 'warning';
    return '';
  };

  return (
    <div className="page-stack">
      <div className="module-grid">
        {/* Left Filter Panel */}
        <aside className="filter-panel">
          <div className="panel-title">
            <Filter size={18} />
            <span>Bộ lọc</span>
          </div>
          
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Sản phẩm</label>
              <div className="search-box">
                <Search size={16} />
                <input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder="Mã hoặc tên sản phẩm..." 
                />
              </div>
            </div>

            <div>
              <label className="field-label">Loại log</label>
              <select 
                className="form-control"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', background: '#fff' }}
                value={logType}
                onChange={(e) => { setLogType(e.target.value); setPage(1); }}
              >
                <option value="">Tất cả</option>
                <option value="Sửa sản phẩm">Sửa sản phẩm</option>
                <option value="Xóa sản phẩm">Xóa sản phẩm</option>
              </select>
            </div>

            <div>
              <label className="field-label">Kiểu log</label>
              <select 
                className="form-control"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', background: '#fff' }}
                value={logAction}
                onChange={(e) => { setLogAction(e.target.value); setPage(1); }}
              >
                <option value="">Tất cả</option>
                <option value="Sửa giá bán">Sửa giá bán</option>
                <option value="Sửa giá nhập">Sửa giá nhập</option>
                <option value="Tạo sản phẩm mới">Tạo sản phẩm mới</option>
                <option value="Sửa thông tin">Sửa thông tin</option>
                <option value="Xóa sản phẩm">Xóa sản phẩm</option>
              </select>
            </div>

            <div>
              <label className="field-label">Người sửa</label>
              <select 
                className="form-control"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', background: '#fff' }}
                value={createdBy}
                onChange={(e) => { setCreatedBy(e.target.value); setPage(1); }}
              >
                <option value="">Tất cả</option>
                {editorsList.map(editor => (
                  <option key={editor} value={editor}>{editor}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Từ ngày</label>
              <input 
                type="date"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', background: '#fff' }}
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              />
            </div>

            <div>
              <label className="field-label">Đến ngày</label>
              <input 
                type="date"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 11px', background: '#fff' }}
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                Tìm kiếm
              </button>
              <button 
                type="button" 
                className="btn btn-light" 
                onClick={handleReset}
                style={{ border: '1px solid var(--border)', justifyContent: 'center' }}
              >
                Reset
              </button>
            </div>
          </form>
        </aside>

        {/* Right Data Table Card */}
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Lịch sử sửa/xóa</h2>
              <span className="record-badge">{total} bản ghi</span>
            </div>
            <div className="page-actions" style={{ gap: '8px', display: 'flex' }}>
              <button className="btn btn-light" type="button" onClick={load} title="Làm mới">
                <RefreshCw size={16} /> Làm mới
              </button>
              <button className="btn btn-light" style={{ borderColor: '#bbf7d0', color: '#047857' }} onClick={() => setShowExportModal(true)} title="Xuất Excel">
                <FileDown size={15} /> Xuất Excel
              </button>
            </div>
          </div>
          
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Loại log</th>
                  <th>Kiểu log</th>
                  <th>Người thao tác</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={6} className="empty-cell">Chưa có dữ liệu lịch sử.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.productCode || '-'}</strong></td>
                    <td style={{ maxWidth: '250px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.productName}>
                        {item.productName || '-'}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${badgeCls(item.logType)}`}>
                        {item.logType || 'Hệ thống'}
                      </span>
                    </td>
                    <td>{item.logAction || '-'}</td>
                    <td>{item.createdBy || '-'}</td>
                    <td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </section>
      </div>
      {showExportModal && (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Lịch sử sửa xóa"
          defaultFilename={`lich-su-sua-xoa-san-pham-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      )}
    </div>
  );
}

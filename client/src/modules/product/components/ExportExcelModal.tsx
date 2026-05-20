import { useState, useMemo } from 'react';
import { X, Search, FileSpreadsheet, Download, GripVertical } from 'lucide-react';

export interface ColumnOption {
  label: string;
  key: string;
  getValue: (item: any) => any;
}

interface ExportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  defaultFilename: string;
  columns: ColumnOption[];
  onExport: (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[]
  ) => Promise<void>;
  loading?: boolean;
}

export function ExportExcelModal({
  isOpen,
  onClose,
  title,
  defaultFilename,
  columns,
  onExport,
  loading = false,
}: ExportExcelModalProps) {
  if (!isOpen) return null;

  const [exportType, setExportType] = useState<'current' | 'all'>('all');
  const [workbookName, setWorkbookName] = useState(defaultFilename);
  const [sheetName, setSheetName] = useState('Trang tính 1');
  const [activeTab, setActiveTab] = useState<'excel' | 'gsheet'>('excel');
  const [searchTerm, setSearchTerm] = useState('');

  // Column selection state: key -> { checked: boolean, customLabel: string }
  const [columnStates, setColumnStates] = useState<Record<string, { checked: boolean; customLabel: string }>>(() => {
    const initial: Record<string, { checked: boolean; customLabel: string }> = {};
    columns.forEach(col => {
      initial[col.key] = { checked: true, customLabel: col.label };
    });
    return initial;
  });

  // Filter columns by search term
  const filteredColumns = useMemo(() => {
    return columns.filter(col =>
      col.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [columns, searchTerm]);

  // Check if all filtered columns are checked
  const isAllChecked = useMemo(() => {
    if (filteredColumns.length === 0) return false;
    return filteredColumns.every(col => columnStates[col.key]?.checked);
  }, [filteredColumns, columnStates]);

  const handleToggleAll = () => {
    const nextValue = !isAllChecked;
    setColumnStates(prev => {
      const updated = { ...prev };
      filteredColumns.forEach(col => {
        updated[col.key] = {
          ...updated[col.key],
          checked: nextValue,
        };
      });
      return updated;
    });
  };

  const handleToggleColumn = (key: string) => {
    setColumnStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        checked: !prev[key]?.checked,
      },
    }));
  };

  const handleRenameColumn = (key: string, newName: string) => {
    setColumnStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        customLabel: newName,
      },
    }));
  };

  const handleExportClick = () => {
    const selected = columns
      .filter(col => columnStates[col.key]?.checked)
      .map(col => ({
        key: col.key,
        customLabel: columnStates[col.key]?.customLabel || col.label,
      }));

    if (selected.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cột để xuất dữ liệu!');
      return;
    }

    onExport(exportType, workbookName || defaultFilename, sheetName || 'Trang tính 1', selected);
  };

  return (
    <div className="export-backdrop" onClick={onClose}>
      <style>{`
        .export-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          padding: 24px;
          z-index: 9999;
          animation: exportFadeInBg 0.25s ease-out;
        }

        .export-card {
          width: min(840px, 100%);
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0,0,0,0.05);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          max-height: 90vh;
          animation: exportSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .export-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
        }

        .export-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }

        .export-header-close {
          border: none;
          background: none;
          color: #64748b;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .export-header-close:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .export-body {
          padding: 24px;
          overflow-y: auto;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .export-section-card {
          background: #ffffff;
          border-radius: 12px;
          padding: 18px;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .export-section-title {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 4px;
        }

        .export-radio-group {
          display: flex;
          flex-wrap: wrap;
          gap: 24px;
        }

        .export-radio-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          user-select: none;
        }

        .export-radio-input {
          width: 18px;
          height: 18px;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
          cursor: pointer;
          accent-color: #2563eb;
        }

        .export-tabs {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          gap: 8px;
        }

        .export-tab {
          padding: 8px 16px 12px;
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
          border: none;
          background: none;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }

        .export-tab.active {
          color: #2563eb;
        }

        .export-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #2563eb;
          border-radius: 2px;
        }

        .export-tab:hover:not(.active) {
          color: #334155;
        }

        .export-grid-inputs {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .export-input-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .export-input-field label {
          font-size: 13px;
          font-weight: 600;
          color: #475569;
        }

        .export-text-input {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          outline: none;
          font-size: 14px;
          color: #1e293b;
          transition: all 0.2s;
          background: #ffffff;
        }

        .export-text-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        .export-columns-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 12px;
        }

        .export-columns-search {
          position: relative;
          width: 240px;
        }

        .export-columns-search input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px 8px 34px;
          outline: none;
          font-size: 13px;
          transition: all 0.2s;
        }

        .export-columns-search input:focus {
          border-color: #3b82f6;
        }

        .export-columns-search svg {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .export-columns-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 240px;
          overflow-y: auto;
          padding-right: 6px;
        }

        /* Custom Scrollbar */
        .export-columns-list::-webkit-scrollbar {
          width: 6px;
        }
        .export-columns-list::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .export-columns-list::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .export-columns-list::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .export-column-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          transition: all 0.15s;
        }

        .export-column-item:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }

        .export-column-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .export-drag-handle {
          color: #94a3b8;
          cursor: grab;
          display: flex;
          align-items: center;
        }

        .export-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #334155;
          cursor: pointer;
          user-select: none;
          font-weight: 500;
        }

        .export-checkbox-input {
          width: 16px;
          height: 16px;
          accent-color: #2563eb;
          cursor: pointer;
        }

        .export-column-rename-input {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          width: 180px;
          outline: none;
          background: #ffffff;
          transition: all 0.2s;
        }

        .export-column-rename-input:focus {
          border-color: #3b82f6;
          background: #ffffff;
        }

        .export-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #f1f5f9;
          background: #ffffff;
        }

        .export-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .export-btn-primary {
          background: #2563eb;
          color: #ffffff;
        }

        .export-btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        }

        .export-btn-primary:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }

        .export-btn-secondary {
          background: #f1f5f9;
          color: #334155;
          border-color: #cbd5e1;
        }

        .export-btn-secondary:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .gsheet-coming-soon {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
          color: #64748b;
          gap: 12px;
        }

        .gsheet-coming-soon p {
          margin: 0;
          font-size: 14px;
        }

        .gsheet-badge {
          background: #dcfce7;
          color: #15803d;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 12px;
          text-transform: uppercase;
        }

        @keyframes exportFadeInBg {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes exportSlideUp {
          from { opacity: 0; transform: scale(0.95) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div className="export-card" onClick={e => e.stopPropagation()}>
        <div className="export-header">
          <h3>{title}</h3>
          <button className="export-header-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="export-body">
          {/* Data selection range */}
          <div className="export-section-card">
            <div className="export-section-title">Chọn dữ liệu xuất</div>
            <div className="export-radio-group">
              <label className="export-radio-label">
                <input
                  type="radio"
                  name="exportRange"
                  className="export-radio-input"
                  checked={exportType === 'current'}
                  onChange={() => setExportType('current')}
                />
                Trang hiện tại (Dữ liệu đang hiển thị trên bảng)
              </label>
              <label className="export-radio-label">
                <input
                  type="radio"
                  name="exportRange"
                  className="export-radio-input"
                  checked={exportType === 'all'}
                  onChange={() => setExportType('all')}
                />
                Toàn bộ danh sách (Khớp bộ lọc tìm kiếm hiện tại)
              </label>
            </div>
          </div>

          {/* Export Mode Tabs */}
          <div className="export-tabs">
            <button
              className={`export-tab ${activeTab === 'excel' ? 'active' : ''}`}
              onClick={() => setActiveTab('excel')}
            >
              Xuất Excel
            </button>
            <button
              className={`export-tab ${activeTab === 'gsheet' ? 'active' : ''}`}
              onClick={() => setActiveTab('gsheet')}
            >
              Google Sheets
            </button>
          </div>

          {activeTab === 'excel' ? (
            <>
              {/* Filename & Sheet settings */}
              <div className="export-grid-inputs">
                <div className="export-input-field">
                  <label>Tên bảng tính (Tên file Excel)</label>
                  <input
                    type="text"
                    className="export-text-input"
                    value={workbookName}
                    onChange={e => setWorkbookName(e.target.value)}
                    placeholder="Tên file..."
                  />
                </div>
                <div className="export-input-field">
                  <label>Tên trang tính (Sheet Name)</label>
                  <input
                    type="text"
                    className="export-text-input"
                    value={sheetName}
                    onChange={e => setSheetName(e.target.value)}
                    placeholder="Sheet1..."
                  />
                </div>
              </div>

              {/* Columns selection section */}
              <div className="export-section-card" style={{ flex: 1 }}>
                <div className="export-columns-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <label className="export-checkbox-label">
                      <input
                        type="checkbox"
                        className="export-checkbox-input"
                        checked={isAllChecked}
                        onChange={handleToggleAll}
                      />
                      Chọn cột xuất
                    </label>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                      Đã chọn {columns.filter(c => columnStates[c.key]?.checked).length}/{columns.length} cột
                    </span>
                  </div>

                  <div className="export-columns-search">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Tìm kiếm tên cột..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="export-columns-list">
                  {filteredColumns.map(col => {
                    const state = columnStates[col.key] || { checked: false, customLabel: col.label };
                    return (
                      <div className="export-column-item" key={col.key}>
                        <div className="export-column-left">
                          <span className="export-drag-handle">
                            <GripVertical size={14} />
                          </span>
                          <label className="export-checkbox-label">
                            <input
                              type="checkbox"
                              className="export-checkbox-input"
                              checked={state.checked}
                              onChange={() => handleToggleColumn(col.key)}
                            />
                            {col.label}
                          </label>
                        </div>
                        <input
                          type="text"
                          className="export-column-rename-input"
                          value={state.customLabel}
                          onChange={e => handleRenameColumn(col.key, e.target.value)}
                          placeholder="Đổi tên cột xuất..."
                          title="Nhập để đổi tên tiêu đề cột khi xuất"
                        />
                      </div>
                    );
                  })}
                  {filteredColumns.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '14px' }}>
                      Không tìm thấy cột nào khớp với từ khóa.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="export-section-card gsheet-coming-soon">
              <FileSpreadsheet size={48} style={{ color: '#10b981' }} />
              <div className="gsheet-badge">Sắp ra mắt</div>
              <p>
                Tính năng tự động đẩy dữ liệu sang <strong>Google Sheets</strong> trực tuyến đang được phát triển.<br />
                Vui lòng sử dụng tính năng Xuất Excel để tải tệp về máy trước.
              </p>
            </div>
          )}
        </div>

        <div className="export-footer">
          <button className="export-btn export-btn-secondary" onClick={onClose} disabled={loading}>
            Đóng
          </button>
          <button
            className="export-btn export-btn-primary"
            onClick={handleExportClick}
            disabled={loading || activeTab !== 'excel'}
          >
            <Download size={15} />
            {loading ? 'Đang xuất...' : 'Xuất dữ liệu'}
          </button>
        </div>
      </div>
    </div>
  );
}

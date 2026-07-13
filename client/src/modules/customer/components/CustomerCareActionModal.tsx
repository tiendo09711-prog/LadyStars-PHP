import { useState, useEffect } from 'react';
import { X, Trash2, Search, Upload, Download, DollarSign, Phone, Mail, AtSign, PhoneIncoming, FileDown } from 'lucide-react';
import { http } from '../../../core/api/http';
import * as XLSX from 'xlsx';

export type CareActionType = 'Tặng điểm' | 'Trừ điểm' | 'Tặng tiền tích lũy' | 'Trừ tiền tích lũy' | 'Gọi điện' | 'Nhắn tin' | 'Gửi email' | 'Nhận cuộc gọi' | 'Import hành động chăm sóc';

/** Hard cap for client-side care action import (CARE-117). */
const MAX_IMPORT_ROWS = 100;

export const CareActionIcons: Record<CareActionType, any> = {
  'Tặng điểm': <Upload size={16} />,
  'Trừ điểm': <Download size={16} />,
  'Tặng tiền tích lũy': <DollarSign size={16} />,
  'Trừ tiền tích lũy': <DollarSign size={16} />,
  'Gọi điện': <Phone size={16} />,
  'Nhắn tin': <Mail size={16} />,
  'Gửi email': <AtSign size={16} />,
  'Nhận cuộc gọi': <PhoneIncoming size={16} />,
  'Import hành động chăm sóc': <FileDown size={16} />
};

export function CustomerCareActionModal({
  action,
  onClose,
  onSuccess
}: {
  action: CareActionType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [modalError, setModalError] = useState('');

  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // Reset internal state when switching action type
  useEffect(() => {
    setReason('');
    setValue('');
    setNote('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCustomers([]);
    setModalError('');
    setImportFile(null);
    setImportPreview([]);
  }, [action]);

  useEffect(() => {
    http.get('/auth/me')
      .then(res => setCreatorName(res.data?.name || ''))
      .catch(() => setCreatorName(''));
  }, []);

  const showValueField = ['Tặng điểm', 'Trừ điểm', 'Tặng tiền tích lũy', 'Trừ tiền tích lũy'].includes(action);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      http.get('/customers/customers', { params: { q: searchQuery, limit: 20 } })
        .then(res => {
          setSearchResults(res.data?.items || res.data?.data || []);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectCustomer = (cust: any) => {
    if (!selectedCustomers.find(c => c._id === cust._id)) {
      setSelectedCustomers([...selectedCustomers, cust]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setModalError('');
  };

  const handleRemoveCustomer = (id: string) => {
    setSelectedCustomers(selectedCustomers.filter(c => c._id !== id));
  };

  const normalizeRecordDate = () => new Date().toISOString().slice(0, 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    if (selectedCustomers.length === 0) {
      setModalError('Vui lòng chọn ít nhất một khách hàng.');
      return;
    }
    if (showValueField && !value.trim()) {
      setModalError('Vui lòng nhập trị giá.');
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.all(selectedCustomers.map(cust => {
        const code = `CC${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
        return http.post('/customers/care', {
          code,
          customerCode: cust.code,
          customerName: cust.name,
          customerPhone: cust.phone,
          customerId: cust._id || undefined,
          details: showValueField ? `${value} (${action})` : action,
          reason: reason.trim() || action,
          description: note.trim() || undefined,
          creator: creatorName || undefined,
          recordDate: normalizeRecordDate(),
        });
      }));
      onSuccess();
    } catch (err: any) {
      setModalError(err?.response?.data?.message || 'Có lỗi xảy ra khi lưu phiếu chăm sóc.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- IMPORT HANDLERS (improved mapping + validation + template) ---
  const importColumnMap: Record<string, string[]> = {
    customerCode: ['mã kh', 'makh', 'code', 'customercode', 'customer code', 'mã khách'],
    customerName: ['tên', 'name', 'tên khách', 'khách hàng', 'customername', 'customer name'],
    customerPhone: ['sđt', 'sdt', 'phone', 'điện thoại', 'mobile', 'số điện thoại'],
    reason: ['lý do', 'ly do', 'reason', 'loại'],
    details: ['chi tiết', 'chitiet', 'details', 'trị giá', 'value', 'điểm', 'tiền', 'số điểm', 'số tiền'],
    description: ['ghi chú', 'ghichu', 'note', 'mô tả', 'description'],
  };

  const getByAliases = (headers: string[], row: any[], aliases: string[]) => {
    for (const alias of aliases) {
      const idx = headers.findIndex((h: string) => h.includes(alias));
      if (idx >= 0) return String(row[idx] || '').trim();
    }
    return '';
  };

  const handleImportFile = (file: File) => {
    setImportFile(file);
    setImportPreview([]);
    setModalError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (!rows.length) {
          setModalError('File rỗng hoặc không đọc được.');
          return;
        }
        const headers = (rows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
        const dataRows = rows.slice(1);
        const preview = dataRows
          .filter(r => Array.isArray(r) && r.some((c: any) => c != null && String(c).trim() !== ''))
          .map((row: any[]) => {
            const entry: any = {};
            Object.entries(importColumnMap).forEach(([field, aliases]) => {
              entry[field] = getByAliases(headers, row, aliases);
            });
            if (!entry.reason) entry.reason = action;
            return entry;
          })
          .filter((p: any) => p.customerName || p.customerPhone || p.customerCode);

        if (!preview.length) {
          setImportPreview([]);
          setModalError('Không tìm thấy dòng dữ liệu hợp lệ. Cần ít nhất 1 trong: Mã KH / Tên / SĐT.');
          return;
        }
        const totalValid = preview.length;
        const capped = preview.slice(0, MAX_IMPORT_ROWS);
        setImportPreview(capped);
        if (totalValid > MAX_IMPORT_ROWS) {
          const skipped = totalValid - MAX_IMPORT_ROWS;
          setModalError(
            `File có ${totalValid} dòng hợp lệ. Hệ thống chỉ import tối đa ${MAX_IMPORT_ROWS} dòng đầu. ${skipped} dòng còn lại sẽ bị bỏ qua.`,
          );
        }
      } catch (e) {
        setModalError('Không đọc được file Excel. Hỗ trợ .xlsx, .xls');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadImportTemplate = () => {
    const sample = [
      ['Mã KH', 'Tên khách hàng', 'SĐT', 'Lý do', 'Chi tiết / Trị giá', 'Ghi chú'],
      ['KH001', 'Nguyễn Văn A', '0901234567', 'Tặng điểm', '50', 'Chăm sóc sinh nhật'],
      ['', 'Trần Thị B', '0912345678', 'Gọi điện', 'Hẹn gặp lại', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau');
    XLSX.writeFile(wb, 'mau-import-cham-soc-khach-hang.xlsx');
  };

  const handleImportSubmit = async () => {
    if (!importPreview.length) {
      setModalError('Chưa có dữ liệu preview để import.');
      return;
    }
    setImportLoading(true);
    setModalError('');

    let success = 0;
    const failures: string[] = [];

    for (let i = 0; i < importPreview.length; i++) {
      const row = importPreview[i];
      const code = `CC${Date.now().toString().slice(-6)}${String(i).padStart(2, '0')}`;
      try {
        await http.post('/customers/care', {
          code,
          customerCode: row.customerCode || undefined,
          customerName: row.customerName || undefined,
          customerPhone: row.customerPhone || undefined,
          details: row.details || action,
          reason: row.reason || reason || action,
          description: row.description || note || undefined,
          creator: creatorName || undefined,
          recordDate: normalizeRecordDate(),
        });
        success++;
      } catch (err: any) {
        failures.push(`Dòng ${i + 1}: ${err?.response?.data?.message || 'Lỗi không xác định'}`);
      }
    }

    setImportLoading(false);

    if (failures.length > 0) {
      setModalError(`Import xong ${success}/${importPreview.length}. Lỗi: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '...' : ''}`);
    } else {
      onSuccess();
    }
  };

  if (action === 'Import hành động chăm sóc') {
    return (
      <div className="modal-backdrop" role="presentation" style={{ zIndex: 1000 }}>
        <div className="modal-card" style={{ maxWidth: 860, width: '100%' }}>
          <div className="modal-header">
            <div>
              <h2>Import hành động chăm sóc</h2>
              <p>Nhập file Excel để tạo nhiều phiếu chăm sóc cùng lúc</p>
            </div>
            <button className="icon-button" type="button" onClick={onClose} title="Đóng">
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: '1.25rem' }}>
            {modalError && (
              <div className="customer-feedback error" style={{ marginBottom: '1rem' }}>
                {modalError}
              </div>
            )}

            <div style={{ background: 'var(--surface-100)', padding: '0.75rem 1rem', borderRadius: 6, marginBottom: '1rem', fontSize: '13px' }}>
              Hỗ trợ cột linh hoạt (không phân biệt hoa thường): Mã KH/Code, Tên khách hàng, SĐT/Điện thoại, Lý do, Chi tiết/Trị giá/Điểm/Tiền, Ghi chú. Dòng 1 = header.
              <button type="button" className="btn btn-outline" style={{ marginLeft: 12, fontSize: 12, padding: '2px 8px' }} onClick={downloadImportTemplate}>
                Tải file mẫu
              </button>
            </div>

            <div className="form-field" style={{ marginBottom: '1rem' }}>
              <span>File Excel (.xlsx, .xls)</span>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                }}
              />
              {importFile && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted-color)' }}>Đã chọn: {importFile.name} — {importPreview.length} dòng hợp lệ</div>}
            </div>

            {importPreview.length > 0 && (
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--surface-200)', borderRadius: 4, marginBottom: '0.75rem' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Mã KH</th>
                      <th>Tên KH</th>
                      <th>SĐT</th>
                      <th>Lý do</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{row.customerCode || '—'}</td>
                        <td>{row.customerName || '—'}</td>
                        <td>{row.customerPhone || '—'}</td>
                        <td>{row.reason || '—'}</td>
                        <td>{row.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 8 && <div style={{ padding: 6, fontSize: 12, textAlign: 'center', color: 'var(--text-muted-color)' }}>... và {importPreview.length - 8} dòng khác</div>}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-muted-color)' }}>
              Sau khi import thành công, danh sách phiếu chăm sóc sẽ được làm mới.<br />
              Lưu ý: Import thực hiện qua client (batch tạo). Sai sót có thể xóa thủ công sau.
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline" type="button" onClick={onClose} disabled={importLoading}>Hủy</button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={importLoading || importPreview.length === 0}
              onClick={handleImportSubmit}
            >
              {importLoading ? 'Đang import...' : `Import ${importPreview.length} phiếu`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" style={{ zIndex: 1000 }}>
      <form className="modal-card" onSubmit={handleSubmit} style={{ maxWidth: 800, width: '100%' }}>
        <div className="modal-header">
          <div>
            <h2>{action}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>
        
        <div style={{ padding: '1.25rem' }}>
          <div style={{ padding: '1rem', border: '1px solid var(--surface-300)', borderRadius: 8, marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid', fontSize: 12 }}>i</span>
               Thông tin cơ bản
            </h4>
            
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '1rem' }}>
               <label className="form-field">
                 <span>Kiểu tặng</span>
                 <input type="text" value={action} readOnly style={{ background: 'var(--surface-100)' }} />
               </label>
               <label className="form-field">
                 <span>Lý do</span>
                 <input type="text" placeholder="- Lý do -" value={reason} onChange={e => setReason(e.target.value)} />
               </label>
               {showValueField && (
                 <label className="form-field">
                   <span>Trị giá (*)</span>
                   <input type="number" required value={value} onChange={e => setValue(e.target.value)} />
                 </label>
               )}
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
               <label className="form-field" style={{ position: 'relative' }}>
                 <span>Khách hàng</span>
                 <input 
                   type="text" 
                   placeholder="Tìm kiếm khách hàng (ít nhất 2 ký tự)..."
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
                 {(searchLoading || searchResults.length > 0) && (
                   <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface-0)', border: '1px solid var(--surface-200)', borderRadius: 4, zIndex: 10, maxHeight: 220, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                     {searchLoading && <li style={{ padding: '8px 12px', color: 'var(--text-muted-color)' }}>Đang tìm...</li>}
                     {!searchLoading && searchResults.length === 0 && searchQuery.length >= 2 && (
                       <li style={{ padding: '8px 12px', color: 'var(--text-muted-color)' }}>Không tìm thấy khách hàng</li>
                     )}
                     {searchResults.map(r => (
                       <li 
                         key={r._id} 
                         onClick={() => handleSelectCustomer(r)}
                         style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-100)' }}
                       >
                         <strong>{r.name || r.code}</strong> {r.phone ? `- ${r.phone}` : ''} {r.code ? `(${r.code})` : ''}
                       </li>
                     ))}
                   </ul>
                 )}
               </label>
               <label className="form-field">
                 <span>Ghi chú</span>
                 <input type="text" value={note} onChange={e => setNote(e.target.value)} />
               </label>
            </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--surface-200)', borderRadius: 4 }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 50, textAlign: 'center' }}>#</th>
                  <th>Khách hàng</th>
                  <th>Mã khách hàng</th>
                  <th>Điện thoại</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Xóa</th>
                </tr>
              </thead>
              <tbody>
                {selectedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted-color)' }}>
                      Chưa có khách hàng nào được chọn
                    </td>
                  </tr>
                ) : (
                  selectedCustomers.map((cust, idx) => (
                    <tr key={cust._id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{cust.name}</td>
                      <td>{cust.code}</td>
                      <td>{cust.phone}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="icon-button danger" onClick={() => handleRemoveCustomer(cust._id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {modalError && (
            <div className="customer-feedback error" style={{ marginTop: '0.75rem' }}>
              {modalError}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" type="button" onClick={onClose} disabled={isSubmitting}>Hủy</button>
          <button className="btn btn-primary" type="submit" disabled={isSubmitting || selectedCustomers.length === 0}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </div>
  );
}

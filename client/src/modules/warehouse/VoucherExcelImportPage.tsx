import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, ArrowLeft, Download, FileSpreadsheet, CheckCircle2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { http } from '../../core/api/http';

type Branch = { _id: string; name: string; code?: string; isDefault?: boolean; isActive?: boolean };

const IMPORT_TYPES = [
  { value: 'Nhập mua', label: 'Nhập mua (Từ NCC)' },
  { value: 'Nhập hoàn', label: 'Nhập hoàn hàng / Trả hàng' },
  { value: 'Nhập chuyển kho', label: 'Nhập chuyển kho' },
  { value: 'Nhập khác', label: 'Nhập khác' }
];

const XNK_HEADERS = ['Sản phẩm', 'Lô hàng', 'Đơn vị tính', 'Số lượng', 'Giá', 'Chiết khấu', 'Ghi chú', 'Ngày hết hạn', 'Cảnh báo trước'];

export function VoucherExcelImportPage() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [voucherType, setVoucherType] = useState('Nhập mua');
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  const selectedBranch = branches.find((branch) => branch._id === selectedBranchId);

  useEffect(() => {
    let mounted = true;
    setLoadingBranches(true);
    http.get('/system/branches')
      .then((res) => {
        if (!mounted) return;
        const list: Branch[] = (res.data?.items || []).filter((branch: Branch) => branch.isActive !== false);
        setBranches(list);
        const defaultBranch = list.find((branch) => branch.isDefault) || list[0];
        setSelectedBranchId(defaultBranch?._id || '');
        if (!list.length) setError('Không tìm thấy kho hàng nào. Vui lòng tạo kho hàng trước khi import Excel.');
      })
      .catch(() => { if (mounted) setError('Lỗi tải danh sách kho hàng. Vui lòng kiểm tra kết nối.'); })
      .finally(() => { if (mounted) setLoadingBranches(false); });
    return () => { mounted = false; };
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
  };

  const handleFileSelected = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError('Vui lòng chỉ tải lên file Excel (.xlsx hoặc .xls)');
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedFile) return setError('Vui lòng tải lên file Excel dữ liệu.');
    if (!selectedBranchId || !selectedBranch) return setError('Vui lòng chọn kho hàng hợp lệ.');

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('branchId', selectedBranchId);
      formData.append('warehouse', selectedBranch.name);
      formData.append('type', voucherType);
      formData.append('note', note || `Nhập kho từ Excel - File: ${selectedFile.name}`);
      const response = await http.post('/warehouse/vouchers/import-excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const voucherId = response.data?.voucher?.voucherId || 'PNK-xxxxxx';
      const warningCount = Array.isArray(response.data?.errors) ? response.data.errors.length : 0;
      setSuccess(`Import thành công phiếu ${voucherId}${warningCount ? `, bỏ qua ${warningCount} dòng lỗi` : ''}.`);
      setTimeout(() => navigate('/warehouse/transactions'), 1500);
    } catch (err: any) {
      const apiErrors = err.response?.data?.errors;
      setError(`${err.response?.data?.message || 'Không thể thực hiện import dữ liệu.'}${Array.isArray(apiErrors) ? `\n${apiErrors.join('\n')}` : ''}`);
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const noteRows = [
      ['Các lưu ý khi sử dụng file import xuất nhập kho'],
      ['1', 'Không thay đổi thứ tự worksheet.'],
      ['2', 'Không đổi tên hoặc thứ tự cột trong worksheet XNK.'],
      ['3', 'Các cột bắt buộc: Sản phẩm, Số lượng.'],
      ['4', 'Sản phẩm phải khớp mã hoặc tên sản phẩm đang có trong hệ thống.'],
      ['5', 'Ngày hết hạn dùng định dạng dd/mm/yyyy nếu có.']
    ];
    const xnkRows = [XNK_HEADERS, ['SP001', 'LOT-001', 'cái', 10, 100000, 0, 'Dữ liệu mẫu, xóa trước khi import', '31/12/2026', 30]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(noteRows), 'Ghi chú');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(xnkRows), 'XNK');
    XLSX.writeFile(workbook, 'Nhanh.vn_Import_Imex_v0.1.8.xlsx');
  };

  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon" style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }}><FileUp size={22} /></div>
          <div><h1>Import phiếu nhập kho từ Excel</h1><p>Nhập dữ liệu phiếu nhập kho hàng loạt từ file Excel mẫu.</p></div>
        </div>
        <div className="page-actions"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transactions')}><ArrowLeft size={16} /> Quay lại</button></div>
      </div>
      <div className="module-grid" style={{ gridTemplateColumns: '380px minmax(0, 1fr)' }}>
        <form onSubmit={handleSubmit} className="filter-panel" style={{ position: 'static', display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 10px', fontWeight: 800 }}>Thiết lập thông số import</h2>
          <label className="form-field"><span>Kiểu *</span><select value="import" disabled><option value="import">Nhập kho (Import)</option></select></label>
          <label className="form-field"><span>Loại nhập kho *</span><select value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>{IMPORT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="form-field"><span>Kho hàng *</span><select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} disabled={loadingBranches || !branches.length}>{loadingBranches && <option value="">Đang tải kho hàng...</option>}{!loadingBranches && !branches.length && <option value="">Không có kho hàng</option>}{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}{branch.code ? ` (${branch.code})` : ''}</option>)}</select></label>
          <label className="form-field"><span>Ghi chú</span><textarea rows={3} value={note} placeholder="Ghi chú cho phiếu nhập Excel này" onChange={(e) => setNote(e.target.value)} /></label>
          {error && <div className="form-error" style={{ margin: '8px 0 0', whiteSpace: 'pre-line' }}>{error}</div>}
          {success && <div className="status-badge success" style={{ margin: '8px 0 0', display: 'block', padding: '10px' }}>{success}</div>}
          <button className="btn btn-primary full" type="submit" style={{ marginTop: '10px' }} disabled={!selectedFile || !selectedBranchId || importing || loadingBranches}>{importing ? 'Đang import...' : 'Thực hiện import'}</button>
        </form>
        <div className="page-stack">
          <div className="data-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div><h2 style={{ fontSize: '18px', margin: 0 }}>Tải lên file Excel mẫu</h2><p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>File phải có sheet <strong>XNK</strong> và đúng thứ tự cột mẫu.</p></div>
              <button className="btn btn-light" type="button" onClick={downloadSampleTemplate}><Download size={16} /> Tải file Excel mẫu</button>
            </div>
            <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} style={{ border: isDragActive ? '2px dashed var(--primary)' : '2px dashed var(--border)', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', backgroundColor: isDragActive ? 'var(--primary-soft)' : 'var(--border-soft)', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}>
              <input type="file" id="excel-file-input" accept=".xlsx,.xls" onChange={handleFileInput} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              {!selectedFile ? <><FileSpreadsheet size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px', display: 'block' }} /><p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: '15px' }}>Kéo thả file Excel của bạn vào đây</p><p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: '13px' }}>Hoặc nhấp vào để duyệt file từ máy tính</p><span style={{ fontSize: '11px', backgroundColor: 'var(--surface)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--muted)' }}>Chấp nhận .xlsx và .xls</span></> : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><CheckCircle2 size={48} style={{ color: 'var(--success)', margin: '0 auto 12px', display: 'block' }} /><p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: '15px', color: 'var(--success)' }}>File đã sẵn sàng: {selectedFile.name}</p><p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: '13px' }}>{(selectedFile.size / 1024).toFixed(1)} KB</p><button className="btn btn-light danger" type="button" onClick={(e) => { e.stopPropagation(); removeFile(); }} style={{ minHeight: '32px', fontSize: '12px' }}><Trash2 size={14} /> Xóa file</button></div>}
            </div>
          </div>
          <div className="data-card" style={{ padding: 18 }}><h2 style={{ marginTop: 0 }}>Cột Excel bắt buộc</h2><p style={{ color: 'var(--muted)' }}>Sheet <strong>XNK</strong>: {XNK_HEADERS.join(', ')}.</p><p style={{ color: 'var(--muted)' }}>Cột <strong>Sản phẩm</strong> phải khớp mã hoặc tên sản phẩm đang có trong hệ thống. Khi import thành công, phiếu nhập, dòng XNK, tồn kho, log kho và lô hàng được cập nhật cùng lúc theo kho đã chọn.</p></div>
        </div>
      </div>
    </div>
  );
}

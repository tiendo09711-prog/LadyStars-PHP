import React, { useState, useRef } from 'react';
import { Info, Save, Calendar, Lightbulb } from 'lucide-react';
import { http } from '../../core/api/http';
import * as XLSX from 'xlsx';
import './InitialDebtPage.css';

export function InitialDebtPage() {
  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('manual');
  
  // Manual form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('payable'); // payable (Báo có / Phải trả), receivable (Báo nợ / Phải thu)
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [targetType, setTargetType] = useState('vendor'); // vendor, customer, staff
  const [targetCode, setTargetCode] = useState('');

  // Excel form state
  const [excelDate, setExcelDate] = useState(new Date().toISOString().split('T')[0]);
  const [file, setFile] = useState<File | null>(null);

  // General state
  const [afterSubmit, setAfterSubmit] = useState('continue'); // continue, list
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (val: string) => {
    const num = Number(val.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num === 0) return '';
    return num.toLocaleString('vi-VN');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmount(val);
  };

  const handleSaveManual = async () => {
    if (!targetCode || !amount) {
      alert('Vui lòng nhập đầy đủ Số tiền và Mã đối tượng');
      return;
    }

    setLoading(true);
    try {
      await http.post('/accounting/debt/opening', {
        date,
        type,
        amount: Number(amount),
        note,
        targetType,
        targetCode
      });
      alert('Lưu thành công!');
      if (afterSubmit === 'continue') {
        setAmount('');
        setTargetCode('');
        setNote('');
      } else {
        // Redirect logic depending on targetType
        window.location.href = `/accounting/debt/${targetType}s`;
      }
    } catch (err: any) {
      alert('Lỗi: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExcel = async () => {
    if (!file) {
      alert('Vui lòng chọn file Excel/CSV');
      return;
    }

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      const itemsToUpload = rows.map((row: any) => {
        // Try to find the target code
        const code = row['Mã đối tượng'] || row['Mã khách hàng'] || row['Mã nhà cung cấp'] || row['Mã NCC'] || row['Mã KH'] || row['Code'] || '';
        
        // Infer amount and type
        const phaiThu = Number(row['Phải thu'] || row['Nợ'] || row['Ghi nợ'] || row['Số dư nợ'] || 0);
        const phaiTra = Number(row['Phải trả'] || row['Có'] || row['Ghi có'] || row['Số dư có'] || 0);
        
        let rowType = 'payable';
        let rowAmount = phaiTra;
        
        if (phaiThu > 0 && phaiTra === 0) {
          rowType = 'receivable';
          rowAmount = phaiThu;
        } else if (phaiTra === 0 && phaiThu === 0) {
          // If a generic "Số tiền" column exists
          const genericAmount = Number(row['Số tiền'] || row['Amount'] || 0);
          rowAmount = genericAmount;
          // default to payable unless inferred
        }

        // Infer target type based on code prefix
        let inferredTargetType = 'customer';
        if (code.toUpperCase().startsWith('NCC')) inferredTargetType = 'vendor';
        if (code.toUpperCase().startsWith('NV')) inferredTargetType = 'staff';

        return {
          date: excelDate,
          type: rowType,
          amount: rowAmount,
          targetType: inferredTargetType,
          targetCode: code
        };
      }).filter(item => item.targetCode && item.amount > 0);

      if (itemsToUpload.length === 0) {
        alert('Không tìm thấy dữ liệu hợp lệ trong file (cần có cột Mã và Số tiền/Phải thu/Phải trả)');
        setLoading(false);
        return;
      }

      const res = await http.post('/accounting/debt/opening/bulk', { items: itemsToUpload });
      alert(`Import thành công ${res.data.processed}/${res.data.total} dòng!`);
      
      if (afterSubmit === 'continue') {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        window.location.href = `/accounting/debt/vendors`;
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'manual') {
      handleSaveManual();
    } else {
      handleSaveExcel();
    }
  };

  return (
    <div className="initial-debt-page">
      <div className="id-tabs">
        <div 
          className={`id-tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          Thêm mới
        </div>
        <div 
          className={`id-tab ${activeTab === 'excel' ? 'active' : ''}`}
          onClick={() => setActiveTab('excel')}
        >
          Import excel
        </div>
      </div>

      <form onSubmit={handleSave}>
        {activeTab === 'manual' && (
          <div className="id-card">
            <div className="id-card-header">
              <Info size={16} /> Thông tin
            </div>
            <div className="id-card-body">
              <div className="id-row">
                <div className="id-col">
                  <div className="id-form-group">
                    <label style={{ fontSize: 12, color: '#6c757d', position: 'absolute', top: -8, left: 10, background: 'white', padding: '0 4px' }}>Ngày thu chi</label>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="date" 
                        className="id-form-control" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        style={{ borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                      />
                      <div style={{ padding: '9px 12px', border: '1px solid #ced4da', borderLeft: 'none', borderTopRightRadius: 4, borderBottomRightRadius: 4, color: '#6c757d' }}>
                        <Calendar size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="id-form-group">
                    <label style={{ fontSize: 12, color: '#6c757d', position: 'absolute', top: -8, left: 10, background: 'white', padding: '0 4px' }}>Loại phiếu *</label>
                    <select className="id-form-control" value={type} onChange={e => setType(e.target.value)}>
                      <option value="payable">Khoản phải trả (Báo có)</option>
                      <option value="receivable">Khoản phải thu (Báo nợ)</option>
                    </select>
                  </div>

                  <div className="id-form-group">
                    <input 
                      type="text" 
                      className="id-form-control" 
                      placeholder="Số tiền" 
                      value={formatCurrency(amount)}
                      onChange={handleAmountChange}
                    />
                  </div>

                  <div className="id-form-group">
                    <textarea 
                      className="id-form-control" 
                      placeholder="Ghi chú" 
                      rows={2}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    ></textarea>
                  </div>
                </div>

                <div className="id-col">
                  <div className="id-form-group">
                    <label style={{ fontSize: 12, color: '#6c757d', position: 'absolute', top: -8, left: 10, background: 'white', padding: '0 4px' }}>Loại đối tượng *</label>
                    <select className="id-form-control" value={targetType} onChange={e => setTargetType(e.target.value)}>
                      <option value="customer">Khách hàng</option>
                      <option value="vendor">Nhà cung cấp</option>
                      <option value="staff">Nhân viên bán hàng</option>
                    </select>
                  </div>

                  <div className="id-form-group">
                    <input 
                      type="text" 
                      className="id-form-control" 
                      placeholder="Mã đối tượng (vd: NCC.1284, KH.001)" 
                      value={targetCode}
                      onChange={e => setTargetCode(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'excel' && (
          <>
            <div className="id-alert-info">
              Mẫu file import: <strong>Excel 2007 trở lên</strong> (Chú ý: File import không quá 200 dòng hoặc dung lượng vượt quá 30MB)
            </div>
            
            <div className="id-card">
              <div className="id-card-body">
                <div style={{ maxWidth: 400 }}>
                  <div className="id-form-group">
                    <label style={{ fontSize: 12, color: '#6c757d', position: 'absolute', top: -8, left: 10, background: 'white', padding: '0 4px' }}>Ngày thu chi</label>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="date" 
                        className="id-form-control" 
                        value={excelDate}
                        onChange={(e) => setExcelDate(e.target.value)}
                        style={{ borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                      />
                      <div style={{ padding: '9px 12px', border: '1px solid #ced4da', borderLeft: 'none', borderTopRightRadius: 4, borderBottomRightRadius: 4, color: '#6c757d' }}>
                        <Calendar size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="id-form-group">
                    <div className="id-file-input">
                      <button 
                        type="button" 
                        className="id-file-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose File
                      </button>
                      <div className="id-file-name">
                        {file ? file.name : 'No file chosen'}
                      </div>
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv"
                        ref={fileInputRef}
                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="id-radio-group">
          <label className="id-radio">
            <input 
              type="radio" 
              name="afterSubmit" 
              value="continue"
              checked={afterSubmit === 'continue'}
              onChange={() => setAfterSubmit('continue')}
            />
            Tiếp tục thêm
          </label>
          <label className="id-radio">
            <input 
              type="radio" 
              name="afterSubmit" 
              value="list"
              checked={afterSubmit === 'list'}
              onChange={() => setAfterSubmit('list')}
            />
            Xem danh sách
          </label>
        </div>

        <button type="submit" className="id-btn-save" disabled={loading}>
          <Save size={16} /> {loading ? 'Đang lưu...' : 'Lưu'}
        </button>
      </form>

      <div className="id-info-box">
        <div className="id-info-icon">
          <Lightbulb />
        </div>
        <div className="id-info-text">
          <p>Chú ý:</p>
          <p>- Trang này dùng để nhập công nợ đầu kỳ khi doanh nghiệp bắt đầu sử dụng module kế toán.</p>
          <p>- Các hành động về sau chỉ nên sử dụng:</p>
          <ul>
            <li>Phiếu xuất nhập kho gắn với đối tượng nhà cung cấp.</li>
            <li>Phiếu bán hàng gắn với đối tượng khách hàng, dịch vụ trả góp.</li>
            <li>Phiếu thu chi, báo nợ báo có, chọn đối tượng nhà cung cấp, khách hàng và dịch vụ trả góp tương ứng.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

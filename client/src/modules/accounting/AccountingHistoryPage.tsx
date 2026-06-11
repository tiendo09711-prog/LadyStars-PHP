import React, { useState, useEffect, useRef } from 'react';
import { FileDown, ChevronDown, Upload } from 'lucide-react';
import { http } from '../../core/api/http';

export function AccountingHistoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States cho các bộ lọc y hệt hình
  const [filters, setFilters] = useState({
    transactionId: '',
    createdAt: '05/05/2026 - 05/06/2026',
    transactionDate: '',
    operation: '',
    documentType: '',
    documentCode: '',
    ticketType: '',
    objectType: '',
    objectName: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await http.get('/accounting/transaction-logs');
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      const parsedItems = lines.slice(1).map((line, idx) => {
        const values = line.split(';');
        // ID;ID giao dịch;Ngày giao dịch;Loại chứng từ;Chứng từ;Người thao tác;Ngày thao tác;Hành động
        return {
          logId: values[0] || `LOG${Date.now()}${idx}`,
          transactionId: values[1] || '',
          transactionDate: values[2] ? new Date(values[2]) : new Date(),
          documentType: values[3] || '',
          documentCode: values[4] || '',
          transactionType: '', // Không có trong CSV mẫu nhưng có trên giao diện
          totalAmount: 0, // Tương tự
          operator: values[5] || '',
          operationDate: values[6] ? new Date(values[6]) : new Date(),
          action: values[7] || '',
          dataDetail: '' 
        };
      });

      try {
        await http.post('/accounting/transaction-logs/bulk', { items: parsedItems });
        alert(`Đã nhập thành công ${parsedItems.length} bản ghi!`);
        loadData();
      } catch (err: any) {
        alert('Lỗi import: ' + (err.response?.data?.message || err.message));
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Lọc local tạm thời
  const filteredItems = items.filter(item => {
    if (filters.transactionId && !item.transactionId?.toLowerCase().includes(filters.transactionId.toLowerCase())) return false;
    if (filters.documentCode && !item.documentCode?.toLowerCase().includes(filters.documentCode.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ padding: '20px', backgroundColor: '#eef2f6', minHeight: '100vh', fontFamily: '"Inter", sans-serif' }}>
      <input
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleImportCSV}
      />
      
      <div style={{ backgroundColor: '#fff', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', paddingBottom: '20px' }}>
        
        {/* Top Filter Bar - Row 1 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 16px 8px 16px', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="ID giao dịch" 
            value={filters.transactionId}
            onChange={e => handleFilterChange('transactionId', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '130px', fontSize: '14px' }}
          />
          
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: '-8px', left: '8px', backgroundColor: '#fff', padding: '0 4px', fontSize: '11px', color: '#6c757d' }}>Ngày tạo</span>
            <input 
              type="text" 
              value={filters.createdAt}
              onChange={e => handleFilterChange('createdAt', e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '200px', fontSize: '14px' }}
            />
          </div>

          <input 
            type="text" 
            placeholder="Ngày giao dịch" 
            value={filters.transactionDate}
            onChange={e => handleFilterChange('transactionDate', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '140px', fontSize: '14px' }}
          />

          <select 
            value={filters.operation}
            onChange={e => handleFilterChange('operation', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '130px', fontSize: '14px', appearance: 'none', background: 'url("data:image/svg+xml;utf8,<svg fill=%236c757d height=24 viewBox=0 0 24 24 width=24 xmlns=http://www.w3.org/2000/svg><path d=M7 10l5 5 5-5z/></svg>") no-repeat right 8px center/16px' }}>
            <option value="">Thao tác</option>
          </select>

          <select 
            value={filters.documentType}
            onChange={e => handleFilterChange('documentType', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '150px', fontSize: '14px', appearance: 'none', background: 'url("data:image/svg+xml;utf8,<svg fill=%236c757d height=24 viewBox=0 0 24 24 width=24 xmlns=http://www.w3.org/2000/svg><path d=M7 10l5 5 5-5z/></svg>") no-repeat right 8px center/16px' }}>
            <option value="">Loại chứng từ</option>
          </select>

          <input 
            type="text" 
            placeholder="Chứng từ" 
            value={filters.documentCode}
            onChange={e => handleFilterChange('documentCode', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '130px', fontSize: '14px' }}
          />

          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: '-8px', left: '8px', backgroundColor: '#fff', padding: '0 4px', fontSize: '11px', color: '#6c757d' }}>Loại phiếu</span>
            <select 
              value={filters.ticketType}
              onChange={e => handleFilterChange('ticketType', e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '130px', fontSize: '14px', appearance: 'none', background: 'url("data:image/svg+xml;utf8,<svg fill=%236c757d height=24 viewBox=0 0 24 24 width=24 xmlns=http://www.w3.org/2000/svg><path d=M7 10l5 5 5-5z/></svg>") no-repeat right 8px center/16px' }}>
              <option value=""></option>
            </select>
          </div>
        </div>

        {/* Top Filter Bar - Row 2 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 16px 16px', gap: '10px', alignItems: 'center' }}>
          <select 
            value={filters.objectType}
            onChange={e => handleFilterChange('objectType', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '150px', fontSize: '14px', appearance: 'none', background: 'url("data:image/svg+xml;utf8,<svg fill=%236c757d height=24 viewBox=0 0 24 24 width=24 xmlns=http://www.w3.org/2000/svg><path d=M7 10l5 5 5-5z/></svg>") no-repeat right 8px center/16px' }}>
            <option value="">Loại đối tượng</option>
          </select>
          
          <input 
            type="text" 
            placeholder="Đối tượng" 
            value={filters.objectName}
            onChange={e => handleFilterChange('objectName', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '150px', fontSize: '14px' }}
          />

          <button style={{ backgroundColor: '#26a69a', color: '#fff', border: 'none', padding: '8px 24px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            Lọc
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', padding: '0 16px 16px 16px', gap: '10px' }}>
          <button style={{ backgroundColor: '#fff', color: '#495057', border: '1px solid #ced4da', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <FileDown size={14} /> Xuất dữ liệu
          </button>
          
          {/* Nút Import để test DB */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ backgroundColor: '#fff', color: '#009688', border: '1px solid #009688', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <Upload size={14} /> Import CSV
          </button>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6' }}>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>ID</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>ID giao dịch</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Ngày giao dịch</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Loại chứng từ</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Chứng từ</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Loại giao dịch</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Tổng tiền giao dịch</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Người thao tác</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Hành động</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: '#333' }}>Dữ liệu</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>Đang tải dữ liệu...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>Chưa có dữ liệu. Hãy Import CSV để tải dữ liệu mẫu.</td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', color: '#0056b3' }}>{item.logId || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.transactionId || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.transactionDate ? new Date(item.transactionDate).toLocaleDateString('vi-VN') : '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.documentType || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', color: '#0056b3' }}>{item.documentCode || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.transactionType || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.totalAmount ? item.totalAmount.toLocaleString('vi-VN') : '0'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.operator || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.action || '-'}</td>
                    <td style={{ padding: '12px 16px' }}>{item.dataDetail || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

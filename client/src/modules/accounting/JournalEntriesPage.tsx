import React, { useState, useEffect, useRef } from 'react';
import { Download, Trash2, ChevronDown, Paperclip, Settings, Plus, Menu, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Upload } from 'lucide-react';
import { http } from '../../core/api/http';
import './JournalEntriesPage.css';

export function JournalEntriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<{_id: string; name: string}[]>([]);

  // Filter state
  const [transactionId, setTransactionId] = useState('');
  const [voucherId, setVoucherId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    http.get('/system/branches').then(res => {
      const branches = (res.data.items || []).filter((b: any) => b.isActive !== false);
      setWarehouseOptions(branches);
    }).catch(() => {});
  }, []);

  const fetchData = async () => {
    try {
      let url = `/accounting/logbooks?page=${page}&limit=${limit}`;
      if (transactionId) url += `&transactionId=${transactionId}`;
      if (voucherId) url += `&voucherId=${voucherId}`;
      
      const res = await http.get(url);
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  const handleFilter = () => {
    setPage(1);
    fetchData();
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [datePart, timePart] = dateStr.split(' ');
    const [d, m, y] = datePart.split('/');
    if (timePart) {
       const [hr, min, sec] = timePart.split(':');
       return new Date(Number(y), Number(m)-1, Number(d), Number(hr), Number(min), Number(sec));
    }
    return new Date(Number(y), Number(m)-1, Number(d));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    // Use positive lookahead or simple split. Semicolon splitting is simple enough.
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
      alert('File CSV không hợp lệ hoặc trống.');
      return;
    }

    const headers = lines[0].split(';');
    const dataRows = lines.slice(1);
    
    const items = dataRows.map(row => {
      const cols = row.split(';');
      const map: any = {};
      headers.forEach((h, i) => map[h] = cols[i]);
      return map;
    });

    const uploadItems = items.map(item => ({
      transactionId: item['ID'],
      date: item['Ngày tạo'] ? parseDate(item['Ngày tạo']) : new Date(),
      type: item['Loại'],
      targetCode: item['Mã đối tượng'],
      targetName: item['Tên đối tượng'],
      voucherType: item['Chứng từ'],
      voucherId: item['ID chứng từ'],
      revenue: Number(item['Số tiền'] || 0),
      accountCode: item['Nợ'],
      contraAccountCode: item['Có'],
      description: item['Diễn giải'],
      creatorName: item['Người tạo'],
    }));

    try {
      const res = await http.post('/accounting/logbooks/bulk', { items: uploadItems });
      alert(`Đã upload thành công ${res.data.processed} giao dịch`);
      fetchData();
    } catch (err: any) {
      alert('Lỗi upload: ' + err.message);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatMoney = (val: number) => {
    if (!val) return '';
    return Number(val).toLocaleString('vi-VN');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}`;
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(items.map(i => i._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.length} dòng đã chọn?`)) return;

    try {
      for (const id of selectedIds) {
        await http.delete(`/accounting/logbooks/${id}`);
      }
      setSelectedIds([]);
      fetchData();
    } catch (err) {
      alert('Lỗi khi xóa');
    }
  };

  const handleExportCSV = () => {
    const csv = [
      ['ID', 'Ngày tạo', 'Loại', 'Đối tượng', 'Chứng từ', 'Số tiền', 'Nợ', 'Có', 'Ghi chú'].join(','),
      ...items.map(item => [
        `"${item.transactionId || ''}"`,
        `"${item.date || ''}"`,
        `"${item.type || ''}"`,
        `""`,
        `"${item.voucherId || ''}"`,
        item.debit || item.credit || 0,
        `"${item.account || ''}"`,
        `"${item.contraAccount || ''}"`,
        `"${item.description || ''}"`
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `but_toan_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="je-page">
      <div className="je-card">
        <div className="je-filters">
          <div className="je-filter-group" style={{ width: 140 }}>
            <div className="je-input-wrapper">
              <select className="je-select" style={{ width: '100%' }}>
                <option>Kho hàng</option>
                {warehouseOptions.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown className="je-select-icon" size={14} />
            </div>
          </div>

          <div className="je-filter-group" style={{ width: 120 }}>
            <div className="je-input-wrapper">
              <input 
                type="text" 
                className="je-input" 
                placeholder="ID" 
                value={transactionId}
                onChange={e => setTransactionId(e.target.value)}
              />
            </div>
          </div>

          <div className="je-filter-group" style={{ width: 150, marginTop: 8 }}>
            <label className="je-filter-label">Kiểu ngày</label>
            <div className="je-input-wrapper">
              <select className="je-select" style={{ width: '100%' }}>
                <option>Ngày giao dịch</option>
                <option>Ngày tạo</option>
              </select>
              <ChevronDown className="je-select-icon" size={14} />
            </div>
          </div>

          <div className="je-filter-group" style={{ width: 220, marginTop: 8 }}>
            <label className="je-filter-label">Ngày tạo</label>
            <div className="je-input-wrapper">
              <input type="text" className="je-input" placeholder="05/05/2026 - 05/06/2026" />
            </div>
          </div>

          <div className="je-filter-group" style={{ width: 140 }}>
            <div className="je-input-wrapper">
              <select className="je-select" style={{ width: '100%' }}>
                <option>Chứng từ</option>
              </select>
              <ChevronDown className="je-select-icon" size={14} />
            </div>
          </div>

          <div className="je-filter-group" style={{ width: 120 }}>
            <div className="je-input-wrapper">
              <input 
                type="text" 
                className="je-input" 
                placeholder="ID chứng từ" 
                value={voucherId}
                onChange={e => setVoucherId(e.target.value)}
              />
            </div>
          </div>

          <div className="je-filter-group" style={{ width: 120 }}>
            <div className="je-input-wrapper">
              <input type="text" className="je-input" placeholder="Số tiền" />
            </div>
          </div>

          <button className="je-btn-filter" onClick={handleFilter}>
            Lọc <ChevronDown size={14} style={{ marginLeft: 4 }} />
          </button>
        </div>

        <div className="je-actions-bar">
          <div className="je-actions-left">
            <div className="je-btn-add">
              <div className="je-btn-add-main">Thêm giao dịch</div>
              <div className="je-btn-add-split" style={{ position: 'relative' }}>
                <label className="je-upload-label" style={{ margin: 0, padding: 0 }}>
                  <ChevronDown size={14} />
                  <input 
                    type="file" 
                    accept=".csv" 
                    style={{ display: 'none' }} 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>

            <button className="je-btn-outline" onClick={handleExportCSV}>
              <Download size={14} /> Xuất dữ liệu
            </button>

            <button className="je-btn-outline text-danger" onClick={handleDeleteSelected}>
              <Trash2 size={14} /> Xóa các dòng đã chọn
            </button>
          </div>

          <div className="je-pagination">
            <span>{total > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} / {total}</span>
            <div className="je-pagination-icons">
              <button disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft size={16} /></button>
              <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
              <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
              <button disabled={page * limit >= total} onClick={() => setPage(Math.ceil(total / limit))}><ChevronsRight size={16} /></button>
            </div>
          </div>
        </div>

        <div className="je-table-wrapper">
          <table className="je-table">
            <thead>
              <tr>
                <th><input type="checkbox" className="je-row-checkbox" onChange={handleSelectAll} checked={items.length > 0 && selectedIds.length === items.length} /></th>
                <th>ID | Ngày</th>
                <th>Loại</th>
                <th className="je-text-left">Đối tượng</th>
                <th className="je-text-left">Chứng từ</th>
                <th className="je-text-right">Số tiền</th>
                <th>Nợ</th>
                <th>Có</th>
                <th className="je-text-left">Ghi chú</th>
                <th><Paperclip size={14} /></th>
                <th><Settings size={14} /></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item._id}>
                  <td>
                    <input 
                      type="checkbox" 
                      className="je-row-checkbox" 
                      checked={selectedIds.includes(item._id)}
                      onChange={() => handleSelect(item._id)}
                    />
                  </td>
                  <td>
                    <div className="je-link">{item.transactionId}</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>{item.date || ''}</div>
                  </td>
                  <td>Bút toán</td>
                  <td className="je-text-left">
                    <div>{item.account}</div>
                  </td>
                  <td className="je-text-left">
                    {item.voucherId && <span className="je-link">{item.voucherId}</span>}
                  </td>
                  <td className="je-text-right">{formatMoney(item.debit || item.credit)}</td>
                  <td>{item.account}</td>
                  <td>{item.contraAccount}</td>
                  <td className="je-text-left">{item.description}</td>
                  <td>
                    <Plus size={14} className="je-plus-icon" />
                  </td>
                  <td>
                    <div className="je-hamburger">
                      <Menu size={14} style={{ marginRight: 2 }} /> 
                      <ChevronDown size={12} />
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

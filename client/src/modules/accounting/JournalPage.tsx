import React, { useState, useEffect, useRef } from 'react';
import { Download, ChevronDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Upload } from 'lucide-react';
import { http } from '../../core/api/http';
import './JournalPage.css';

export function JournalPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  
  // Filter state
  const [transactionId, setTransactionId] = useState('');
  const [voucherId, setVoucherId] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
      alert('File CSV không hợp lệ hoặc trống.');
      return;
    }

    const headers = lines[0].split(';');
    const dataRows = lines.slice(1);
    
    const parsedItems = dataRows.map(row => {
      const cols = row.split(';');
      const map: any = {};
      headers.forEach((h, i) => map[h] = cols[i]);
      return map;
    });

    const uploadItems = parsedItems.map(item => ({
      date: item['Ngày giao dịch'],
      transactionId: item['ID giao dịch'],
      voucherId: item['Chứng từ'],
      account: item['TK Nợ | TK Có'],
      contraAccount: item['Tài khoản đối ứng'],
      debit: item['Nợ'] ? Number(item['Nợ']) : null,
      credit: item['Có'] ? Number(item['Có']) : null,
    }));

    try {
      const res = await http.post('/accounting/logbooks/bulk', { items: uploadItems });
      alert(`Đã import thành công ${res.data.processed} dòng sổ nhật ký`);
      fetchData();
    } catch (err: any) {
      alert('Lỗi upload: ' + err.message);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatMoney = (val: number | null | undefined) => {
    if (val === null || val === undefined || val === 0) return '';
    return Number(val).toLocaleString('vi-VN');
  };

  const handleExportCSV = () => {
    const csv = [
      ['Ngày giao dịch', 'ID giao dịch', 'Chứng từ', 'TK Nợ | TK Có', 'Tài khoản đối ứng', 'Nợ', 'Có'].join(','),
      ...items.map(item => [
        `"${item.date || ''}"`,
        `"${item.transactionId || ''}"`,
        `"${item.voucherId || ''}"`,
        `"${item.account || ''}"`,
        `"${item.contraAccount || ''}"`,
        item.debit || 0,
        item.credit || 0
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `so_nhat_ky_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Group items by transactionId
  const groupsMap = new Map();
  items.forEach(item => {
    // If no transactionId (shouldn't happen, but fallback)
    const key = item.transactionId || item._id;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(item);
  });
  const groups = Array.from(groupsMap.values());

  return (
    <div className="jl-page">
      <div className="jl-card">
        <div className="jl-filters">
          <div className="jl-filter-group" style={{ width: 140 }}>
            <div className="jl-input-wrapper">
              <select className="jl-select" style={{ width: '100%' }}>
                <option>Cửa hàng</option>
              </select>
              <ChevronDown className="jl-select-icon" size={14} />
            </div>
          </div>

          <div className="jl-filter-group" style={{ width: 220, marginTop: 8 }}>
            <label className="jl-filter-label">Ngày tạo</label>
            <div className="jl-input-wrapper">
              <input type="text" className="jl-input" placeholder="05/05/2026 - 05/06/2026" />
            </div>
          </div>

          <div className="jl-filter-group" style={{ width: 120 }}>
            <div className="jl-input-wrapper">
              <input 
                type="text" 
                className="jl-input" 
                placeholder="Chứng từ" 
                value={voucherId}
                onChange={e => setVoucherId(e.target.value)}
              />
            </div>
          </div>

          <div className="jl-filter-group" style={{ width: 120 }}>
            <div className="jl-input-wrapper">
              <input type="text" className="jl-input" placeholder="Mã tài khoản nợ" />
            </div>
          </div>

          <div className="jl-filter-group" style={{ width: 120 }}>
            <div className="jl-input-wrapper">
              <input type="text" className="jl-input" placeholder="Mã tài khoản có" />
            </div>
          </div>

          <button className="jl-btn-filter" onClick={handleFilter}>
            Lọc
          </button>
        </div>

        <div className="jl-actions-bar">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="jl-btn-outline" onClick={handleExportCSV}>
              <Download size={14} /> Xuất dữ liệu
            </button>
            <button className="jl-btn-outline" style={{ position: 'relative' }}>
              <label className="jl-upload-label">
                <Upload size={14} style={{ marginRight: 6 }} /> Import CSV
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
              </label>
            </button>
          </div>

          <div className="jl-pagination">
            <span>{total > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} / {total}</span>
            <div className="jl-pagination-icons">
              <button disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft size={16} /></button>
              <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
              <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
              <button disabled={page * limit >= total} onClick={() => setPage(Math.ceil(total / limit))}><ChevronsRight size={16} /></button>
            </div>
          </div>
        </div>

        <div className="jl-table-wrapper">
          <table className="jl-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th style={{ width: 120 }}>Ngày giao dịch</th>
                <th style={{ width: 120 }}>ID giao dịch</th>
                <th style={{ width: 120 }}>Chứng từ</th>
                <th className="jl-text-left">TK Nợ | TK Có</th>
                <th className="jl-text-left">Tài khoản đối ứng</th>
                <th className="jl-text-right" style={{ width: 120 }}>Nợ</th>
                <th className="jl-text-right" style={{ width: 120 }}>Có</th>
              </tr>
            </thead>
            {groups.map((group, groupIndex) => {
              // the first item in the group that has date/transactionId populated
              const headItem = group.find((i: any) => i.date) || group[0];
              
              return (
                <tbody key={headItem.transactionId || groupIndex}>
                  {group.map((item: any, i: number) => (
                    <tr key={item._id} className={i > 0 ? "jl-sub-row" : ""}>
                      {i === 0 && (
                        <>
                          <td rowSpan={group.length}>{(page - 1) * limit + groupIndex + 1}</td>
                          <td rowSpan={group.length}>{headItem.date}</td>
                          <td rowSpan={group.length}><span className="jl-link">{headItem.transactionId}</span></td>
                          <td rowSpan={group.length}><span className="jl-link">{headItem.voucherId}</span></td>
                        </>
                      )}
                      <td className="jl-text-left">{item.account}</td>
                      <td className="jl-text-left">{item.contraAccount}</td>
                      <td className="jl-text-right">{formatMoney(item.debit)}</td>
                      <td className="jl-text-right">{formatMoney(item.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            {items.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Không có dữ liệu
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

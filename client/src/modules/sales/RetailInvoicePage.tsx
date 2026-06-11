import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, WalletCards, Warehouse, MapPin, Phone, X, ArrowRight, Check } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';
import { http } from '../../core/api/http';

type RetailInvoicePageProps = {
  channel: string;
};

export function RetailInvoicePage({ channel }: RetailInvoicePageProps) {
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState('');
  const navigate = useNavigate();

  // states for confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [confirmForm, setConfirmForm] = useState({
    orderId: '',
    senderName: '',
    transactionCode: '',
    bankName: '',
    bankAccountNo: '',
    transactionDate: new Date().toISOString().slice(0,10),
    store: '',
    transactionContent: '',
    confirmedBy: '',
  });

  useEffect(() => {
    http.get('/auth/me').then(res => setCurrentUser(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (showConfirmModal) {
      setLoadingConfirm(true);
      http.get('/products/sales?limit=100')
        .then(res => {
          // Filter completed sales (they've been paid)
          const items = (res.data.items || []).filter((inv: any) => inv.status === 'completed');
          setUnpaidInvoices(items);
        })
        .finally(() => setLoadingConfirm(false));
    }
  }, [showConfirmModal]);

  const handleOrderSelect = (orderId: string) => {
    const inv = unpaidInvoices.find(i => i.id === orderId);
    if (inv) {
      setConfirmForm(prev => ({
        ...prev,
        orderId: inv.id,
        senderName: inv.customerName || '',
        store: inv.branchName || inv.orderSource || '',
        transactionContent: `Thanh toán cho đơn hàng ${inv.id}`,
        confirmedBy: currentUser?.name || 'Admin'
      }));
    } else {
      setConfirmForm(prev => ({ ...prev, orderId }));
    }
  };

  const handleSaveConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Confirm payment is now just a note/record - the sale is already completed
      // Nothing to update in the new model, just close the modal
      alert('Chức năng này đã được tự động xử lý khi tạo đơn hàng mới.');
      setShowConfirmModal(false);
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra');
    }
  };

  useEffect(() => {
    if (showBranchModal) {
      setLoadingBranches(true);
      setBranchError('');
      http.get('/system/branches')
        .then((res) => {
          const list = res.data.items ?? [];
          setBranches(list);
          if (list.length > 0) {
            const defaultBranch = list.find((b: any) => b.isDefault) || list[0];
            setSelectedBranchId(defaultBranch._id);
          } else {
            setBranchError('Không tìm thấy kho hàng nào. Vui lòng tạo kho hàng trước.');
          }
        })
        .catch((err) => {
          console.error(err);
          setBranchError('Lỗi tải danh sách kho hàng. Vui lòng kiểm tra lại kết nối.');
        })
        .finally(() => {
          setLoadingBranches(false);
        });
    }
  }, [showBranchModal]);

  const handleConfirmBranch = () => {
    if (!selectedBranchId) return;
    setShowBranchModal(false);
    navigate(`/sales-channels/${channel}/retail/create?branchId=${selectedBranchId}`);
  };

  return (
    <>
      <TabbedModulePage
        tabs={[
          {
            key: 'all',
            label: 'Tất cả',
            title: 'Hóa đơn bán lẻ - Tất cả',
            subtitle: 'Danh sách tất cả hóa đơn bán lẻ (từ kho thật)',
            endpoint: '/products/sales',
            icon: <FileSpreadsheet size={24} />,
            primaryActionLabel: 'Thêm hóa đơn lẻ',
            onPrimaryActionClick: () => setShowBranchModal(true),
            fields: [
              { key: 'createdAt', label: 'Ngày tạo' },
              { key: 'code', label: 'Mã hóa đơn' },
              { key: 'customerId.name', label: 'Khách hàng' },
              { key: 'amountProducts', label: 'Số lượng SP' },
              { key: 'value', label: 'Tổng tiền', type: 'money' },
              { key: 'status', label: 'Trạng thái', type: 'status' },
            ],
            formFields: [
              { key: 'code', label: 'Mã hóa đơn', required: true },
              { key: 'note', label: 'Ghi chú', type: 'textarea' },
              {
                key: 'status',
                label: 'Trạng thái',
                type: 'select',
                options: [
                  { label: 'draft', value: 'draft' },
                  { label: 'completed', value: 'completed' },
                  { label: 'cancelled', value: 'cancelled' },
                ],
              },
            ],
            createDefaults: {
              code: '',
              note: '',
              status: 'draft',
            },
          },
          {
            key: 'confirm',
            label: 'Xác nhận thanh toán',
            title: 'Bán lẻ - Xác nhận thanh toán',
            subtitle: 'Danh sách giao dịch chuyển khoản chờ xác nhận',
            endpoint: '/products/sales?status=completed',
            icon: <WalletCards size={24} />,
            primaryActionLabel: 'Thêm xác nhận thanh toán',
            onPrimaryActionClick: () => {
              setConfirmForm({
                orderId: '',
                senderName: '',
                transactionCode: '',
                bankName: '',
                bankAccountNo: '',
                transactionDate: new Date().toISOString().slice(0,10),
                store: '',
                transactionContent: '',
                confirmedBy: currentUser?.name || 'Admin',
              });
              setShowConfirmModal(true);
            },
            fields: [
              { key: 'orderId', label: 'ID đơn hàng' },
              { key: 'senderName', label: 'Khách chuyển khoản' },
              { key: 'transactionCode', label: 'Mã giao dịch' },
              { key: 'bankName', label: 'Ngân hàng' },
              { key: 'bankAccountNo', label: 'Số tài khoản' },
              { key: 'transactionDate', label: 'Ngày giao dịch' },
              { key: 'store', label: 'Cửa hàng' },
              { key: 'transactionContent', label: 'Nội dung giao dịch' },
              { key: 'confirmedBy', label: 'Người xác nhận' },
            ],
            formFields: [
              { key: 'orderId', label: 'ID đơn hàng', required: true },
              { key: 'senderName', label: 'Khách chuyển khoản', required: true },
              { key: 'transactionCode', label: 'Mã giao dịch', required: true },
              { key: 'bankName', label: 'Ngân hàng', required: true },
              { key: 'bankAccountNo', label: 'Số tài khoản' },
              { key: 'transactionDate', label: 'Ngày giao dịch' },
              { key: 'store', label: 'Cửa hàng' },
              { key: 'transactionContent', label: 'Nội dung giao dịch', type: 'textarea' },
              { key: 'confirmedBy', label: 'Người xác nhận' },
            ],
            createDefaults: {
              tabs: ['confirm'],
              orderId: '',
              senderName: '',
              transactionCode: '',
              bankName: '',
              bankAccountNo: '',
              transactionDate: new Date().toLocaleDateString('vi-VN'),
              store: '',
              transactionContent: '',
              confirmedBy: '',
            },
          },
        ]}
      />

      {showBranchModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ maxWidth: '600px', width: '100%', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#f8fafc', padding: '0', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
                  <Warehouse size={22} color="#ffffff" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Chọn Kho / Chi Nhánh</h2>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0 0' }}>Bán lẻ cần xác định kho xuất hàng tương ứng</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowBranchModal(false)}
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)'; e.currentTarget.style.color = '#f43f5e'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '24px 28px', maxHeight: '400px', overflowY: 'auto' }}>
              {loadingBranches ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', border: '3px solid rgba(99, 102, 241, 0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                  <span style={{ color: '#94a3b8', fontSize: '14px' }}>Đang tải danh sách kho...</span>
                </div>
              ) : branchError ? (
                <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: '10px', padding: '16px', color: '#fda4af', fontSize: '14px', textAlign: 'center' }}>
                  {branchError}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {branches.map((branch) => {
                    const isSelected = selectedBranchId === branch._id;
                    return (
                      <div 
                        key={branch._id}
                        onClick={() => setSelectedBranchId(branch._id)}
                        style={{ 
                          padding: '16px',
                          borderRadius: '12px',
                          border: isSelected ? '2px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.06)',
                          background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.1)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.06)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginRight: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff' }}>{branch.name}</span>
                            <span style={{ background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.08)', color: isSelected ? '#a5b4fc' : '#94a3b8', fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                              {branch.code}
                            </span>
                            {branch.isDefault && (
                              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                                Mặc định
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {branch.address && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>
                                <MapPin size={13} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{branch.address}</span>
                              </div>
                            )}
                            {branch.phone && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>
                                <Phone size={13} style={{ flexShrink: 0 }} />
                                <span>{branch.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: isSelected ? '2px solid #6366f1' : '2px solid rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isSelected ? '#6366f1' : 'transparent', transition: 'all 0.2s' }}>
                          {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: '20px 28px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'rgba(0, 0, 0, 0.15)' }}>
              <button 
                className="btn btn-light" 
                type="button" 
                onClick={() => setShowBranchModal(false)}
                style={{ borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'transparent' }}
              >
                Hủy
              </button>
              <button 
                className="btn btn-primary" 
                type="button" 
                disabled={!selectedBranchId || loadingBranches}
                onClick={handleConfirmBranch}
                style={{ 
                  borderRadius: '8px', 
                  padding: '10px 22px', 
                  fontSize: '14px', 
                  fontWeight: '500', 
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
                  border: 'none', 
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: (!selectedBranchId || loadingBranches) ? 0.6 : 1,
                  cursor: (!selectedBranchId || loadingBranches) ? 'not-allowed' : 'pointer'
                }}
              >
                Tiếp tục <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ maxWidth: '600px', width: '100%', borderRadius: '16px', background: '#ffffff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#e0e7ff', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                  <WalletCards size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Thêm xác nhận thanh toán</h2>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>Ghi nhận khách đã chuyển khoản cho đơn hàng</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfirm}>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Chọn đơn hàng chưa thanh toán <span style={{ color: '#ef4444' }}>*</span></label>
                  {loadingConfirm ? (
                    <div style={{ padding: '10px', color: '#64748b', fontSize: '13px' }}>Đang tải danh sách đơn hàng...</div>
                  ) : (
                    <select required value={confirmForm.orderId} onChange={(e) => handleOrderSelect(e.target.value)} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#1e293b', background: '#f8fafc' }}>
                      <option value="">-- Bấm để chọn mã đơn hàng --</option>
                      {unpaidInvoices.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.id} - Khách: {inv.customerName} - {inv.totalAmount?.toLocaleString('vi-VN')}đ</option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Khách chuyển khoản <span style={{ color: '#ef4444' }}>*</span></label>
                    <input required type="text" placeholder="Tên người chuyển khoản" value={confirmForm.senderName} onChange={(e) => setConfirmForm(p => ({...p, senderName: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Mã giao dịch <span style={{ color: '#ef4444' }}>*</span></label>
                    <input required type="text" placeholder="Ví dụ: FT20394..." value={confirmForm.transactionCode} onChange={(e) => setConfirmForm(p => ({...p, transactionCode: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ngân hàng nhận <span style={{ color: '#ef4444' }}>*</span></label>
                    <input required type="text" placeholder="Ví dụ: Vietcombank" value={confirmForm.bankName} onChange={(e) => setConfirmForm(p => ({...p, bankName: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Số tài khoản nhận</label>
                    <input type="text" placeholder="Số tài khoản của shop" value={confirmForm.bankAccountNo} onChange={(e) => setConfirmForm(p => ({...p, bankAccountNo: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ngày giao dịch</label>
                    <input type="date" value={confirmForm.transactionDate} onChange={(e) => setConfirmForm(p => ({...p, transactionDate: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Người xác nhận</label>
                    <input type="text" readOnly value={confirmForm.confirmedBy} onChange={(e) => setConfirmForm(p => ({...p, confirmedBy: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', background: '#f8fafc', color: '#64748b' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nội dung giao dịch / Ghi chú</label>
                  <textarea rows={3} placeholder="Nội dung chuyển khoản..." value={confirmForm.transactionContent} onChange={(e) => setConfirmForm(p => ({...p, transactionContent: e.target.value}))} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', resize: 'vertical', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                <button type="button" onClick={() => setShowConfirmModal(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: '600', cursor: 'pointer' }}>Hủy bỏ</button>
                <button type="submit" disabled={!confirmForm.orderId} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff', fontWeight: '600', cursor: confirmForm.orderId ? 'pointer' : 'not-allowed', opacity: confirmForm.orderId ? 1 : 0.6, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}>Lưu xác nhận</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

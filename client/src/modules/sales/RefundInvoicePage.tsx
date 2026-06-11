import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Warehouse, MapPin, Phone, X, ArrowRight, Check } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';
import { http } from '../../core/api/http';

type RefundInvoicePageProps = {
  channel: string;
};

export function RefundInvoicePage({ channel }: RefundInvoicePageProps) {
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState('');
  const navigate = useNavigate();

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
    navigate(`/sales-channels/${channel}/refund/create?branchId=${selectedBranchId}`);
  };

  return (
    <>
      <TabbedModulePage
        tabs={[
          {
            key: 'refund',
            label: 'Trả hàng',
            title: 'Hóa đơn trả hàng',
            subtitle: 'Danh sách hóa đơn trả hàng từ khách hàng',
            endpoint: '/products/refunds',
            icon: <FileSpreadsheet size={24} />,
            primaryActionLabel: 'Thêm mới',
            onPrimaryActionClick: () => setShowBranchModal(true),
            fields: [
              { key: 'createdAt', label: 'Ngày' },
              { key: 'code', label: 'Mã hóa đơn' },
              { key: 'paymentId.code', label: 'Hóa đơn gốc' },
              { key: 'amountProducts', label: 'Số lượng' },
              { key: 'value', label: 'Tiền trả khách', type: 'money' },
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
              status: 'draft'
            }
          }
        ]}
      />

      {showBranchModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', zIndex: 1000 }}>
          <div className="modal-card" style={{ maxWidth: '600px', width: '100%', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#f8fafc', padding: '0', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)' }}>
                  <Warehouse size={22} color="#ffffff" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Chọn Kho / Chi Nhánh Nhận Trả Hàng</h2>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0 0' }}>Trả hàng cần xác định kho nhận hàng tương ứng</p>
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
                  <div style={{ width: '36px', height: '36px', border: '3px solid rgba(124, 58, 237, 0.1)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
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
                          border: isSelected ? '2px solid #7c3aed' : '1px solid rgba(255, 255, 255, 0.06)',
                          background: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 4px 12px rgba(124, 58, 237, 0.1)' : 'none'
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
                            <span style={{ background: isSelected ? 'rgba(124, 58, 237, 0.2)' : 'rgba(255, 255, 255, 0.08)', color: isSelected ? '#ddd6fe' : '#94a3b8', fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
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
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: isSelected ? '2px solid #7c3aed' : '2px solid rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isSelected ? '#7c3aed' : 'transparent', transition: 'all 0.2s' }}>
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
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', 
                  border: 'none', 
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
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
    </>
  );
}

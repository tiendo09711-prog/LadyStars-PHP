import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';
import { CareActionType, CareActionIcons, CustomerCareActionModal } from './components/CustomerCareActionModal';

const fields: any[] = [
  { key: 'code', label: 'ID Phiếu' },
  { key: 'customerName', label: 'Tên KH' },
  { key: 'customerPhone', label: 'SĐT' },
  { key: 'details', label: 'Chi tiết' },
  { key: 'reason', label: 'Lý do' },
  { key: 'description', label: 'Mô tả' },
  { key: 'creator', label: 'Người tạo' },
  { key: 'recordDate', label: 'Ngày tạo', type: 'date' }
];

const formFields: any[] = [
  { key: 'code', label: 'ID Phiếu (Có thể nhập hoặc sinh tự động)', required: true },
  { key: 'customerCode', label: 'Mã khách hàng (nếu có)' },
  { key: 'customerName', label: 'Tên khách hàng', required: true },
  { key: 'customerPhone', label: 'Số điện thoại' },
  { key: 'details', label: 'Chi tiết (Ví dụ: -65 điểm)', type: 'textarea' },
  { key: 'reason', label: 'Lý do' },
  { key: 'description', label: 'Mô tả', type: 'textarea' },
  { key: 'creator', label: 'Người tạo' },
  { key: 'recordDate', label: 'Ngày tạo', type: 'date' },
];

const createDefaults = {
  code: `CC${Date.now().toString().slice(-6)}`,
  customerCode: '',
  customerName: '',
  customerPhone: '',
  details: '',
  reason: '',
  description: '',
  creator: 'Admin',
  recordDate: new Date().toISOString().slice(0, 10),
};

export function CustomerCarePage() {
  const [activeAction, setActiveAction] = useState<CareActionType | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const actionsList: CareActionType[] = [
    'Tặng điểm', 'Trừ điểm', 'Tặng tiền tích lũy', 'Trừ tiền tích lũy', 
    'Gọi điện', 'Nhắn tin', 'Gửi email', 'Nhận cuộc gọi', 'Import hành động chăm sóc'
  ];

  const primaryActions = actionsList.map(action => ({
    label: action,
    icon: CareActionIcons[action],
    onClick: () => setActiveAction(action)
  }));

  return (
    <>
      <DataModulePage
        key={refreshKey}
        title="Danh sách phiếu chăm sóc khách hàng"
        subtitle="Ghi nhận các hoạt động chăm sóc, thu hồi và tương tác với khách hàng"
        endpoint="/customers/care"
        icon={<HeartHandshake size={24} />}
        primaryActionLabel="Thêm mới"
        primaryActions={primaryActions}
        fields={fields}
        formFields={formFields}
        createDefaults={createDefaults}
      />
      {activeAction && (
        <CustomerCareActionModal
          action={activeAction}
          onClose={() => setActiveAction(null)}
          onSuccess={() => {
            setActiveAction(null);
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}
    </>
  );
}

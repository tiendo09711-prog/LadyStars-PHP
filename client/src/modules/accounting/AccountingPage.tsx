import { WalletCards } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function AccountingPage() {
  return (
    <DataModulePage
      title="Kế toán"
      subtitle="Loại phiếu thu chi, phiếu thu, phiếu chi và báo cáo bán hàng"
      endpoint="/accounting/types"
      icon={<WalletCards size={24} />}
      primaryActionLabel="Thêm loại phiếu"
      fields={[
        { key: 'name', label: 'Tên loại phiếu' },
        { key: 'kind', label: 'Loại', type: 'status' },
        { key: 'description', label: 'Mô tả' },
        { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
      ]}
      formFields={[
        { key: 'name', label: 'Tên loại phiếu', required: true },
        { key: 'kind', label: 'Loại', type: 'select', options: [
          { label: 'Phiếu thu', value: 'receipt' },
          { label: 'Phiếu chi', value: 'payment' },
        ] },
        { key: 'description', label: 'Mô tả', type: 'textarea' },
      ]}
      createDefaults={{ name: '', kind: 'receipt', description: '' }}
      quickFilters={[
        { label: 'Phiếu thu', value: 'receipt' },
        { label: 'Phiếu chi', value: 'payment' },
      ]}
    />
  );
}

import { Users } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function CustomerPage() {
  return (
    <DataModulePage
      title="Khách hàng"
      subtitle="Quản lý khách hàng, nhóm khách hàng và thông tin liên hệ"
      endpoint="/customers/customers"
      icon={<Users size={24} />}
      primaryActionLabel="Thêm khách hàng"
      fields={[
        { key: 'code', label: 'Mã KH' },
        { key: 'name', label: 'Tên khách hàng' },
        { key: 'type', label: 'Loại', type: 'status' },
        { key: 'phone', label: 'Số điện thoại' },
        { key: 'email', label: 'Email' },
        { key: 'address', label: 'Địa chỉ' },
      ]}
      formFields={[
        { key: 'code', label: 'Mã KH', required: true },
        { key: 'name', label: 'Tên khách hàng', required: true },
        { key: 'type', label: 'Loại', type: 'select', options: [
          { label: 'Cá nhân', value: 'person' },
          { label: 'Công ty', value: 'company' },
        ] },
        { key: 'phone', label: 'Số điện thoại' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'note', label: 'Ghi chú', type: 'textarea' },
      ]}
      createDefaults={{ code: '', name: '', type: 'person', phone: '', email: '', address: '', note: '' }}
      quickFilters={[
        { label: 'Cá nhân', value: 'person' },
        { label: 'Công ty', value: 'company' },
      ]}
    />
  );
}

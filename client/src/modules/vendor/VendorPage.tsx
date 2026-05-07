import { Building2 } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function VendorPage() {
  return (
    <DataModulePage
      title="Nhà cung cấp"
      subtitle="Nhà cung cấp, nhập hàng, trả hàng nhập và chuyển kho"
      endpoint="/vendors/vendors"
      icon={<Building2 size={24} />}
      primaryActionLabel="Thêm nhà cung cấp"
      fields={[
        { key: 'code', label: 'Mã NCC' },
        { key: 'name', label: 'Tên nhà cung cấp' },
        { key: 'type', label: 'Loại', type: 'status' },
        { key: 'phone', label: 'Số điện thoại' },
        { key: 'email', label: 'Email' },
        { key: 'address', label: 'Địa chỉ' },
      ]}
      formFields={[
        { key: 'code', label: 'Mã NCC', required: true },
        { key: 'name', label: 'Tên nhà cung cấp', required: true },
        { key: 'type', label: 'Loại', type: 'select', options: [
          { label: 'Cá nhân', value: 'person' },
          { label: 'Công ty', value: 'company' },
        ] },
        { key: 'phone', label: 'Số điện thoại' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'note', label: 'Ghi chú', type: 'textarea' },
      ]}
      createDefaults={{ code: '', name: '', type: 'company', phone: '', email: '', address: '', note: '' }}
      quickFilters={[
        { label: 'Cá nhân', value: 'person' },
        { label: 'Công ty', value: 'company' },
      ]}
    />
  );
}

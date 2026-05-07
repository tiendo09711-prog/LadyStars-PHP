import { Users, UserRoundCog } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';

export function CustomerPage() {
  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'customers',
          label: 'Khách hàng',
          title: 'Khách hàng',
          subtitle: 'Quản lý khách hàng, nhóm, thông tin liên hệ và mã số thuế',
          endpoint: '/customers/customers',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm khách hàng',
          fields: [
            { key: 'code', label: 'Mã KH' },
            { key: 'name', label: 'Tên khách hàng' },
            { key: 'type', label: 'Loại', type: 'status' },
            { key: 'status', label: 'Trạng thái', type: 'status' },
            { key: 'phone', label: 'Số điện thoại' },
            { key: 'email', label: 'Email' },
          ],
          formFields: [
            { key: 'code', label: 'Mã KH', required: true },
            { key: 'name', label: 'Tên khách hàng', required: true },
            { key: 'type', label: 'Loại', type: 'select', options: [{ label: 'Cá nhân', value: 'person' }, { label: 'Công ty', value: 'company' }] },
            { key: 'phone', label: 'Số điện thoại' },
            { key: 'phone2', label: 'Số điện thoại 2' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'birthday', label: 'Ngày sinh', type: 'date' },
            { key: 'sex', label: 'Giới tính', type: 'select', options: [{ label: 'Nữ', value: 'female' }, { label: 'Nam', value: 'male' }, { label: 'Khác', value: 'other' }] },
            { key: 'company', label: 'Công ty' },
            { key: 'vat', label: 'Mã số thuế' },
            { key: 'facebook', label: 'Facebook' },
            { key: 'address', label: 'Địa chỉ' },
            { key: 'note', label: 'Ghi chú', type: 'textarea' },
          ],
          createDefaults: { code: '', name: '', type: 'person', phone: '', phone2: '', email: '', birthday: '', sex: 'female', company: '', vat: '', facebook: '', address: '', note: '' },
          quickFilters: [{ label: 'Cá nhân', value: 'person' }, { label: 'Công ty', value: 'company' }],
        },
        {
          key: 'groups',
          label: 'Nhóm khách',
          title: 'Nhóm khách hàng',
          subtitle: 'Nhóm điều kiện và phân loại khách hàng',
          endpoint: '/customers/groups',
          icon: <UserRoundCog size={24} />,
          primaryActionLabel: 'Thêm nhóm khách',
          fields: [{ key: 'name', label: 'Tên nhóm' }, { key: 'type', label: 'Loại', type: 'status' }, { key: 'note', label: 'Ghi chú' }],
          formFields: [
            { key: 'name', label: 'Tên nhóm', required: true },
            { key: 'type', label: 'Loại', type: 'select', options: [{ label: 'Loại 1', value: '1' }, { label: 'Loại 2', value: '2' }, { label: 'Loại 3', value: '3' }] },
            { key: 'note', label: 'Ghi chú', type: 'textarea' },
          ],
          createDefaults: { name: '', type: '1', note: '' },
        },
      ]}
    />
  );
}

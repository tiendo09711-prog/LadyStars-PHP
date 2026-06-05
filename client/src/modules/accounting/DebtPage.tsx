import { Building2, FilePlus, User, Users } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';

export function DebtPage() {
  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'customers',
          label: 'Khách hàng',
          title: 'Công nợ khách hàng',
          subtitle: 'Quản lý công nợ của khách hàng',
          endpoint: '/accounting/debt/customers',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm công nợ',
          fields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          formFields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          createDefaults: { placeholder: '' },
        },
        {
          key: 'sales-staff',
          label: 'Nhân viên bán hàng',
          title: 'Công nợ nhân viên bán hàng',
          subtitle: 'Quản lý công nợ của nhân viên',
          endpoint: '/accounting/debt/sales-staff',
          icon: <User size={24} />,
          primaryActionLabel: 'Thêm công nợ',
          fields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          formFields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          createDefaults: { placeholder: '' },
        },
        {
          key: 'vendors',
          label: 'Nhà cung cấp',
          title: 'Công nợ nhà cung cấp',
          subtitle: 'Quản lý công nợ của nhà cung cấp',
          endpoint: '/accounting/debt/vendors',
          icon: <Building2 size={24} />,
          primaryActionLabel: 'Thêm công nợ',
          fields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          formFields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          createDefaults: { placeholder: '' },
        },
        {
          key: 'opening-debt',
          label: 'Nhập công nợ đầu kỳ',
          title: 'Nhập công nợ đầu kỳ',
          subtitle: 'Nhập dữ liệu công nợ ban đầu',
          endpoint: '/accounting/debt/opening',
          icon: <FilePlus size={24} />,
          primaryActionLabel: 'Nhập công nợ',
          fields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          formFields: [{ key: 'placeholder', label: 'Dữ liệu trống' }],
          createDefaults: { placeholder: '' },
        },
      ]}
    />
  );
}

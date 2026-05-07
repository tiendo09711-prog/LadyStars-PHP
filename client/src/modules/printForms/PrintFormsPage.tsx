import { Printer } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function PrintFormsPage() {
  return (
    <DataModulePage
      title="Mẫu in"
      subtitle="Template hóa đơn, phiếu nhập, phiếu trả và khổ giấy"
      endpoint="/print-forms"
      icon={<Printer size={24} />}
      primaryActionLabel="Thêm mẫu in"
      fields={[
        { key: 'code', label: 'Mã mẫu' },
        { key: 'name', label: 'Tên mẫu' },
        { key: 'type', label: 'Loại' },
        { key: 'paperSize', label: 'Khổ giấy', type: 'badge' },
        { key: 'isActive', label: 'Kích hoạt', type: 'status' },
      ]}
      formFields={[
        { key: 'code', label: 'Mã mẫu', required: true },
        { key: 'name', label: 'Tên mẫu', required: true },
        { key: 'type', label: 'Loại mẫu' },
        { key: 'paperSize', label: 'Khổ giấy', type: 'select', options: [
          { label: 'A4', value: 'A4' },
          { label: 'A5', value: 'A5' },
          { label: 'K80', value: 'K80' },
        ] },
        { key: 'templateHtml', label: 'HTML template', type: 'textarea' },
      ]}
      createDefaults={{ code: '', name: '', type: 'sale_invoice', paperSize: 'A4', templateHtml: '' }}
    />
  );
}

import { FileText, Printer, ReceiptText } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';

const formFields = [
  { key: 'code', label: 'Mã mẫu', required: true },
  { key: 'name', label: 'Tên mẫu', required: true },
  { key: 'type', label: 'Loại mẫu' },
  { key: 'paperSize', label: 'Khổ giấy', type: 'select' as const, options: [
    { label: 'A4', value: 'A4' },
    { label: 'A5', value: 'A5' },
    { label: 'K80', value: 'K80' },
  ] },
  { key: 'templateHtml', label: 'HTML template', type: 'textarea' as const },
];

const fields = [
  { key: 'code', label: 'Mã mẫu' },
  { key: 'name', label: 'Tên mẫu' },
  { key: 'type', label: 'Loại' },
  { key: 'paperSize', label: 'Khổ giấy', type: 'badge' as const },
  { key: 'isActive', label: 'Kích hoạt', type: 'status' as const },
];

export function PrintFormsPage() {
  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'all',
          label: 'Tất cả mẫu',
          title: 'Mẫu in',
          subtitle: 'Template hóa đơn, phiếu nhập, phiếu trả, phiếu thu chi và khổ giấy',
          endpoint: '/print-forms',
          icon: <Printer size={24} />,
          primaryActionLabel: 'Thêm mẫu in',
          fields,
          formFields,
          createDefaults: { code: '', name: '', type: 'sale_invoice', paperSize: 'A4', templateHtml: '' },
          quickFilters: [{ label: 'Invoice', value: 'sale_invoice' }, { label: 'Receipt', value: 'receipt' }, { label: 'Payment', value: 'payment' }],
        },
        {
          key: 'invoice',
          label: 'Hóa đơn',
          title: 'Mẫu hóa đơn',
          subtitle: 'Mẫu invoice A4/K80 dùng cho bán hàng',
          endpoint: '/print-forms',
          icon: <FileText size={24} />,
          primaryActionLabel: 'Thêm mẫu hóa đơn',
          fields,
          formFields,
          createDefaults: { code: '', name: '', type: 'sale_invoice', paperSize: 'A4', templateHtml: '' },
          quickFilters: [{ label: 'Invoice', value: 'sale_invoice' }],
        },
        {
          key: 'voucher',
          label: 'Phiếu thu chi',
          title: 'Mẫu phiếu thu chi',
          subtitle: 'Mẫu receipt/payment giống nhóm print-forms của Polirium',
          endpoint: '/print-forms',
          icon: <ReceiptText size={24} />,
          primaryActionLabel: 'Thêm mẫu phiếu',
          fields,
          formFields,
          createDefaults: { code: '', name: '', type: 'receipt', paperSize: 'A4', templateHtml: '' },
          quickFilters: [{ label: 'Receipt', value: 'receipt' }, { label: 'Payment', value: 'payment' }],
        },
      ]}
    />
  );
}

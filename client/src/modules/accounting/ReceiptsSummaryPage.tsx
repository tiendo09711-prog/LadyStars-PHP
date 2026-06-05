import { LineChart } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function ReceiptsSummaryPage() {
  return (
    <DataModulePage
      title="Tổng hợp thu chi"
      subtitle="Báo cáo dòng tiền, tổng hợp các giao dịch tiền mặt và ngân hàng"
      endpoint="/accounting/summary-transactions"
      icon={<LineChart size={28} />}
      hideCreate={true}
      hideImport={true}
      fields={[
        { key: 'transactionId', label: 'ID' },
        { key: 'date', label: 'Ngày', type: 'date' },
        { key: 'accountName', label: 'Tài khoản' },
        { key: 'type', label: 'Loại phiếu', type: 'status' },
        { key: 'targetName', label: 'Đối tượng' },
        { key: 'voucherType', label: 'Loại CT' },
        { key: 'voucherId', label: 'ID CT' },
        { key: 'revenue', label: 'Thu', type: 'money' },
        { key: 'expense', label: 'Chi', type: 'money' },
        { key: 'description', label: 'Diễn giải' },
      ]}
      formFields={[]} // Read-only summary
      createDefaults={{}}
      quickFilters={[
        { label: 'Phiếu thu', value: 'Phiếu thu' },
        { label: 'Phiếu chi', value: 'Phiếu chi' },
        { label: 'Báo có (Nộp tiền)', value: 'Báo có (Nộp tiền)' },
        { label: 'Báo nợ (Chuyển tiền)', value: 'Báo nợ (Chuyển tiền)' },
      ]}
    />
  );
}

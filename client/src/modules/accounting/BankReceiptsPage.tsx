import { Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DataModulePage } from '../../core/components/DataModulePage';

export function BankReceiptsPage() {
  const navigate = useNavigate();

  return (
    <DataModulePage
      title="Thu chi ngân hàng"
      subtitle="Quản lý sổ tiền gửi, các khoản thu chi qua ngân hàng"
      endpoint="/accounting/bank-transactions"
      icon={<Building2 size={28} />}
      primaryActionLabel="Thêm báo có/nộp tiền"
      onPrimaryActionClick={() => navigate('/accounting/bank/create')}
      fields={[
        { key: 'transactionId', label: 'ID' },
        { key: 'date', label: 'Ngày', type: 'date' },
        { key: 'type', label: 'Loại', type: 'status' },
        { key: 'accountName', label: 'Tài khoản' },
        { key: 'contraAccountName', label: 'TK đối ứng' },
        { key: 'targetName', label: 'Đối tượng' },
        { key: 'voucherType', label: 'Chứng từ' },
        { key: 'revenue', label: 'Thu', type: 'money' },
        { key: 'expense', label: 'Chi', type: 'money' },
        { key: 'creatorName', label: 'Người tạo' },
      ]}
      formFields={[]} // We use custom create page
      createDefaults={{}}
      quickFilters={[
        { label: 'Báo có (Nộp tiền)', value: 'Báo có (Nộp tiền)' },
        { label: 'Báo nợ (Chuyển tiền)', value: 'Báo nợ (Chuyển tiền)' },
      ]}
    />
  );
}

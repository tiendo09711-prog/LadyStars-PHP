import { WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DataModulePage } from '../../core/components/DataModulePage';

export function CashReceiptsPage() {
  const navigate = useNavigate();

  return (
    <DataModulePage
      title="Thu chi tiền mặt"
      subtitle="Quản lý sổ quỹ tiền mặt, các khoản thu chi"
      endpoint="/accounting/cash-transactions"
      icon={<WalletCards size={28} />}
      primaryActionLabel="Thêm phiếu thu/chi"
      onPrimaryActionClick={() => navigate('/accounting/cash/create')}
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
        { key: 'description', label: 'Diễn giải' },
        { key: 'creatorName', label: 'Người tạo' },
      ]}
      formFields={[
        { key: 'transactionId', label: 'ID Giao dịch', required: true },
        { key: 'date', label: 'Ngày', type: 'date', required: true },
        { key: 'type', label: 'Loại', type: 'select', options: [{ label: 'Phiếu thu', value: 'Phiếu thu' }, { label: 'Phiếu chi', value: 'Phiếu chi' }], required: true },
        { key: 'accountName', label: 'Tên tài khoản' },
        { key: 'contraAccountName', label: 'TK đối ứng' },
        { key: 'targetName', label: 'Đối tượng' },
        { key: 'voucherType', label: 'Loại chứng từ' },
        { key: 'revenue', label: 'Thu', type: 'number' },
        { key: 'expense', label: 'Chi', type: 'number' },
        { key: 'description', label: 'Diễn giải', type: 'textarea' },
        { key: 'creatorName', label: 'Người tạo' },
      ]}
      createDefaults={{
        transactionId: '',
        date: new Date().toISOString().slice(0, 10),
        type: 'Phiếu thu',
        accountName: '',
        contraAccountName: '',
        targetName: '',
        voucherType: '',
        revenue: 0,
        expense: 0,
        description: '',
        creatorName: '',
      }}
      quickFilters={[
        { label: 'Phiếu thu', value: 'Phiếu thu' },
        { label: 'Phiếu chi', value: 'Phiếu chi' },
      ]}
    />
  );
}

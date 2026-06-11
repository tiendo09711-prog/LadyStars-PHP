import { Users, RefreshCw } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';
import { http } from '../../core/api/http';

const commonFields: any[] = [
  { key: 'code', label: 'Mã KH' },
  { key: 'name', label: 'Tên khách hàng' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'type', label: 'Loại', type: 'status' },
  { key: 'purchaseCount', label: 'Số lần mua', type: 'number' },
  { key: 'totalSpent', label: 'Tổng tiền', type: 'money' },
  { key: 'points', label: 'Điểm', type: 'number' },
  { key: 'lastPurchaseDate', label: 'Lần mua cuối', type: 'date' },
  { key: 'daysSinceLastPurchase', label: 'Ngày chưa quay lại', type: 'number' }
];

const commonFormFields: any[] = [
  { key: 'code', label: 'Mã KH', required: true },
  { key: 'name', label: 'Tên khách hàng', required: true },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'type', label: 'Loại', type: 'select', options: [{ label: 'Cá nhân', value: 'person' }, { label: 'Công ty', value: 'company' }] },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'note', label: 'Ghi chú', type: 'textarea' },
];

const createDefaults = { code: '', name: '', phone: '', type: 'person', email: '', address: '', note: '' };

export function CustomerListPage() {
  const handleSyncMetrics = async () => {
    try {
      const res = await http.post('/customers/sync-metrics');
      if (res.data.success) {
        alert(res.data.message);
        window.location.reload();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi khi đồng bộ');
    }
  };

  const extraHeaderButtons = (
    <button className="btn btn-outline" type="button" onClick={handleSyncMetrics}>
      <RefreshCw size={16} /> Đồng bộ chỉ số mua hàng
    </button>
  );
  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'all',
          label: 'Tất cả',
          title: 'Tất cả khách hàng',
          subtitle: 'Danh sách toàn bộ khách hàng trong hệ thống',
          endpoint: '/customers/customers?tags=all',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm khách hàng',
          fields: commonFields,
          formFields: commonFormFields,
          createDefaults,
          extraHeaderButtons,
        },
        {
          key: 'high_value',
          label: 'Mua nhiều',
          title: 'Khách hàng mua nhiều',
          subtitle: 'Danh sách khách hàng có tần suất hoặc giá trị mua hàng cao',
          endpoint: '/customers/customers?tags=high_value',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm khách hàng',
          fields: commonFields,
          formFields: commonFormFields,
          createDefaults,
          extraHeaderButtons,
        },
        {
          key: 'birthday_high_value',
          label: 'Mua nhiều, sinh nhật trong tháng',
          title: 'Mua nhiều, sinh nhật tháng này',
          subtitle: 'Khách hàng quan trọng có sinh nhật trong tháng hiện tại',
          endpoint: '/customers/customers?tags=birthday_high_value',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm khách hàng',
          fields: commonFields,
          formFields: commonFormFields,
          createDefaults,
          extraHeaderButtons,
        },
        {
          key: 'frequent',
          label: 'Mua thường xuyên',
          title: 'Khách hàng mua thường xuyên',
          subtitle: 'Danh sách khách hàng có chu kỳ mua hàng liên tục',
          endpoint: '/customers/customers?tags=frequent',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm khách hàng',
          fields: commonFields,
          formFields: commonFormFields,
          createDefaults,
          extraHeaderButtons,
        },
        {
          key: 'inactive',
          label: 'Lâu chưa mua',
          title: 'Khách hàng lâu chưa mua',
          subtitle: 'Khách hàng có thời gian dài chưa phát sinh giao dịch',
          endpoint: '/customers/customers?tags=inactive',
          icon: <Users size={24} />,
          primaryActionLabel: 'Thêm khách hàng',
          fields: commonFields,
          formFields: commonFormFields,
          createDefaults,
          extraHeaderButtons,
        },
      ]}
    />
  );
}

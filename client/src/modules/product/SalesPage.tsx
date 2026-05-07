import { ShoppingCart } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function SalesPage() {
  return (
    <DataModulePage
      title="Bán hàng"
      subtitle="Phiếu bán, thanh toán, kênh bán và trạng thái giao hàng"
      endpoint="/products/sales"
      icon={<ShoppingCart size={24} />}
      primaryActionLabel="Tạo đơn bán"
      fields={[
        { key: 'code', label: 'Mã đơn' },
        { key: 'status', label: 'Trạng thái', type: 'status' },
        { key: 'amountProducts', label: 'SL hàng', type: 'number' },
        { key: 'value', label: 'Tổng tiền', type: 'money' },
        { key: 'valuePayment', label: 'Đã thanh toán', type: 'money' },
        { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
      ]}
      formFields={[
        { key: 'code', label: 'Mã đơn', required: true },
        { key: 'amountProducts', label: 'Số lượng hàng', type: 'number' },
        { key: 'totalCost', label: 'Tổng vốn', type: 'number' },
        { key: 'value', label: 'Tổng tiền', type: 'number' },
        { key: 'valuePayment', label: 'Đã thanh toán', type: 'number' },
        { key: 'status', label: 'Trạng thái', type: 'select', options: [
          { label: 'Nháp', value: 'draft' },
          { label: 'Hoàn thành', value: 'completed' },
          { label: 'Đã hủy', value: 'cancelled' },
        ] },
        { key: 'note', label: 'Ghi chú', type: 'textarea' },
      ]}
      createDefaults={{ code: '', amountProducts: 0, totalCost: 0, value: 0, valuePayment: 0, status: 'draft', note: '' }}
      quickFilters={[
        { label: 'Nháp', value: 'draft' },
        { label: 'Hoàn thành', value: 'completed' },
      ]}
    />
  );
}

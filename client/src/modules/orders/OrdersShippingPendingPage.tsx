import { Truck } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function OrdersShippingPendingPage() {
  return (
    <DataModulePage
      title="Chờ gửi vận chuyển"
      subtitle="Danh sách các đơn hàng đã sẵn sàng nhưng chưa gửi cho hãng vận chuyển"
      endpoint="/orders/shipping-pending"
      icon={<Truck size={22} />}
      fields={[
        { key: 'orderCode', label: 'Mã đơn hàng' },
        { key: 'carrier', label: 'Hãng vận chuyển đăng ký' },
        { key: 'customerName', label: 'Tên khách hàng' },
        { key: 'customerPhone', label: 'SĐT khách hàng' },
        { key: 'shippingFee', label: 'Phí ship', type: 'money' },
        { key: 'codAmount', label: 'Tiền thu hộ COD', type: 'money' },
        { key: 'deliveryStatus', label: 'Trạng thái gửi', type: 'status' },
      ]}
      formFields={[
        { key: 'orderCode', label: 'Mã đơn hàng', required: true },
        { key: 'carrier', label: 'Đơn vị vận chuyển' },
        { key: 'customerName', label: 'Tên khách hàng' },
        { key: 'customerPhone', label: 'SĐT' },
        { key: 'shippingFee', label: 'Phí ship', type: 'number' },
        { key: 'codAmount', label: 'Thu hộ COD', type: 'number' },
        {
          key: 'deliveryStatus', label: 'Trạng thái', type: 'select', options: [
            { label: 'Chờ lấy hàng', value: 'Chờ lấy hàng' },
            { label: 'Lỗi kết nối API', value: 'Lỗi kết nối API' },
          ],
        },
      ]}
      createDefaults={{
        orderCode: '', carrier: '', customerName: '',
        customerPhone: '', shippingFee: 0, codAmount: 0, deliveryStatus: 'Chờ lấy hàng',
      }}
      primaryActionLabel="Ghi nhận đơn chờ"
      quickFilters={[
        { label: 'Chờ lấy hàng', value: 'Chờ lấy hàng' },
        { label: 'Lỗi kết nối API', value: 'Lỗi kết nối API' },
      ]}
    />
  );
}

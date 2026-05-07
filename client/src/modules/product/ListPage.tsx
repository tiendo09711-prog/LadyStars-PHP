import { Boxes, Layers3, MapPinned, Tags, Warehouse } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';

export function ProductListPage() {
  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'products',
          label: 'Hàng hóa',
          title: 'Hàng hóa',
          subtitle: 'Danh mục sản phẩm, dịch vụ, combo, tồn kho và thiết lập giá',
          endpoint: '/products/products',
          icon: <Boxes size={24} />,
          primaryActionLabel: 'Thêm hàng hóa',
          fields: [
            { key: 'code', label: 'Mã hàng' },
            { key: 'name', label: 'Tên hàng hóa' },
            { key: 'type', label: 'Loại', type: 'status' },
            { key: 'price', label: 'Giá bán', type: 'money' },
            { key: 'qty', label: 'Tồn', type: 'number' },
            { key: 'unit', label: 'Đơn vị' },
          ],
          formFields: [
            { key: 'code', label: 'Mã hàng', required: true },
            { key: 'name', label: 'Tên hàng hóa', required: true },
            { key: 'type', label: 'Loại', type: 'select', options: [
              { label: 'Sản phẩm', value: 'product' },
              { label: 'Dịch vụ', value: 'service' },
              { label: 'Combo', value: 'combo' },
            ] },
            { key: 'cost', label: 'Giá vốn', type: 'number' },
            { key: 'price', label: 'Giá bán', type: 'number' },
            { key: 'qty', label: 'Tồn kho', type: 'number' },
            { key: 'unit', label: 'Đơn vị' },
            { key: 'minQuantity', label: 'Tồn ít nhất', type: 'number' },
            { key: 'maxQuantity', label: 'Tồn nhiều nhất', type: 'number' },
            { key: 'description', label: 'Mô tả', type: 'textarea' },
          ],
          createDefaults: { code: '', name: '', type: 'product', cost: 0, price: 0, qty: 0, unit: 'cái', minQuantity: 0, maxQuantity: 999999999, description: '' },
          quickFilters: [
            { label: 'Sản phẩm', value: 'product' },
            { label: 'Dịch vụ', value: 'service' },
            { label: 'Combo', value: 'combo' },
          ],
        },
        {
          key: 'categories',
          label: 'Nhóm hàng',
          title: 'Nhóm hàng',
          subtitle: 'Cây danh mục hàng hóa giống Polirium category',
          endpoint: '/products/categories',
          icon: <Layers3 size={24} />,
          primaryActionLabel: 'Thêm nhóm hàng',
          fields: [{ key: 'name', label: 'Tên nhóm' }, { key: 'createdAt', label: 'Ngày tạo', type: 'date' }],
          formFields: [{ key: 'name', label: 'Tên nhóm', required: true }],
          createDefaults: { name: '' },
        },
        {
          key: 'trademarks',
          label: 'Thương hiệu',
          title: 'Thương hiệu',
          subtitle: 'Danh mục thương hiệu hàng hóa',
          endpoint: '/products/trademarks',
          icon: <Tags size={24} />,
          primaryActionLabel: 'Thêm thương hiệu',
          fields: [{ key: 'name', label: 'Tên thương hiệu' }, { key: 'createdAt', label: 'Ngày tạo', type: 'date' }],
          formFields: [{ key: 'name', label: 'Tên thương hiệu', required: true }],
          createDefaults: { name: '' },
        },
        {
          key: 'shelves',
          label: 'Vị trí',
          title: 'Vị trí kho',
          subtitle: 'Kệ, vị trí lưu hàng',
          endpoint: '/products/shelves',
          icon: <MapPinned size={24} />,
          primaryActionLabel: 'Thêm vị trí',
          fields: [{ key: 'name', label: 'Vị trí' }, { key: 'createdAt', label: 'Ngày tạo', type: 'date' }],
          formFields: [{ key: 'name', label: 'Tên vị trí', required: true }],
          createDefaults: { name: '' },
        },
        {
          key: 'stocks',
          label: 'Kiểm kho',
          title: 'Kiểm kho',
          subtitle: 'Phiếu cân bằng tồn kho, độ lệch tăng giảm và giá trị tồn',
          endpoint: '/products/stock-adjustments',
          icon: <Warehouse size={24} />,
          primaryActionLabel: 'Tạo phiếu kiểm',
          fields: [
            { key: 'code', label: 'Mã phiếu' },
            { key: 'status', label: 'Trạng thái', type: 'status' },
            { key: 'amount', label: 'Tổng SL', type: 'number' },
            { key: 'deviation', label: 'Lệch', type: 'number' },
            { key: 'value', label: 'Giá trị', type: 'money' },
          ],
          formFields: [
            { key: 'code', label: 'Mã phiếu', required: true },
            { key: 'balanceDate', label: 'Ngày cân bằng', type: 'date' },
            { key: 'status', label: 'Trạng thái', type: 'select', options: [
              { label: 'Nháp', value: 'draft' },
              { label: 'Hoàn thành', value: 'completed' },
              { label: 'Hủy', value: 'cancelled' },
            ] },
            { key: 'note', label: 'Ghi chú', type: 'textarea' },
          ],
          createDefaults: { code: '', balanceDate: '', status: 'draft', note: '' },
          actions: [{ label: 'Hoàn tất', endpointSuffix: 'complete', confirm: 'Hoàn tất phiếu kiểm kho và cập nhật tồn?' }],
        },
      ]}
    />
  );
}

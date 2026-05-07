import { Boxes } from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';

export function ProductListPage() {
  return (
    <DataModulePage
      title="Hàng hóa"
      subtitle="Danh mục sản phẩm, dịch vụ, combo, tồn kho và thiết lập giá"
      endpoint="/products/products"
      icon={<Boxes size={24} />}
      primaryActionLabel="Thêm hàng hóa"
      fields={[
        { key: 'code', label: 'Mã hàng' },
        { key: 'name', label: 'Tên hàng hóa' },
        { key: 'type', label: 'Loại', type: 'status' },
        { key: 'price', label: 'Giá bán', type: 'money' },
        { key: 'qty', label: 'Tồn', type: 'number' },
        { key: 'unit', label: 'Đơn vị' },
      ]}
      formFields={[
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
        { key: 'description', label: 'Mô tả', type: 'textarea' },
      ]}
      createDefaults={{ code: '', name: '', type: 'product', cost: 0, price: 0, qty: 0, unit: 'cái', description: '' }}
      quickFilters={[
        { label: 'Sản phẩm', value: 'product' },
        { label: 'Dịch vụ', value: 'service' },
        { label: 'Combo', value: 'combo' },
      ]}
    />
  );
}

import { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart, ArrowRightLeft, Building2, Combine, Split,
  FileDown, Truck, FilePlus, Trash2, PlusCircle, FileCheck, Printer, ChevronDown, X
} from 'lucide-react';
import { DataModulePage } from '../../core/components/DataModulePage';
import { http } from '../../core/api/http';

export function OrdersManagePage() {
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('Cần xử lí');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedHandoverId, setSelectedHandoverId] = useState('');
  const [branches, setBranches] = useState<{ _id: string; name: string }[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [activeItems, setActiveItems] = useState<Record<string, any>[]>([]);
  const [onSuccessCb, setOnSuccessCb] = useState<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExcel = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await http.post('/orders/manage/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        alert(res.data.message || 'Nhập dữ liệu thành công!');
        window.location.reload(); // Reload to fetch fresh data
      } else {
        alert('Có lỗi xảy ra: ' + res.data.message);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra khi nhập dữ liệu!');
    } finally {
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    http.get('/system/branches')
      .then(res => {
        setBranches(res.data.items || []);
      })
      .catch(err => {
        console.error('Không thể tải danh sách kho hàng:', err);
      });

    http.get('/orders/handover')
      .then(res => {
        setHandovers(res.data.items || []);
      })
      .catch(err => {
        console.error('Không thể tải biên bản bàn giao:', err);
      });
  }, []);

  const executeBulkAction = async (action: string, items: any[], extraData: Record<string, any> = {}, onSuccess: () => void) => {
    try {
      const ids = items.map(item => item._id);
      const res = await http.post('/orders/manage/bulk-action', {
        action,
        ids,
        ...extraData
      });
      if (res.data.success) {
        alert(res.data.message || 'Thực hiện hành động thành công!');
        onSuccess();
      } else {
        alert('Có lỗi xảy ra!');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra khi thực hiện hành động!');
    }
  };

  const handleDelete = async (items: Record<string, any>[], onSuccess: () => void) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${items.length} đơn hàng đã chọn? Hành động này không thể hoàn tác.`)) return;
    await executeBulkAction('delete', items, {}, onSuccess);
  };

  const handleExportCsv = (items: Record<string, any>[], onSuccess: () => void) => {
    if (items.length === 0) return;
    const fields = ['orderCode', 'customerName', 'customerPhone', 'shippingAddress', 'paymentMethod', 'totalAmount', 'status', 'deliveryStatus', 'note'];
    const headers = ['Mã đơn hàng', 'Tên khách hàng', 'SĐT', 'Địa chỉ', 'PT thanh toán', 'Tổng tiền', 'Trạng thái', 'Vận chuyển', 'Ghi chú'];
    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...items.map((item) => fields.map((field) => `"${String(item[field] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `don-hang-da-chon.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onSuccess();
  };

  const submitStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSuccessCb) return;
    await executeBulkAction('status', activeItems, { status: selectedStatus }, onSuccessCb);
    setStatusModalOpen(false);
  };

  const submitWarehouseChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSuccessCb) return;
    const branchName = branches.find(b => b._id === selectedWarehouse)?.name || selectedWarehouse;
    await executeBulkAction('warehouse', activeItems, { warehouse: branchName }, onSuccessCb);
    setWarehouseModalOpen(false);
  };

  const submitHandoverChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSuccessCb) return;
    if (!selectedHandoverId) {
      alert('Vui lòng chọn một biên bản bàn giao!');
      return;
    }
    await executeBulkAction('add-handover', activeItems, { handoverId: selectedHandoverId }, onSuccessCb);
    setHandoverModalOpen(false);
  };

  const bulkActionGroups = [
    {
      actions: [
        { 
          label: 'Đổi trạng thái', 
          icon: <ArrowRightLeft size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            setActiveItems(items);
            setOnSuccessCb(() => onSuccess);
            setStatusModalOpen(true);
          } 
        },
        { 
          label: 'Đổi kho hàng', 
          icon: <Building2 size={16} />, 
          onClick: async (items: any[], onSuccess: () => void) => {
            setActiveItems(items);
            setOnSuccessCb(() => onSuccess);
            try {
              const res = await http.get('/system/branches');
              const list = res.data.items || [];
              setBranches(list);
              if (list.length > 0) setSelectedWarehouse(list[0]._id);
              setWarehouseModalOpen(true);
            } catch (err) {
              alert('Không thể tải danh sách kho hàng!');
            }
          } 
        },
        { 
          label: 'Gộp các đơn đã chọn', 
          icon: <Combine size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            if (items.length < 2) return alert('Bạn cần chọn ít nhất 2 đơn hàng để gộp!');
            const target = window.prompt(`Bạn đang muốn gộp ${items.length} đơn hàng.\nVui lòng nhập Mã Đơn Hàng chính để gộp vào:`, items[0].orderCode);
            if (target) {
              executeBulkAction('merge', items, { mainOrderCode: target }, onSuccess);
            }
          } 
        },
        { 
          label: 'Tách đơn Mega Live', 
          icon: <Split size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            if (!window.confirm(`Bạn có chắc chắn muốn tách ${items.length} đơn hàng Mega Live đã chọn thành các đơn lẻ?`)) return;
            executeBulkAction('split', items, {}, onSuccess);
          } 
        },
      ]
    },
    {
      actions: [
        { label: 'Xuất dữ liệu', icon: <FileDown size={16} />, onClick: handleExportCsv },
      ]
    },
    {
      actions: [
        { 
          label: 'Gửi đơn sang hãng vận chuyển', 
          icon: <Truck size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            if (!window.confirm(`Bạn có chắc muốn gửi ${items.length} đơn sang hãng vận chuyển?`)) return;
            executeBulkAction('send-carrier', items, {}, onSuccess);
          }
        },
        { 
          label: 'Thêm đơn vào biên bản bàn giao', 
          icon: <FilePlus size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            setActiveItems(items);
            setOnSuccessCb(() => onSuccess);
            http.get('/orders/handover')
              .then(res => {
                const list = res.data.items || [];
                setHandovers(list);
                if (list.length > 0) setSelectedHandoverId(list[0]._id);
              })
              .catch(() => {});
            setHandoverModalOpen(true);
          } 
        },
      ]
    },
    {
      actions: [
        { label: 'Xóa', icon: <Trash2 size={16} />, danger: true, onClick: handleDelete },
        { 
          label: 'Thêm đối soát đơn tự vận chuyển', 
          icon: <PlusCircle size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            executeBulkAction('reconcile', items, {}, onSuccess);
          } 
        },
      ]
    },
    {
      actions: [
        { 
          label: 'Tạo hóa đơn điện tử nháp', 
          icon: <FilePlus size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            executeBulkAction('einvoice-draft', items, {}, onSuccess);
          } 
        },
        { 
          label: 'Phát hành hóa đơn điện tử', 
          icon: <FileCheck size={16} />, 
          onClick: (items: any[], onSuccess: () => void) => {
            executeBulkAction('einvoice-issue', items, {}, onSuccess);
          } 
        },
      ]
    }
  ];



  return (
    <>
      <input 
        type="file" 
        accept=".xlsx,.xls,.xlsm" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
      />
      <DataModulePage
        title="Quản lý đơn hàng"
        subtitle="Danh sách các đơn hàng trong hệ thống theo trạng thái"
        endpoint="/orders/manage"
        icon={<ShoppingCart size={22} />}
        fields={[
          { key: 'orderCode', label: 'Mã đơn hàng' },
          { key: 'customerName', label: 'Tên khách hàng' },
          { key: 'customerPhone', label: 'SĐT khách hàng' },
          { key: 'shippingAddress', label: 'Địa chỉ giao hàng' },
          { key: 'paymentMethod', label: 'P/T thanh toán' },
          { key: 'totalAmount', label: 'Tổng tiền', type: 'money' },
          { key: 'warehouse', label: 'Kho hàng' },
          { key: 'status', label: 'Trạng thái đơn', type: 'status' },
          { key: 'deliveryStatus', label: 'Vận chuyển', type: 'badge' },
          { key: 'note', label: 'Ghi chú' },
        ]}
        formFields={[
          { key: 'orderCode', label: 'Mã đơn hàng', required: true },
          { key: 'customerName', label: 'Tên khách hàng', required: true },
          { key: 'customerPhone', label: 'SĐT khách hàng' },
          { key: 'shippingAddress', label: 'Địa chỉ giao' },
          {
            key: 'warehouse',
            label: 'Kho hàng',
            type: 'select',
            options: [
              { label: 'Chọn kho hàng', value: '' },
              ...branches.map(b => ({ label: b.name, value: b.name }))
            ]
          },
          {
            key: 'paymentMethod', label: 'P/T thanh toán', type: 'select', options: [
              { label: 'COD', value: 'COD' },
              { label: 'Chuyển khoản', value: 'Chuyển khoản' },
              { label: 'Tiền mặt', value: 'Tiền mặt' },
            ],
          },
          { key: 'totalAmount', label: 'Tổng tiền', type: 'number' },
          {
            key: 'status', label: 'Trạng thái đơn', type: 'select', options: [
              { label: 'Cần xử lí', value: 'Cần xử lí' },
              { label: 'Xác nhận', value: 'Xác nhận' },
              { label: 'Chờ thanh toán', value: 'Chờ thanh toán' },
              { label: 'Đã thanh toán', value: 'Đã thanh toán' },
              { label: 'Thanh toán', value: 'Thanh toán' },
              { label: 'In và đóng gói', value: 'In và đóng gói' },
              { label: 'Đang chuyển', value: 'Đang chuyển' },
              { label: 'Khiếu nại', value: 'Khiếu nại' },
            ],
          },
          {
            key: 'deliveryStatus', label: 'Trạng thái giao', type: 'select', options: [
              { label: 'Chờ lấy hàng', value: 'Chờ lấy hàng' },
              { label: 'Đang giao', value: 'Đang giao' },
              { label: 'Đã giao', value: 'Đã giao' },
              { label: 'Hủy giao', value: 'Hủy giao' },
            ],
          },
          { key: 'note', label: 'Ghi chú', type: 'textarea' },
        ]}
        createDefaults={{
          orderCode: '', customerName: '', customerPhone: '', shippingAddress: '',
          paymentMethod: 'COD', totalAmount: 0, status: 'Cần xử lí',
          warehouse: '', deliveryStatus: 'Chờ lấy hàng', note: '',
        }}
        primaryActionLabel="Tạo đơn hàng"
        quickFilters={[
          { label: 'Tất cả thanh toán', value: 'Chờ thanh toán,Đã thanh toán,Thanh toán' },
          { label: '-- Chờ thanh toán', value: 'Chờ thanh toán' },
          { label: '-- Đã thanh toán', value: 'Đã thanh toán' },
          { label: 'Xác nhận', value: 'Xác nhận' },
          { label: 'In và đóng gói', value: 'In và đóng gói' },
          { label: 'Đang chuyển', value: 'Đang chuyển' },
          { label: 'Cần xử lí', value: 'Cần xử lí' },
          { label: 'Thanh toán', value: 'Thanh toán' },
          { label: 'Khiếu nại', value: 'Khiếu nại' },
        ]}
        bulkActionGroups={bulkActionGroups}
        onImportExcel={handleImportExcel}
      />

      {statusModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitStatusChange}>
            <div className="modal-header">
              <div>
                <h2>Đổi trạng thái hàng loạt</h2>
                <p>Cập nhật trạng thái cho {activeItems.length} đơn hàng đã chọn</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setStatusModalOpen(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-field wide">
                <span>Chọn trạng thái mới *</span>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  <option value="Cần xử lí">Cần xử lí</option>
                  <option value="Xác nhận">Xác nhận</option>
                  <option value="Chờ thanh toán">Chờ thanh toán</option>
                  <option value="Đã thanh toán">Đã thanh toán</option>
                  <option value="Thanh toán">Thanh toán</option>
                  <option value="In và đóng gói">In và đóng gói</option>
                  <option value="Đang chuyển">Đang chuyển</option>
                  <option value="Khiếu nại">Khiếu nại</option>
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setStatusModalOpen(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Cập nhật ngay</button>
            </div>
          </form>
        </div>
      )}

      {warehouseModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitWarehouseChange}>
            <div className="modal-header">
              <div>
                <h2>Đổi kho hàng</h2>
                <p>Chọn kho hàng xuất cho {activeItems.length} đơn hàng</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setWarehouseModalOpen(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-field wide">
                <span>Chọn kho hàng *</span>
                <select value={selectedWarehouse} onChange={(e) => setSelectedWarehouse(e.target.value)} required>
                  {branches.length === 0 && <option value="" disabled>Không có kho hàng nào</option>}
                  {branches.map(b => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setWarehouseModalOpen(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Xác nhận đổi kho</button>
            </div>
          </form>
        </div>
      )}

      {handoverModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitHandoverChange}>
            <div className="modal-header">
              <div>
                <h2>Thêm đơn vào biên bản bàn giao</h2>
                <p>Chọn biên bản bàn giao cho {activeItems.length} đơn hàng</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setHandoverModalOpen(false)} title="Đóng">
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label className="form-field wide">
                <span>Chọn biên bản bàn giao *</span>
                <select value={selectedHandoverId} onChange={(e) => setSelectedHandoverId(e.target.value)} required>
                  {handovers.length === 0 && <option value="" disabled>Không có biên bản bàn giao nào</option>}
                  {handovers.map(h => (
                    <option key={h._id} value={h._id}>
                      {h.handoverCode} ({h.carrier} - {h.orderCount || 0} đơn) - {h.status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setHandoverModalOpen(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Xác nhận thêm vào biên bản</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

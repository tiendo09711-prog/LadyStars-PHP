import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Eye, Printer } from 'lucide-react';
import { TabbedModulePage } from '../../core/components/TabbedModulePage';
import { buildRefundReceiptHtml, writeAndPrintPopup } from './invoicePrint';

type RefundInvoicePageProps = {
  channel: string;
};

const PRINT_WINDOW_FEATURES = 'popup=yes,width=420,height=720';

export function RefundInvoicePage({ channel }: RefundInvoicePageProps) {
  const navigate = useNavigate();

  const handlePrint = (refund: Record<string, any>) => {
    const popup = window.open('about:blank', 'refund-invoice-print', PRINT_WINDOW_FEATURES);
    if (!popup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn. Hãy cho phép pop-up và thử lại.');
      return;
    }
    writeAndPrintPopup(popup, buildRefundReceiptHtml(refund));
  };

  return (
    <TabbedModulePage
      tabs={[
        {
          key: 'refund',
          label: 'Trả hàng',
          title: 'Hóa đơn trả hàng',
          subtitle: 'Lịch sử hoàn trả từ bán lẻ và bán sỉ (đồng bộ từ MongoDB)',
          endpoint: '/products/refunds',
          icon: <FileSpreadsheet size={24} />,
          hideCreate: true,
          hideEdit: true,
          hideDelete: true,
          hideImport: true,
          quickFilters: [
            { label: 'Tất cả', value: '' },
            { label: 'Hoàn tất', value: 'completed' },
            { label: 'Nháp', value: 'draft' },
            { label: 'Đã hủy', value: 'cancelled' },
          ],
          fields: [
            { key: 'createdAt', label: 'Ngày', type: 'date' },
            { key: 'code', label: 'Mã trả hàng' },
            { key: 'paymentId.code', label: 'Hóa đơn gốc' },
            { key: 'paymentId.customerId.name', label: 'Khách hàng' },
            { key: 'amount', label: 'Số lượng', type: 'number' },
            { key: 'totalPayableAmount', label: 'Tiền trả khách', type: 'money' },
            { key: 'status', label: 'Trạng thái', type: 'status' },
          ],
          formFields: [],
          createDefaults: {},
          customActions: [
            {
              label: 'Xem chi tiết',
              icon: <Eye size={16} />,
              onClick: (item) => navigate(`/sales-channels/${channel}/refund/${item._id}`),
            },
            {
              label: 'In',
              icon: <Printer size={16} />,
              onClick: (item) => handlePrint(item),
            },
          ],
        },
      ]}
    />
  );
}

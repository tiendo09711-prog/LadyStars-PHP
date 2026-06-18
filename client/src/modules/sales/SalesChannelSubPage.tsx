import { Navigate, useParams } from 'react-router-dom';
import { DataModulePage } from '../../core/components/DataModulePage';
import { RetailInvoicePage } from './RetailInvoicePage';
import { WholesaleInvoicePage } from './WholesaleInvoicePage';
import { RefundInvoicePage } from './RefundInvoicePage';

export function SalesChannelSubPage() {
  const { channel = 'store', action = '' } = useParams<{ channel: string; action: string }>();

  if (action === 'retail') {
    return <RetailInvoicePage channel={channel} />;
  }

  if (action === 'wholesale') {
    return <WholesaleInvoicePage channel={channel} />;
  }

  if (action === 'refund') {
    return <RefundInvoicePage channel={channel} />;
  }

  // Mọi action không nhận ra (đã xóa hoặc không tồn tại) → redirect về trang channel
  return <Navigate to={`/sales-channels/${channel}`} replace />;
}


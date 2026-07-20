// Shared pure helpers for Retail + Wholesale invoice pages.
// Extracted to eliminate duplication and ensure consistent behavior for
// status, actions (refund/edit/delete), value calculations.

export type Invoice = Record<string, any>;

export function productLines(invoice: Invoice) {
  return Array.isArray(invoice.items) ? invoice.items : [];
}

export function productName(item: any) {
  return item?.productId?.name || item?.productName || item?.productId?.code || 'Sản phẩm chưa có tên';
}

export function productCode(item: any) {
  return item?.productId?.code || item?.productCode || '';
}

export function totalQuantity(invoice: Invoice) {
  return productLines(invoice).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
}

export function grossValue(invoice: Invoice) {
  return productLines(invoice).reduce(
    (sum, item) => sum + (Number(item?.value) || 0) * (Number(item?.amount) || 0),
    0,
  );
}

/** True when invoice-level discount is stored as a percentage (10 = 10%). */
export function isPercentDiscount(type: unknown): boolean {
  const t = String(type ?? '').toLowerCase().trim();
  return t === 'percent' || t === 'percentage' || t === '%';
}

/**
 * Order-level discount converted to money (đ).
 * - percent: discountValue is rate (e.g. 10 → 10% of gross)
 * - number/fixed: discountValue is already money
 * - fallback: gross − stored net value (covers line discounts reflected only in value)
 */
export function discountMoneyAmount(invoice: Invoice) {
  const gross = grossValue(invoice);
  const raw = Number(invoice.discountValue ?? invoice.discount_value ?? invoice.discount ?? 0);
  const entered = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const type = invoice.discountType ?? invoice.discount_type;

  if (entered > 0) {
    if (isPercentDiscount(type)) {
      if (gross > 0) {
        return Math.min(gross, Math.round((gross * Math.min(entered, 100)) / 100));
      }
      // Cannot convert % without a base; leave fallback below.
    } else {
      return gross > 0 ? Math.min(gross, entered) : entered;
    }
  }

  const net = Number(invoice.value ?? invoice.totalAmount ?? invoice.total_amount);
  if (gross > 0 && Number.isFinite(net) && net >= 0 && gross > net + 0.0001) {
    return Math.max(0, Math.round(gross - net));
  }
  return 0;
}

/**
 * Net invoice total after order-level discount.
 * Corrects legacy retail rows where `value` was left null and later reconstructed as gross
 * (equal to line sum) even though a percent/fixed discount was stored.
 */
export function netValue(invoice: Invoice) {
  const gross = productLines(invoice).length > 0 ? grossValue(invoice) : 0;
  const disc = discountMoneyAmount(invoice);
  const direct = Number(invoice.value ?? invoice.totalAmount ?? invoice.total_amount);

  if (productLines(invoice).length > 0) {
    const computed = Math.max(0, Math.round(gross - disc));
    if (Number.isFinite(direct) && direct > 0) {
      // Stored value still equals pre-discount gross → use recomputed net.
      if (disc > 0 && Math.abs(direct - gross) < 0.5) return computed;
      return direct;
    }
    return computed;
  }

  return Number.isFinite(direct) && direct > 0 ? direct : 0;
}

export function statusMeta(status: unknown, refundStatus?: unknown) {
  const refund = String(refundStatus || '').toLowerCase();
  const value = String(status || '').toLowerCase();
  if (value === 'completed' && refund === 'full') return { label: 'Đã hoàn', tone: 'neutral' };
  if (value === 'completed' && refund === 'partial') return { label: 'Đã hoàn một phần', tone: 'warning' };
  if (value === 'completed') return { label: 'Hoàn tất', tone: 'success' };
  if (value === 'cancelled') return { label: 'Đã hủy', tone: 'danger' };
  if (value === 'draft') return { label: 'Nháp', tone: 'warning' };
  return { label: status ? String(status) : '—', tone: 'neutral' };
}

export function hasGiftItems(invoice: Invoice) {
  if (invoice?.hasGiftItems === true) return true;
  return productLines(invoice).some((item) => item?.isGift === true || item?.gift === true || item?.giftForProductId);
}

export function refundActionState(invoice: Invoice) {
  const status = String(invoice?.status || '').toLowerCase();
  const refundStatus = String(invoice?.refundStatus || 'none').toLowerCase();
  const remainingReturnableQuantity = Number(invoice?.remainingReturnableQuantity || 0);

  if (status === 'cancelled') {
    return { enabled: false, title: 'Hóa đơn đã hủy nên không thể đổi trả.' };
  }
  if (status !== 'completed') {
    return { enabled: false, title: 'Chỉ hóa đơn đã hoàn tất mới được đổi trả.' };
  }
  if (refundStatus === 'full' || remainingReturnableQuantity <= 0) {
    return { enabled: false, title: 'Hóa đơn đã hoàn toàn bộ nên không thể đổi trả thêm.' };
  }
  return { enabled: true, title: 'Tạo chứng từ đổi trả cho phần hàng còn lại.' };
}

export function editActionState(invoice: Invoice) {
  const status = String(invoice?.status || '').toLowerCase();
  const refundStatus = String(invoice?.refundStatus || 'none').toLowerCase();
  const activeRefundCount = Number(invoice?.activeRefundCount || 0);

  if (status === 'cancelled') {
    return { enabled: false, title: 'Hóa đơn đã hủy nên không thể sửa.' };
  }
  if (status !== 'completed') {
    return { enabled: false, title: 'Chỉ hóa đơn đã hoàn tất mới được sửa.' };
  }
  if (refundStatus === 'full') {
    return { enabled: false, title: 'Hóa đơn đã hoàn toàn bộ nên không thể sửa.' };
  }
  if (refundStatus === 'partial' || activeRefundCount > 0) {
    return { enabled: false, title: 'Hóa đơn đã phát sinh đổi trả nên không thể sửa.' };
  }
  return { enabled: true, title: 'Sửa hóa đơn hoàn tất khi chưa phát sinh đổi trả.' };
}

export function deleteActionState(invoice: Invoice) {
  const status = String(invoice?.status || '').toLowerCase();
  const refundStatus = String(invoice?.refundStatus || 'none').toLowerCase();
  const activeRefundCount = Number(invoice?.activeRefundCount || 0);
  if (status === 'cancelled' && activeRefundCount > 0) {
    return { enabled: false, title: 'Không thể xóa hóa đơn đã hủy vì đã phát sinh chứng từ đổi trả.' };
  }
  if (refundStatus === 'full') {
    return { enabled: false, title: 'Hóa đơn đã hoàn toàn bộ nên không thể xóa hoặc hủy.' };
  }
  if (refundStatus === 'partial' || activeRefundCount > 0) {
    return { enabled: false, title: 'Hóa đơn đã phát sinh đổi trả nên không thể xóa hoặc hủy.' };
  }
  if (activeRefundCount > 0) {
    return { enabled: false, title: 'Không thể xóa hoặc hủy vì hóa đơn đã phát sinh chứng từ đổi trả.' };
  }
  if (status === 'draft') return { enabled: true, title: 'Xóa vĩnh viễn hóa đơn nháp.' };
  if (status === 'cancelled') return { enabled: true, title: 'Xóa vĩnh viễn hóa đơn đã hủy.' };
  if (status === 'completed') return { enabled: true, title: 'Hủy hóa đơn và hoàn tồn kho.' };
  return { enabled: false, title: 'Hóa đơn không ở trạng thái cho phép xóa.' };
}

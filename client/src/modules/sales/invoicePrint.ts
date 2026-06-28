import { buildInvoiceProfile } from '../../core/api/branch.api';
export type TemplateTypography = {
  titleAlign?: 'left' | 'center' | 'right';
  bodyFontSize?: 'small' | 'normal';
};

export type TemplateTotalLabels = {
  subtotal?: string;
  discount?: string;
  total?: string;
  paid?: string;
  change?: string;
};

export type TemplateConfig = {
  version?: number;
  title?: string;
  subtitle?: string;
  noteText?: string;
  totalLabels?: TemplateTotalLabels;
  typography?: TemplateTypography;
};

export type ReceiptProfile = {
  brandName: string;
  branchName?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  footerText: string;
  showBranchName?: boolean;
  showCashier?: boolean;
  showProductCode?: boolean;
  showLogo?: boolean;
  templateConfig?: TemplateConfig;
};

export type ReceiptLine = {
  name: string;
  code?: string;
  quantity: number | string;
  price: string;
  total: string;
};

export type ReceiptSection = {
  title?: string;
  lines: ReceiptLine[];
};

export type ReceiptSummaryLine = {
  label: string;
  value: string;
  strong?: boolean;
};

export type ReceiptHtmlOptions = {
  profile: ReceiptProfile;
  title: string;
  date?: string;
  code?: string;
  customer?: string;
  cashier?: string;
  sections: ReceiptSection[];
  summary?: ReceiptSummaryLine[];
  extraLines?: string[];
};

export function escapeReceiptHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function receiptMoney(value: unknown) {
  const number = Number(value || 0);
  return number.toLocaleString('vi-VN');
}

const DEFAULT_TOTAL_LABELS: Required<TemplateTotalLabels> = {
  subtotal: 'Tổng cộng',
  discount: 'Giảm giá',
  total: 'Thành tiền',
  paid: 'Đã thanh toán',
  change: 'Tiền trả lại',
};

const LABEL_MAP: Record<string, keyof TemplateTotalLabels> = {
  'Tổng cộng': 'subtotal',
  'Giảm giá': 'discount',
  'Thành tiền': 'total',
  'Đã thanh toán': 'paid',
  'Tiền trả lại': 'change',
};

function resolveLabels(profile: ReceiptProfile): Required<TemplateTotalLabels> {
  const cfg = profile.templateConfig?.totalLabels || {};
  return {
    subtotal: cfg.subtotal || DEFAULT_TOTAL_LABELS.subtotal,
    discount: cfg.discount || DEFAULT_TOTAL_LABELS.discount,
    total: cfg.total || DEFAULT_TOTAL_LABELS.total,
    paid: cfg.paid || DEFAULT_TOTAL_LABELS.paid,
    change: cfg.change || DEFAULT_TOTAL_LABELS.change,
  };
}

function resolveAlign(profile: ReceiptProfile) {
  const align = profile.templateConfig?.typography?.titleAlign;
  return align === 'left' || align === 'right' ? align : 'center';
}

function fontSizePx(profile: ReceiptProfile) {
  return profile.templateConfig?.typography?.bodyFontSize === 'small' ? 11 : 13;
}

function renderHeader(profile: ReceiptProfile, bodySize: number) {
  const logo = profile.showLogo && profile.logoUrl
    ? `<p class="iv-logo"><img src="${escapeReceiptHtml(profile.logoUrl)}" alt="logo" /></p>`
    : '';
  const brand = profile.brandName
    ? `<div class="iv-brand">${escapeReceiptHtml(profile.brandName)}</div>`
    : '';
  const address = profile.address
    ? `<div class="iv-sub">${escapeReceiptHtml(profile.address)}</div>`
    : '';
  const phone = profile.phone
    ? `<div class="iv-sub">Điện thoại: ${escapeReceiptHtml(profile.phone)}</div>`
    : '';
  const branch = profile.showBranchName && profile.branchName
    ? `<div class="iv-branch">Kho: ${escapeReceiptHtml(profile.branchName)}</div>`
    : '';
  const style = bodySize !== 13 ? ` style="font-size:${bodySize}px"` : '';
  return `<header class="iv-header"${style}>${logo}${brand}${address}${phone}${branch}</header><div class="iv-dash"></div>`;
}

function renderSection(section: ReceiptSection, showCode: boolean) {
  const head = showCode
    ? '<tr><th class="iv-c-code">Mã</th><th>Tên sản phẩm</th><th class="iv-c-price">Đơn giá</th><th class="iv-c-qty">SL</th><th class="iv-c-total">Thành tiền</th></tr>'
    : '<tr><th>Tên sản phẩm</th><th class="iv-c-price">Đơn giá</th><th class="iv-c-qty">SL</th><th class="iv-c-total">Thành tiền</th></tr>';
  const rows = section.lines.map((line) => {
    const codeCell = showCode
      ? `<td class="iv-c-code">${escapeReceiptHtml(line.code || '')}</td>`
      : '';
    return `<tr>${codeCell}<td>${escapeReceiptHtml(line.name)}</td><td class="iv-c-price">${escapeReceiptHtml(line.price)}</td><td class="iv-c-qty">${escapeReceiptHtml(line.quantity)}</td><td class="iv-c-total">${escapeReceiptHtml(line.total)}</td></tr>`;
  }).join('');
  const title = section.title ? `<div class="iv-section-title">${escapeReceiptHtml(section.title)}</div>` : '';
  return `${title}<table class="iv-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function renderSummary(summary: ReceiptSummaryLine[] | undefined, labels: Required<TemplateTotalLabels>) {
  if (!summary || !summary.length) return '';
  const rows = summary.map((line) => {
    const mapped = LABEL_MAP[line.label];
    const label = mapped ? labels[mapped] : line.label;
    const cls = line.strong ? ' class="iv-strong"' : '';
    return `<tr${cls}><td class="iv-sum-label">${escapeReceiptHtml(label)}</td><td class="iv-sum-value">${escapeReceiptHtml(line.value)}</td></tr>`;
  }).join('');
  return `<table class="iv-summary"><tbody>${rows}</tbody></table>`;
}

export function buildReceiptHtml(options: ReceiptHtmlOptions) {
  const profile = options.profile;
  const bodySize = fontSizePx(profile);
  const labels = resolveLabels(profile);
  const align = resolveAlign(profile);
  const cfg = profile.templateConfig || {};
  const effectiveTitle = cfg.title || options.title;
  const subtitle = cfg.subtitle ? `<div class="iv-subtitle">${escapeReceiptHtml(cfg.subtitle)}</div>` : '';
  const note = cfg.noteText ? `<p class="iv-note">${escapeReceiptHtml(cfg.noteText)}</p>` : '';
  const cashierLine = profile.showCashier && options.cashier
    ? `<div class="iv-cashier">Người lập phiếu: ${escapeReceiptHtml(options.cashier)}</div>`
    : '';
  const dateLine = options.date ? `<div class="iv-date">Ngày bán: ${escapeReceiptHtml(options.date)}</div>` : '';
  const codeLine = options.code ? `<div class="iv-code">${escapeReceiptHtml(options.code)}</div>` : '';
  const customerLine = options.customer ? `<div class="iv-customer"><strong>Khách hàng:</strong> ${escapeReceiptHtml(options.customer)}</div>` : '';
  const hasAnyCode = options.sections.some((section) => section.lines.some((line) => line.code));
  const showCode = Boolean(profile.showProductCode) && hasAnyCode;
  const sectionsHtml = options.sections.map((section) => renderSection(section, showCode)).join('');
  const summaryHtml = renderSummary(options.summary, labels);
  const titleSize = Math.round(bodySize * 1.5);
  const brandSize = Math.round(bodySize * 1.25);

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeReceiptHtml(effectiveTitle)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: ${bodySize}px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .receipt { width: 100%; max-width: 196mm; margin: 0 auto; padding: 0; }
      .iv-header { text-align: center; overflow-wrap: anywhere; }
      .iv-logo { margin: 0 0 4px; }
      .iv-logo img { max-width: 200px; max-height: 56px; object-fit: contain; }
      .iv-brand { font-weight: 700; font-size: ${brandSize}px; text-transform: uppercase; }
      .iv-sub { overflow-wrap: anywhere; }
      .iv-branch { color: #444; }
      .iv-dash { border-top: 1px dashed #000; margin: 6px 0; }
      .iv-date { margin: 2px 0; }
      .iv-title { font-weight: 700; font-size: ${titleSize}px; text-transform: uppercase; text-align: ${align}; margin: 8px 0 2px; letter-spacing: .02em; }
      .iv-code { text-align: ${align}; margin: 0 0 2px; }
      .iv-subtitle { text-align: ${align}; margin: 2px 0 6px; font-style: italic; color: #333; }
      .iv-customer { margin: 6px 0 2px; overflow-wrap: anywhere; }
      .iv-cashier { margin: 2px 0; }
      .iv-section-title { font-weight: 700; margin: 8px 0 4px; }
      .iv-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
      .iv-table th, .iv-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
      .iv-table th { font-weight: 700; text-align: left; background: #f4f4f4; }
      .iv-c-code { width: 12%; }
      .iv-c-price { width: 18%; text-align: center; }
      .iv-c-qty { width: 8%; text-align: center; }
      .iv-c-total { width: 22%; text-align: right; white-space: nowrap; }
      .iv-table td.iv-c-price { text-align: center; }
      .iv-table td.iv-c-qty { text-align: center; }
      .iv-table td.iv-c-total { text-align: right; }
      .iv-note { margin: 8px 0 4px; overflow-wrap: anywhere; }
      .iv-summary { width: 100%; margin-top: 6px; }
      .iv-summary td { padding: 3px 0; }
      .iv-sum-label { text-align: right; padding-right: 12px; }
      .iv-sum-value { text-align: right; white-space: nowrap; width: 40%; }
      .iv-summary tr.iv-strong td { font-weight: 700; }
      .iv-foot-dash { border-top: 1px dashed #000; margin: 12px 0 6px; }
      .iv-footer { text-align: center; margin-top: 4px; overflow-wrap: anywhere; }
      @media print { .receipt { max-width: 100%; } .iv-table th { background: #f4f4f4 !important; } }
    </style>
  </head>
  <body>
    <main class="receipt">
      ${renderHeader(profile, bodySize)}
      ${dateLine}
      <div class="iv-title">${escapeReceiptHtml(effectiveTitle)}</div>
      ${codeLine}
      ${subtitle}
      ${customerLine}
      ${cashierLine}
      <div class="iv-dash"></div>
      ${sectionsHtml}
      ${note}
      ${summaryHtml}
      <div class="iv-foot-dash"></div>
      <div class="iv-footer">${escapeReceiptHtml(profile.footerText)}</div>
    </main>
  </body>
</html>`;
}

export function writeAndPrintPopup(popup: Window, html: string) {
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function refundCustomerText(refund: Record<string, any>): string {
  const customer = refund?.paymentId?.customerId;
  if (customer && typeof customer === 'object') {
    const name = customer.name || '';
    const phone = customer.phone || '';
    return [name, phone ? `(${phone})` : ''].filter(Boolean).join(' ') || 'Khách lẻ';
  }
  return 'Khách lẻ';
}

function refundOriginalCode(refund: Record<string, any>): string {
  const payment = refund?.paymentId;
  return (payment && typeof payment === 'object' ? payment.code : payment) || '';
}

export function buildRefundReceiptHtml(refund: Record<string, any>) {
  const branch = refund?.paymentId?.branchId;
  const profile = buildInvoiceProfile(branch && typeof branch === 'object' ? branch : undefined);
  const items = Array.isArray(refund?.items) ? refund.items : [];
  const originalCode = refundOriginalCode(refund);
  const customerText = refundCustomerText(refund);
  const date = refund?.createdAt || refund?.completedAt;
  return buildReceiptHtml({
    profile,
    title: profile.templateConfig?.title || 'HÓA ĐƠN TRẢ HÀNG',
    code: refund?.code || '',
    date: date ? new Date(String(date)).toLocaleString('vi-VN') : '',
    customer: customerText,
    sections: [
      {
        title: originalCode ? `Sản phẩm trả (HĐ gốc: ${originalCode})` : 'Sản phẩm trả',
        lines: items.map((item: any) => ({
          name: item?.productId?.name || item?.productId?.code || 'Sản phẩm',
          code: item?.productId?.code || '',
          quantity: Number(item?.amount) || 0,
          price: receiptMoney(item?.price),
          total: receiptMoney(item?.value),
        })),
      },
    ],
    summary: [
      { label: 'Tổng số lượng', value: String(items.reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0)) },
      { label: 'Giá trị trả', value: receiptMoney(refund?.value) },
      { label: 'Tiền trả khách', value: receiptMoney(refund?.totalPayableAmount), strong: true },
      ...(refund?.note ? [{ label: 'Lý do', value: String(refund.note) }] : []),
    ],
  });
}

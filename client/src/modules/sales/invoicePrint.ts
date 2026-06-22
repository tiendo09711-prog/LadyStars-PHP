export type ReceiptProfile = {
  brandName: string;
  branchName?: string;
  phone?: string;
  address?: string;
  showBranchName?: boolean;
  footerText: string;
};

export type ReceiptLine = {
  name: string;
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

function renderHeader(profile: ReceiptProfile) {
  return `
    <header class="receipt-header">
      <div class="brand">${escapeReceiptHtml(profile.brandName)}</div>
      ${profile.showBranchName && profile.branchName ? `<div>Cửa hàng: ${escapeReceiptHtml(profile.branchName)}</div>` : ''}
      ${profile.phone ? `<div>Điện thoại: ${escapeReceiptHtml(profile.phone)}</div>` : ''}
      ${profile.address ? `<div class="address">Địa chỉ: ${escapeReceiptHtml(profile.address)}</div>` : ''}
    </header>
    <div class="dash"></div>`;
}

function renderSection(section: ReceiptSection) {
  return `
    ${section.title ? `<div class="section-title">${escapeReceiptHtml(section.title)}</div>` : ''}
    <table>
      <thead><tr><th>Sản phẩm</th><th>SL</th><th>Giá</th><th>T.Tiền</th></tr></thead>
      <tbody>
        ${section.lines.map((line) => `
          <tr>
            <td>${escapeReceiptHtml(line.name)}</td>
            <td>${escapeReceiptHtml(line.quantity)}</td>
            <td>${escapeReceiptHtml(line.price)}</td>
            <td>${escapeReceiptHtml(line.total)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

export function buildReceiptHtml(options: ReceiptHtmlOptions) {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeReceiptHtml(options.title)}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      html, body { width: 80mm; margin: 0; padding: 0; height: auto; min-height: 0; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #111; font-size: 12.5px; line-height: 1.32; height: auto; min-height: 0; }
      .receipt { width: 80mm; box-sizing: border-box; padding: 3mm 3.5mm 2.5mm; margin: 0; min-height: 0; height: auto; overflow: visible; }
      .receipt-header { text-align: center; overflow-wrap: anywhere; }
      .brand { font-weight: 800; font-size: 15px; margin-bottom: 2px; }
      .address { overflow-wrap: anywhere; }
      .dash { border-top: 1px dashed #111; margin: 6px 0; }
      .title { text-align: center; font-weight: 900; font-size: 19px; line-height: 1.15; margin: 8px 0 7px; }
      .meta { text-align: center; margin-bottom: 5px; }
      .customer { margin: 6px 0; overflow-wrap: anywhere; font-size: 12.5px; }
      .section-title { font-weight: 800; font-size: 13px; margin: 8px 0 4px; }
      .receipt table { width: 100%; table-layout: fixed; border-collapse: collapse; }
      .receipt th, .receipt td { border: 1px solid #555; padding: 3px 3px; vertical-align: middle; white-space: normal; overflow-wrap: anywhere; word-break: break-word; text-overflow: clip; font-size: 12px; line-height: 1.28; }
      .receipt th { font-weight: 800; text-align: left; }
      .receipt th:nth-child(1), .receipt td:nth-child(1) { width: 38%; }
      .receipt th:nth-child(2), .receipt td:nth-child(2) { width: 11%; text-align: center; }
      .receipt th:nth-child(3), .receipt td:nth-child(3) { width: 25%; text-align: right; }
      .receipt th:nth-child(4), .receipt td:nth-child(4) { width: 26%; text-align: right; }
      .summary { margin-top: 6px; font-size: 12.5px; }
      .summary-line { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
      .summary-line strong { text-align: right; font-size: 13.5px; font-weight: 900; }
      .extra-line { margin-top: 7px; overflow-wrap: anywhere; font-size: 12.5px; }
      .footer { text-align: center; margin-top: 9px; font-weight: 700; letter-spacing: .02em; font-size: 12.5px; }
    </style>
  </head>
  <body>
    <main class="receipt">
      ${renderHeader(options.profile)}
      <div class="title">${escapeReceiptHtml(options.title)}</div>
      ${options.date ? `<div class="meta">${escapeReceiptHtml(options.date)}</div>` : ''}
      ${options.code ? `<div class="meta">Mã HĐ: ${escapeReceiptHtml(options.code)}</div>` : ''}
      ${options.customer ? `<div class="customer">Khách hàng: ${escapeReceiptHtml(options.customer)}</div>` : ''}
      ${options.sections.map(renderSection).join('')}
      ${options.summary?.length ? `<div class="summary">${options.summary.map((line) => `<div class="summary-line"><span>${escapeReceiptHtml(line.label)}</span>${line.strong ? `<strong>${escapeReceiptHtml(line.value)}</strong>` : `<span>${escapeReceiptHtml(line.value)}</span>`}</div>`).join('')}</div>` : ''}
      ${options.extraLines?.length ? options.extraLines.map((line) => `<div class="extra-line">${line}</div>`).join('') : ''}
      <div class="footer">${escapeReceiptHtml(options.profile.footerText)}</div>
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

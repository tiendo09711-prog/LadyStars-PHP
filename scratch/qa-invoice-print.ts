import 'dotenv/config';
import mongoose from 'mongoose';
import { buildInvoiceProfile } from '../client/src/core/api/branch.api.ts';
import { buildReceiptHtml, receiptMoney } from '../client/src/modules/sales/invoicePrint.ts';
import { Branch } from '../server/src/core/org/branch.model.ts';
import { Product, PaymentMethod, SalePayment } from '../server/src/modules/product/product.models.ts';
import { buildSalePaymentPayload } from '../server/src/modules/product/product.service.ts';

const marker = `QA-INVOICE-PRINT-${Date.now()}`;
const results: any[] = [];
const created: Record<string, string[]> = { branches: [], products: [], paymentMethods: [], sales: [] };

function has(html: string, text: string) { return html.includes(text); }
function money(v: number) { return receiptMoney(v); }
function renderRetail(invoice: any, branch: any) {
  const profile = buildInvoiceProfile(branch as any, { shopName: 'STORE-SETTING-SHOULD-NOT-APPEAR', phone: '0999999999', address: 'STORE SETTING ADDRESS' });
  const paid = Number(invoice.valuePayment || 0);
  const total = Number(invoice.value || 0);
  const tendered = Number(invoice.tenderedValue ?? paid);
  const hasDistinctTendered = Number.isFinite(tendered) && tendered > 0 && Math.abs(tendered - paid) > 1;
  const change = hasDistinctTendered ? Math.max(tendered - total, 0) : 0;
  return buildReceiptHtml({
    profile,
    title: 'ĐƠN BÁN HÀNG',
    code: invoice.code,
    customer: 'Khách lẻ',
    sections: [{ lines: [{ name: 'Sản phẩm QA dài để kiểm tra xuống dòng', quantity: 1, price: money(150000), total: money(150000) }] }],
    summary: [
      { label: 'Tổng cộng', value: money(150000) },
      { label: 'Giảm giá', value: money(0) },
      { label: 'Thành tiền', value: money(invoice.value), strong: true },
      { label: 'Đã thanh toán', value: money(invoice.valuePayment) },
      ...(hasDistinctTendered ? [{ label: 'Tiền khách trả', value: money(tendered) }] : []),
      ...(change > 0 ? [{ label: 'Tiền trả lại', value: money(change) }] : []),
    ],
  });
}
function add(name: string, status: string, details: any) { results.push({ name, status, details }); }

const branchA = { _id: new mongoose.Types.ObjectId().toString(), name: `${marker}-BRANCH-A`, code: 'QAA', phone: '090QA000A', address: `${marker} Address A`, invoiceProfile: { displayName: `${marker} Brand A`, showBranchName: true } };
const branchB = { _id: new mongoose.Types.ObjectId().toString(), name: `${marker}-BRANCH-B`, code: 'QAB', phone: '090QA000B', address: `${marker} Address B`, invoiceProfile: { displayName: `${marker} Brand B`, showBranchName: true } };

const cases = [
  { name: 'Retail cash exact', invoice: { code: `${marker}-EXACT`, value: 150000, valuePayment: 150000, tenderedValue: 150000 }, expect: { paid: true, tendered: false, change: false } },
  { name: 'Retail cash change', invoice: { code: `${marker}-CHANGE`, value: 150000, valuePayment: 150000, tenderedValue: 200000 }, expect: { paid: true, tendered: true, change: true } },
  { name: 'Retail partial payment', invoice: { code: `${marker}-PARTIAL`, value: 150000, valuePayment: 100000, tenderedValue: 100000 }, expect: { paid: true, tendered: false, change: false } },
  { name: 'Retail transfer/card', invoice: { code: `${marker}-TRANSFER`, value: 150000, valuePayment: 150000 }, expect: { paid: true, tendered: false, change: false } },
  { name: 'Legacy invoice no tenderedValue', invoice: { code: `${marker}-LEGACY`, value: 150000, valuePayment: 150000 }, expect: { paid: true, tendered: false, change: false } },
];
for (const c of cases) {
  const html = renderRetail(c.invoice, branchA);
  const details = {
    containsPaid: has(html, 'Đã thanh toán') && has(html, money(c.invoice.valuePayment)),
    containsTendered: has(html, 'Tiền khách trả'),
    containsChange: has(html, 'Tiền trả lại'),
    branchA: has(html, branchA.invoiceProfile.displayName) && has(html, branchA.phone) && has(html, branchA.address),
    branchB: has(html, branchB.invoiceProfile.displayName) || has(html, branchB.phone) || has(html, branchB.address),
    storeSetting: has(html, 'STORE-SETTING-SHOULD-NOT-APPEAR') || has(html, 'STORE SETTING ADDRESS'),
    htmlSample: html.replace(/\s+/g, ' ').slice(0, 260),
  };
  const ok = details.containsPaid === c.expect.paid && details.containsTendered === c.expect.tendered && details.containsChange === c.expect.change && details.branchA && !details.branchB && !details.storeSetting;
  add(c.name, ok ? 'PASS' : 'FAIL', { invoice: c.invoice, ...details });
}

const wholesaleHtml = buildReceiptHtml({ profile: buildInvoiceProfile(branchB as any), title: 'ĐƠN BÁN HÀNG', customer: 'Khách sỉ QA', sections: [{ lines: [] }], summary: [] });
add('Wholesale branch isolation render', wholesaleHtml.includes(branchB.invoiceProfile.displayName) && !wholesaleHtml.includes(branchA.invoiceProfile.displayName) ? 'PASS' : 'FAIL', { branchId: branchB._id, hasBranchB: wholesaleHtml.includes(branchB.invoiceProfile.displayName), hasBranchA: wholesaleHtml.includes(branchA.invoiceProfile.displayName) });
const refundHtml = buildReceiptHtml({ profile: buildInvoiceProfile(branchA as any), title: 'ĐƠN ĐỔI TRẢ HÀNG', customer: 'Khách đổi trả QA', sections: [{ title: 'Sản phẩm trả (HĐ: QA)', lines: [] }, { title: 'Sản phẩm mua (HĐ: QA)', lines: [] }], summary: [{ label: 'Tiền trả khách hàng', value: money(50000), strong: true }] });
add('Refund branch isolation render', refundHtml.includes(branchA.invoiceProfile.displayName) && refundHtml.includes('ĐƠN ĐỔI TRẢ HÀNG') && refundHtml.includes('Tiền trả khách hàng') && !refundHtml.includes(branchB.invoiceProfile.displayName) ? 'PASS' : 'FAIL', { branchId: branchA._id, hasBranchA: refundHtml.includes(branchA.invoiceProfile.displayName), hasBranchB: refundHtml.includes(branchB.invoiceProfile.displayName) });

let dbStatus = 'NOT_RUN';
try {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  dbStatus = 'CONNECTED';
  const qaBranchA = await Branch.create({ name: `${marker} DB Branch A`, code: `QA${Date.now().toString().slice(-8)}A`, phone: '09000000A', address: `${marker} DB Address A`, invoiceProfile: { displayName: `${marker} DB Brand A`, showBranchName: true } });
  const qaBranchB = await Branch.create({ name: `${marker} DB Branch B`, code: `QA${Date.now().toString().slice(-8)}B`, phone: '09000000B', address: `${marker} DB Address B`, invoiceProfile: { displayName: `${marker} DB Brand B`, showBranchName: true } });
  created.branches.push(String(qaBranchA._id), String(qaBranchB._id));
  const method = await PaymentMethod.create({ name: `${marker} Cash`, code: `${marker}-CASH`, isActive: true });
  created.paymentMethods.push(String(method._id));
  const product = await Product.create({ name: `${marker} Product`, code: `${marker}-PRODUCT`, price: 150000, cost: 1, qty: 10, allowsSale: true });
  created.products.push(String(product._id));
  const built = await buildSalePaymentPayload({ code: `${marker}-SALE`, branchId: qaBranchA._id, discountValue: 0, discountType: 'number', valuePayment: 150000, tenderedValue: 200000, typePayment: [{ methodId: method._id, amount: 150000 }], items: [{ productId: product._id, amount: 1, value: 150000, discountValue: 0, discountType: 'number' }], note: marker });
  const sale = await SalePayment.create(built);
  created.sales.push(String(sale._id));
  const dbDoc = await SalePayment.findById(sale._id).lean();
  const apiLikeDoc = await SalePayment.findById(sale._id).populate('branchId', 'name code address phone invoiceProfile').populate('typePayment.methodId', 'name code').lean();
  const dbHtml = renderRetail(apiLikeDoc, apiLikeDoc?.branchId);
  add('MongoDB persistence tenderedValue', dbDoc?.value === 150000 && dbDoc?.valuePayment === 150000 && dbDoc?.tenderedValue === 200000 && Array.isArray(dbDoc?.typePayment) && dbDoc.typePayment[0]?.amount === 150000 ? 'PASS' : 'FAIL', { saleId: String(sale._id), branchId: String(qaBranchA._id), value: dbDoc?.value, valuePayment: dbDoc?.valuePayment, tenderedValue: dbDoc?.tenderedValue, typePaymentTotal: dbDoc?.typePayment?.reduce((s:any,l:any)=>s+Number(l.amount||0),0) });
  add('API-like populated branch receipt isolation', dbHtml.includes(`${marker} DB Brand A`) && dbHtml.includes('Tiền khách trả') && dbHtml.includes('Tiền trả lại') && !dbHtml.includes(`${marker} DB Brand B`) && !dbHtml.includes('STORE-SETTING-SHOULD-NOT-APPEAR') ? 'PASS' : 'FAIL', { saleId: String(sale._id), branchId: String(qaBranchA._id), hasBrandA: dbHtml.includes(`${marker} DB Brand A`), hasBrandB: dbHtml.includes(`${marker} DB Brand B`), hasTendered: dbHtml.includes('Tiền khách trả'), hasChange: dbHtml.includes('Tiền trả lại') });
} catch (error:any) {
  dbStatus = `BLOCKED: ${error.message}`;
} finally {
  if (mongoose.connection.readyState === 1) {
    try {
      const [sales, products, methods, branches] = await Promise.all([
        SalePayment.deleteMany({ _id: { $in: created.sales } }),
        Product.deleteMany({ _id: { $in: created.products } }),
        PaymentMethod.deleteMany({ _id: { $in: created.paymentMethods } }),
        Branch.deleteMany({ _id: { $in: created.branches } }),
      ]);
      add('MongoDB cleanup QA data', 'PASS', { deleted: { sales: sales.deletedCount, products: products.deletedCount, paymentMethods: methods.deletedCount, branches: branches.deletedCount }, created });
    } catch (error:any) {
      add('MongoDB cleanup QA data', 'FAIL', { error: error.message, created });
    }
    await mongoose.disconnect();
  }
}

console.log(JSON.stringify({ marker, dbStatus, created, results }, null, 2));

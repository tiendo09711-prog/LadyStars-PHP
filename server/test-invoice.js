import { connectDatabase } from './src/config/database.js';
import { RetailInvoice } from './src/modules/product/product.models.js';
async function test() {
    await connectDatabase();
    const d = new Date();
    const dateStr = d.getDate().toString().padStart(2, '0') + '/' + (d.getMonth() + 1).toString().padStart(2, '0') + '/' + d.getFullYear();
    await RetailInvoice.create({
        id: 'TEST-' + Date.now(),
        date: dateStr,
        totalAmount: 5000000,
        status: 'Đã thanh toán',
        customerName: 'Khách test biểu đồ'
    });
    console.log('Created test invoice on ' + dateStr + ' for 5,000,000 VND');
    process.exit(0);
}
test();

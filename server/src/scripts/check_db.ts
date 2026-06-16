import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }); // Desktop/LadyStars/.env

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    const db = mongoose.connection.db;
    
    const retail = await db!.collection('retailinvoices').findOne();
    const wholesale = await db!.collection('wholesaleinvoices').findOne();
    const sale = await db!.collection('salepayments').findOne();
    const order = await db!.collection('orders').findOne();
    
    console.log('RetailInvoice fields:', retail ? Object.keys(retail).filter(k => k!=='tabs') : 'null');
    if (retail) console.log('Retail branchId?', retail.branchId, 'categoryId?', retail.categoryId);

    console.log('SalePayment fields:', sale ? Object.keys(sale) : 'null');
    if (sale) console.log('SalePayment items:', sale.items ? sale.items.length : 0);

    console.log('Order fields:', order ? Object.keys(order) : 'null');

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
check();

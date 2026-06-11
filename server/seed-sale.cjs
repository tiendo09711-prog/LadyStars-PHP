const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '../.env' });

async function seed() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('ladystars');

  const now = new Date();
  
  // Find a product
  const product = await db.collection('products').findOne({});
  if (!product) { console.log('No product found'); return; }

  // Find a branch
  const branch = await db.collection('branches').findOne({});
  
  const sale = {
    code: 'SP-' + Date.now(),
    type: 'Bán lẻ',
    status: 'completed',
    value: 1500000,
    amountProducts: 2,
    totalCost: 1000000,
    paymentMethod: 'Tiền mặt',
    completedAt: now,
    branchId: branch ? branch._id : null,
    items: [
      {
        productId: product._id,
        amount: 2,
        value: 750000,
        total: 1500000,
        note: ''
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  // Xóa rác cũ
  await db.collection('salepayments').deleteMany({ paymentCode: { $exists: true } });

  await db.collection('salepayments').insertOne(sale);
  console.log('Seeded Correct SalePayment:', sale.code);
  await client.close();
}
seed().catch(console.error);

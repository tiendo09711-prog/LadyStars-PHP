import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/ladystars';
let client: MongoClient;

export async function connectDB() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db();
}

export async function closeDB() {
  if (client) {
    await client.close();
  }
}

export async function seedProduct(productCode: string) {
  const db = await connectDB();
  const products = db.collection('products');
  
  // Seed a product
  const result = await products.findOneAndUpdate(
    { code: productCode },
    {
      $set: {
        code: productCode,
        name: 'Sản phẩm Test E2E',
        retailPrice: 500000,
        totalStock: 1000,
        qty: 1000,
        stockHCM: 100,
        stockHN: 100,
        cost: 300000,
        categoryId: null,
        status: 'Đang bán',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  const product = result?.value || result;
  
  if (product && product._id) {
    const branches = await db.collection('branches').find({}).toArray();
    for (const b of branches) {
      await db.collection('productbranchstocks').updateOne(
        { productId: product._id, branchId: b._id },
        { $set: { qty: 100 } },
        { upsert: true }
      );
    }
  }
}

export async function cleanupTestData(productCode: string) {
  const db = await connectDB();
  
  // Get product ID
  const product = await db.collection('products').findOne({ code: productCode });
  if (product) {
    await db.collection('productbranchstocks').deleteMany({ productId: product._id });
  }

  // Remove the product
  await db.collection('products').deleteOne({ code: productCode });
  
  // Remove any invoices created using this product code
  await db.collection('retailinvoices').deleteMany({ productCode: productCode });
  await db.collection('salepayments').deleteMany({ 'items.productCode': productCode });
}

export async function seedRevenueData(testCode: string) {
  const db = await connectDB();
  const now = new Date();
  
  await db.collection('salepayments').insertOne({
    code: testCode,
    status: 'completed',
    createdAt: now,
    discountValue: 50000,
    items: [
      {
        productCode: testCode,
        amount: 2,
        cost: 300000,
        total: 1000000 // Doanh thu 1tr, giá vốn 600k -> lợi nhuận 400k - discount 50k
      }
    ]
  });

  await db.collection('orders').insertOne({
    code: testCode,
    status: 'Thành công',
    createdAt: now,
  });
}

export async function cleanupRevenueData(testCode: string) {
  const db = await connectDB();
  await db.collection('salepayments').deleteMany({ code: testCode });
  await db.collection('orders').deleteMany({ code: testCode });
}

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
  
  // Seed a product with stock in Kho HCM
  await products.updateOne(
    { code: productCode },
    {
      $set: {
        code: productCode,
        name: 'Sản phẩm Test E2E',
        retailPrice: 500000,
        totalStock: 100,
        stockHCM: 100, // Stock in Kho HCM
        cost: 300000,
        categoryId: null,
        status: 'Đang bán'
      }
    },
    { upsert: true }
  );
}

export async function cleanupTestData(productCode: string) {
  const db = await connectDB();
  
  // Remove the product
  await db.collection('products').deleteOne({ code: productCode });
  
  // Remove any invoices created using this product code
  await db.collection('retailinvoices').deleteMany({ productCode: productCode });
  await db.collection('salepayments').deleteMany({ 'items.productCode': productCode });
}

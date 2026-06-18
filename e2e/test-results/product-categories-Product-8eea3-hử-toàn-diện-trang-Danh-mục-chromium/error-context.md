# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: product-categories.spec.ts >> Products Categories Page - Automation >> Kiểm thử toàn diện trang Danh mục
- Location: e2e\tests\product-categories.spec.ts:48:7

# Error details

```
"beforeAll" hook timeout of 30000ms exceeded.
```

```
MongoServerSelectionError: connect EACCES 159.143.0.65:27017
```

```
MongoTopologyClosedError: Topology is closed
```

# Test source

```ts
  1   | import { MongoClient } from 'mongodb';
  2   | import dotenv from 'dotenv';
  3   | import path from 'path';
  4   | 
  5   | dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  6   | 
  7   | const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/ladystars';
  8   | let client: MongoClient;
  9   | 
  10  | export async function connectDB() {
  11  |   if (!client) {
  12  |     client = new MongoClient(uri);
> 13  |     await client.connect();
      |     ^ MongoTopologyClosedError: Topology is closed
  14  |   }
  15  |   return client.db();
  16  | }
  17  | 
  18  | export async function closeDB() {
  19  |   if (client) {
  20  |     await client.close();
  21  |   }
  22  | }
  23  | 
  24  | export async function seedProduct(productCode: string) {
  25  |   const db = await connectDB();
  26  |   const products = db.collection('products');
  27  |   
  28  |   // Seed a product
  29  |   const result = await products.findOneAndUpdate(
  30  |     { code: productCode },
  31  |     {
  32  |       $set: {
  33  |         code: productCode,
  34  |         name: 'Sản phẩm Test E2E',
  35  |         price: 500000,
  36  |         totalStock: 1000,
  37  |         qty: 1000,
  38  |         stockHCM: 100,
  39  |         stockHN: 100,
  40  |         cost: 300000,
  41  |         categoryId: null,
  42  |         status: 'Đang bán',
  43  |         createdAt: new Date(),
  44  |         updatedAt: new Date()
  45  |       }
  46  |     },
  47  |     { upsert: true, returnDocument: 'after' }
  48  |   );
  49  | 
  50  |   const product = result?.value || result;
  51  |   
  52  |   if (product && product._id) {
  53  |     const branches = await db.collection('branches').find({}).toArray();
  54  |     for (const b of branches) {
  55  |       await db.collection('productbranchstocks').updateOne(
  56  |         { productId: product._id, branchId: b._id },
  57  |         { $set: { qty: 100 } },
  58  |         { upsert: true }
  59  |       );
  60  |     }
  61  |   }
  62  | }
  63  | 
  64  | export async function cleanupTestData(productCode: string) {
  65  |   const db = await connectDB();
  66  |   
  67  |   // Get product ID
  68  |   const product = await db.collection('products').findOne({ code: productCode });
  69  |   if (product) {
  70  |     await db.collection('productbranchstocks').deleteMany({ productId: product._id });
  71  |   }
  72  | 
  73  |   // Remove the product
  74  |   await db.collection('products').deleteOne({ code: productCode });
  75  |   
  76  |   // Remove any invoices created using this product code
  77  |   await db.collection('retailinvoices').deleteMany({ productCode: productCode });
  78  |   await db.collection('salepayments').deleteMany({ 'items.productCode': productCode });
  79  | }
  80  | 
  81  | export async function seedRevenueData(testCode: string) {
  82  |   const db = await connectDB();
  83  |   const now = new Date();
  84  |   
  85  |   await db.collection('salepayments').insertOne({
  86  |     code: testCode,
  87  |     status: 'completed',
  88  |     createdAt: now,
  89  |     discountValue: 50000,
  90  |     items: [
  91  |       {
  92  |         productCode: testCode,
  93  |         amount: 2,
  94  |         cost: 300000,
  95  |         total: 1000000 // Doanh thu 1tr, giá vốn 600k -> lợi nhuận 400k - discount 50k
  96  |       }
  97  |     ]
  98  |   });
  99  | 
  100 |   await db.collection('orders').insertOne({
  101 |     code: testCode,
  102 |     status: 'Thành công',
  103 |     createdAt: now,
  104 |   });
  105 | }
  106 | 
  107 | export async function cleanupRevenueData(testCode: string) {
  108 |   const db = await connectDB();
  109 |   await db.collection('salepayments').deleteMany({ code: testCode });
  110 |   await db.collection('orders').deleteMany({ code: testCode });
  111 | }
  112 | 
```
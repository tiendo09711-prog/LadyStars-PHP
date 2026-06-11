import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const uri = process.env.MONGO_URI;

async function dropRedundantCollections() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('ladystars');
    
    const collections = ['retailinvoices', 'wholesaleinvoices', 'refundinvoices'];
    for (const name of collections) {
      const existing = await db.listCollections({ name }).toArray();
      if (existing.length > 0) {
        await db.collection(name).drop();
        console.log(`✅ Đã xóa collection: ${name}`);
      } else {
        console.log(`⏭️  Không tìm thấy collection: ${name}, bỏ qua.`);
      }
    }
    console.log('🎉 Hoàn tất xóa dữ liệu rác!');
  } catch (err) {
    console.error('❌ Lỗi:', err);
  } finally {
    await client.close();
  }
}

dropRedundantCollections();

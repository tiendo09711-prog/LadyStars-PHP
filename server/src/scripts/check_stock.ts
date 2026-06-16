import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }); 

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    const db = mongoose.connection.db;
    
    const prod = await db!.collection('products').findOne({ code: { $regex: /K609/i } });
    console.log('K609 Product:', prod ? {
      name: prod.name,
      code: prod.code,
      totalStock: prod.totalStock,
      stockHCM: prod.stockHCM,
      stockHanoi: prod.stockHanoi
    } : 'Not found');

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
check();

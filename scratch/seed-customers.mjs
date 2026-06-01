import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import mô hình
import { Customer } from '../server/src/modules/customer/customer.models.js';
import { env } from '../server/src/config/env.js';

const dbUri = env.mongoUri;

const filesToParse = [
  { path: '../Bảng dữ liệu/Khách Hàng - Tất Cả.csv', tag: 'all' },
  { path: '../Bảng dữ liệu/Khách Hàng - Mua nhiều.csv', tag: 'high_value' },
  { path: '../Bảng dữ liệu/Khách hàng - Mua nhiều, sinh nhật trong tháng.csv', tag: 'birthday_high_value' },
  { path: '../Bảng dữ liệu/Khách hàng - Mua thường xuyên.csv', tag: 'frequent' },
  { path: '../Bảng dữ liệu/Khách hàng - Lâu chưa mua.csv', tag: 'inactive' },
];

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return null;
}

async function seed() {
  await mongoose.connect(dbUri);
  console.log('Connected to DB');

  for (const fileDef of filesToParse) {
    const filePath = path.join(__dirname, fileDef.path);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let processedCount = 0;
    
    // Bỏ qua dòng header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cols = line.split(';');
      if (cols.length < 3) continue;

      const id = cols[0].trim();
      if (!id) continue;
      
      const typeStr = cols[1].trim();
      const type = typeStr.toLowerCase().includes('công ty') ? 'company' : 'person';
      const name = cols[3].trim() || 'Khách không tên';
      const address = cols[7] ? cols[7].trim() : '';
      const email = cols[11] ? cols[11].trim() : '';
      const phone = cols[12] ? cols[12].trim() : '';
      
      const sexStr = cols[16] ? cols[16].trim().toLowerCase() : '';
      const sex = sexStr.includes('nữ') ? 'female' : sexStr.includes('nam') ? 'male' : 'female';
      
      const birthday = parseDate(cols[17]);
      const purchaseCount = parseInt(cols[18]) || 0;
      const totalSpent = parseInt(cols[27]) || 0;
      const points = parseInt(cols[29]) || 0;
      const lastPurchaseDate = parseDate(cols[30]);
      const daysSinceLastPurchase = parseInt(cols[31]) || 0;

      const updateObj = {
        $set: {
          code: id,
          type,
          name,
          address,
          email,
          phone,
          sex,
          purchaseCount,
          totalSpent,
          points,
          daysSinceLastPurchase,
        },
        $addToSet: { tags: fileDef.tag }
      };

      if (birthday) updateObj.$set.birthday = birthday;
      if (lastPurchaseDate) updateObj.$set.lastPurchaseDate = lastPurchaseDate;

      // Update in DB (Upsert)
      await Customer.findOneAndUpdate(
        { code: id },
        updateObj,
        { upsert: true, new: true }
      );
      
      processedCount++;
    }
    console.log(`Processed ${processedCount} rows for tag ${fileDef.tag}`);
  }

  console.log('Seed completed!');
  mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

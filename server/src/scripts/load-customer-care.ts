import fs from 'fs';
import path from 'path';
import { connectDatabase } from '../config/database.js';
import { CustomerCare } from '../modules/customer/customer.models.js';

async function run() {
  await connectDatabase();

  const csvPath = 'C:\\Users\\tiend\\Desktop\\LadyStars\\Bảng dữ liệu\\Nhanh.vn_Customer_Care.csv';
  const content = fs.readFileSync(csvPath, 'utf8');
  
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 9) continue;
    
    const [id, code, name, phone, details, reason, desc, creator, dateStr] = parts;
    
    let recordDate = new Date();
    if (dateStr) {
      const [datePart, timePart] = dateStr.split(' ');
      if (datePart) {
        const [d, m, y] = datePart.split('/');
        if (d && m && y) {
          recordDate = new Date(`${y}-${m}-${d}T${timePart || '00:00:00'}+07:00`);
        }
      }
    }

    records.push({
      code: id,
      customerCode: code,
      customerName: name,
      customerPhone: phone,
      details: details,
      reason: reason,
      description: desc,
      creator: creator,
      recordDate: recordDate,
    });
  }

  await CustomerCare.deleteMany({});
  await CustomerCare.insertMany(records);
  console.log(`Inserted ${records.length} CustomerCare records`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

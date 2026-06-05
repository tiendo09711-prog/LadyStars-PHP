import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { SummaryTransaction } from '../src/modules/accounting/accounting.models.js';

const parseDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [day, month, year] = dateStr.split(' ')[0].split('/');
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('Connected to MongoDB');

  const csvPath = path.join(__dirname, '../../Bảng dữ liệu/Nhanh.vn_Transaction_Cashbook_2026-06-05_142030.csv');
  const csvData = fs.readFileSync(csvPath, 'utf8');
  
  const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
  
  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    // ID;Ngày;Mã tài khoản;Tên tài khoản;Loại phiếu;Đối tượng;Loại chứng từ;ID chứng từ;Thu;Chi;Diễn giải
    transactions.push({
      transactionId: values[0],
      date: parseDate(values[1]),
      accountCode: values[2],
      accountName: values[3],
      type: values[4],
      targetName: values[5],
      voucherType: values[6],
      voucherId: values[7],
      revenue: Number(values[8] || 0),
      expense: Number(values[9] || 0),
      description: values[10],
    });
  }

  for (const t of transactions) {
    await SummaryTransaction.findOneAndUpdate({ transactionId: t.transactionId }, t, { upsert: true });
  }

  console.log(`Imported ${transactions.length} summary transactions`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

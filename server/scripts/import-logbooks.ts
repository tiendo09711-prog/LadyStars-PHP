import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { LogBookEntry } from '../src/modules/accounting/accounting.models.js';

dotenv.config({ path: '../.env' });
const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ladystars';

async function run() {
  await mongoose.connect(DB_URI);
  console.log('Connected to MongoDB');

  await LogBookEntry.deleteMany({});
  console.log('Cleared existing logbooks');

  const filePath = 'c:\\Users\\tiend\\Desktop\\LadyStars\\Bảng dữ liệu\\Nhanh.vn_Accounting_Transaction_LogBook_2026-06-05_155844.csv';
  const text = fs.readFileSync(filePath, 'utf-8');
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const headers = lines[0].split(';');
  const dataRows = lines.slice(1);
  
  const items = dataRows.map(row => {
    const cols = row.split(';');
    const map: any = {};
    headers.forEach((h, i) => map[h] = cols[i]);
    return {
      date: map['Ngày giao dịch'],
      transactionId: map['ID giao dịch'],
      voucherId: map['Chứng từ'],
      account: map['TK Nợ | TK Có'],
      contraAccount: map['Tài khoản đối ứng'],
      debit: map['Nợ'] ? Number(map['Nợ']) : null,
      credit: map['Có'] ? Number(map['Có']) : null,
    };
  });

  await LogBookEntry.insertMany(items);
  console.log(`Saved ${items.length} logbooks from CSV.`);

  process.exit(0);
}

run().catch(console.error);

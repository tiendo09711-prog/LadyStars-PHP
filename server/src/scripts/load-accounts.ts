import mongoose from 'mongoose';
import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AccountingAccount } from '../modules/accounting/accounting.models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const CSV_FILE_PATH = 'c:\\Users\\tiend\\Desktop\\LadyStars\\Bảng dữ liệu\\Nhanh.vn_Accounting_Account_Index_2026-06-05_162328.csv';

async function importAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/myerp');
    console.log('Connected to MongoDB');

    const results: any[] = [];

    fs.createReadStream(CSV_FILE_PATH, { encoding: 'utf8' })
      .on('error', (error) => {
        console.error('Error reading file:', error);
      })
      .pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
      .on('data', (data) => {
        if (data.ID) {
          results.push({
            id: data.ID.trim(),
            code: data.Code ? data.Code.trim() : '',
            name: data['Tên'] || '',
            warehouse: data['Kho hàng'] ? data['Kho hàng'].trim() : '',
            status: data['Tình trạng'] ? data['Tình trạng'].trim() : 'Kích hoạt',
            creator: data['Người tạo'] ? data['Người tạo'].trim() : '',
            createdAt: data['Ngày tạo'] ? parseDate(data['Ngày tạo'].trim()) : new Date()
          });
        }
      })
      .on('end', async () => {
        console.log(`Read ${results.length} records from CSV.`);
        
        // Upsert into DB
        let successCount = 0;
        for (const item of results) {
          try {
            await AccountingAccount.findOneAndUpdate(
              { id: item.id },
              { $set: item },
              { upsert: true, new: true }
            );
            successCount++;
          } catch (err: any) {
            console.error(`Failed to import item ID ${item.id}: ${err.message}`);
          }
        }

        console.log(`Successfully imported/updated ${successCount} accounts.`);
        mongoose.disconnect();
      });
  } catch (error) {
    console.error('Error importing accounts:', error);
    mongoose.disconnect();
  }
}

function parseDate(dateStr: string) {
  // 09/06/2022 11:30:27 format
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/');
    const [hour, minute, second] = timePart.split(':');
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  } catch (e) {
    return new Date();
  }
}

importAccounts();

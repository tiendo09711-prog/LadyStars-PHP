import mongoose from 'mongoose';
import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { RevenueTime } from '../modules/reports/revenueTime.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const CSV_FILE_PATH = 'c:\\Users\\tiend\\Desktop\\LadyStars\\Bảng dữ liệu\\Nhanh_Report_Revenue_Time_2026-06-05_170644.csv';

async function importRevenueTime() {
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
        if (data['Thời gian']) {
          results.push({
            time: data['Thời gian'].trim(),
            ordersPlaced: parseInt(data['Đơn đặt']) || 0,
            successfulOrders: parseInt(data['Đơn thành công']) || 0,
            retail: parseInt(data['Bán lẻ']) || 0,
            wholesale: parseInt(data['Bán sỉ']) || 0,
            vat: parseInt(data['VAT']) || 0,
            bhmr: parseInt(data['BHMR']) || 0,
            returnFee: parseInt(data['Phí trả hàng']) || 0,
            sales: parseInt(data['Doanh số']) || 0,
            discount: parseInt(data['Chiết khấu']) || 0,
            focus: parseInt(data['Tiêu điểm']) || 0,
            revenue: parseInt(data['Doanh thu']) || 0,
            expectedRevenue: parseInt(data['Doanh thu dự kiến']) || 0,
            revenuePlusVat: parseInt(data['Doanh thu + VAT']) || 0,
            cost: parseInt(data['Giá vốn']) || 0,
            profit: parseInt(data['Lợi nhuận']) || 0,
          });
        }
      })
      .on('end', async () => {
        console.log(`Read ${results.length} records from CSV.`);
        
        let successCount = 0;
        for (const item of results) {
          try {
            await RevenueTime.findOneAndUpdate(
              { time: item.time },
              { $set: item },
              { upsert: true, new: true }
            );
            successCount++;
          } catch (err: any) {
            console.error(`Failed to import time ${item.time}: ${err.message}`);
          }
        }

        console.log(`Successfully imported/updated ${successCount} revenue time records.`);
        mongoose.disconnect();
      });
  } catch (error) {
    console.error('Error importing revenue time:', error);
    mongoose.disconnect();
  }
}

importRevenueTime();

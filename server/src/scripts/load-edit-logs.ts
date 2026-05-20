import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { connectDatabase } from '../config/database.js';
import { ProductEditLog } from '../modules/product/product.models.js';

async function runMigration() {
  try {
    console.log('🔄 Đang kết nối tới Database...');
    await connectDatabase();
    console.log('✅ Đã kết nối DB.');

    console.log('🧹 Xoá dữ liệu cũ của bảng ProductEditLog (Hard Reset)...');
    await ProductEditLog.deleteMany({});
    console.log('✅ Đã dọn sạch collection producteditlogs.');

    const filePath = path.resolve(process.cwd(), '../Bảng dữ liệu/Nhanh.vn_Products_Logs_2026-05-20_155412.csv');
    console.log(`⏳ Đang đọc file CSV từ: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Không tìm thấy file CSV tại đường dẫn: ${filePath}`);
      process.exit(1);
    }

    const results: any[] = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
          // Normalize keys to strip BOM and other invisible chars
          const cleanData: any = {};
          for (const key of Object.keys(data)) {
            const cleanKey = key.replace(/^\uFEFF/, '').trim();
            cleanData[cleanKey] = data[key];
          }

          const productCode = cleanData['Mã sản phẩm']?.trim();
          if (!productCode) return; // Skip empty rows

          const rawDate = cleanData['Thời gian']?.trim();
          let createdAt = new Date();
          if (rawDate) {
            // Replace space with T to make it standard ISO-like local format
            createdAt = new Date(rawDate.replace(' ', 'T'));
          }

          results.push({
            productCode,
            productName: cleanData['Tên sản phẩm']?.trim() || 'Sản phẩm không tên',
            logType: cleanData['Loại log']?.trim() || 'Hệ thống',
            logAction: cleanData['Kiểu log']?.trim() || 'Sửa đổi',
            createdBy: cleanData['Người sửa']?.trim() || 'Hệ thống',
            createdAt,
          });
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    console.log(`📦 Đang lưu ${results.length} bản ghi vào Database...`);
    if (results.length > 0) {
      await ProductEditLog.insertMany(results);
    }

    console.log(`🎉 HOÀN TẤT: Đã insert thành công ${results.length} bản ghi lịch sử.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH MIGRATION:', error);
    process.exit(1);
  }
}

runMigration();

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { connectDatabase } from '../config/database.js';
import { Product } from '../modules/product/product.models.js';

async function runMigration() {
    try {
        console.log('🔄 Đang kết nối tới Database...');
        await connectDatabase();
        console.log('✅ Đã kết nối DB.');

        console.log('🧹 Xoá dữ liệu cũ của bảng Product (Hard Reset)...');
        await Product.deleteMany({});
        console.log('✅ Đã dọn sạch collection products.');

        // Đường dẫn tới file Bảng dữ liệu/Products.csv
        const filePath = path.resolve(process.cwd(), '../Bảng dữ liệu/Products.csv');
        console.log(`⏳ Đang đọc file CSV từ: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ Không tìm thấy file CSV tại đường dẫn: ${filePath}`);
            process.exit(1);
        }

        const results: any[] = [];
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({ separator: ';' }))
                .on('data', (data) => {
                    const code = data['Mã sản phẩm']?.trim();
                    if (!code) return; // Bỏ qua các dòng trống không có mã sản phẩm để tránh lỗi required validation

                    let productType = 'product';
                    const rawType = data['Loại sản phẩm'] || '';
                    if (rawType.toLowerCase().includes('dịch vụ')) {
                        productType = 'service';
                    } else if (rawType.toLowerCase().includes('combo')) {
                        productType = 'combo';
                    }

                    results.push({
                        code: code,
                        name: data['Tên sản phẩm'] || 'Sản phẩm không tên',
                        barcode: data['Mã vạch'] || '',
                        type: productType,
                        cost: parseInt(data['Giá nhập'], 10) || 0,
                        price: parseInt(data['Giá bán'], 10) || 0,
                        qty: parseInt(data['Tổng tồn'], 10) || 0,
                    });
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📦 Đang lưu ${results.length} bản ghi vào Database...`);
        if (results.length > 0) {
            await Product.insertMany(results);
        }
        
        console.log(`🎉 HOÀN TẤT: Đã insert thành công ${results.length} sản phẩm.`);
        process.exit(0);

    } catch (error) {
        console.error('❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH MIGRATION:', error);
        process.exit(1);
    }
}

runMigration();

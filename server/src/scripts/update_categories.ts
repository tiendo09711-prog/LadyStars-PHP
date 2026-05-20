import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { connectDatabase } from '../config/database.js';
import { Category } from '../modules/product/product.models.js';

async function runUpdate() {
    try {
        console.log('🔄 Đang kết nối tới Database...');
        await connectDatabase();
        console.log('✅ Đã kết nối DB.');

        // Đường dẫn tới file Bảng dữ liệu/Nhanh.vn_Store_Category_Index.csv
        const filePath = path.resolve(process.cwd(), '../Bảng dữ liệu/Nhanh.vn_Store_Category_Index.csv');
        console.log(`⏳ Đang đọc file CSV từ: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ Không tìm thấy file CSV tại: ${filePath}`);
            process.exit(1);
        }

        const rows: any[] = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({ separator: ';' }))
                .on('data', (data) => {
                    const cleanedData: any = {};
                    for (const key of Object.keys(data)) {
                        const cleanKey = key.replace(/^\ufeff/, '').trim();
                        cleanedData[cleanKey] = data[key];
                    }
                    rows.push(cleanedData);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📊 Đọc được ${rows.length} dòng từ CSV. Tải danh mục hiện tại để đối chiếu...`);
        const existingCategories = await Category.find({}).lean();
        const existingMap = new Map<string, any>();
        for (const cat of existingCategories) {
            existingMap.set(String(cat.name).trim().toLowerCase(), cat);
        }

        console.log(`📦 Bắt đầu chuẩn bị bulkWrite cho các danh mục...`);

        const bulkOps: any[] = [];
        let successCount = 0;
        let skipCount = 0;

        for (const row of rows) {
            const name = row['Tên danh mục']?.trim();
            if (!name) {
                skipCount++;
                continue;
            }

            // Tên khớp không phân biệt chữ hoa thường để tránh trùng lặp do lệch case
            const matched = existingMap.get(name.toLowerCase());
            const finalName = matched ? matched.name : name;

            const code = row['Mã danh mục']?.trim() || row['ID']?.trim() || '';
            const isActive = row['Hoạt động']?.trim() === 'Ẩn' ? false : true;
            const isVisible = row['Hiển thị']?.trim() === 'Hiển thị';
            const productCount = parseInt(row['Số sản phẩm'], 10) || 0;
            const url = row['Link trên website']?.trim() || '';

            bulkOps.push({
                updateOne: {
                    filter: { name: finalName },
                    update: {
                        $set: {
                            name: finalName,
                            code,
                            isActive,
                            isVisible,
                            productCount,
                            url
                        }
                    },
                    upsert: true
                }
            });

            successCount++;
        }

        console.log(`🚀 Đang chạy bulkWrite cập nhật dữ liệu cho ${bulkOps.length} danh mục...`);
        if (bulkOps.length > 0) {
            await Category.bulkWrite(bulkOps);
        }

        console.log(`\n🎉 HOÀN TẤT CẬP NHẬT DANH MỤC:`);
        console.log(`   - Cập nhật/Thêm mới thành công: ${successCount} danh mục.`);
        console.log(`   - Bỏ qua do trống tên danh mục: ${skipCount} dòng.`);
        process.exit(0);

    } catch (error) {
        console.error('❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH CẬP NHẬT:', error);
        process.exit(1);
    }
}

runUpdate();

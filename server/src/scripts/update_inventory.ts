import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { connectDatabase } from '../config/database.js';
import { Product, ProductBranchStock } from '../modules/product/product.models.js';
import { Branch } from '../core/org/branch.model.js';

async function runUpdate() {
    try {
        console.log('🔄 Đang kết nối tới Database...');
        await connectDatabase();
        console.log('✅ Đã kết nối DB.');

        // Find the branches HN and HCM
        const branchHN = await Branch.findOne({ code: 'HN' });
        const branchHCM = await Branch.findOne({ code: 'HCM' });

        if (!branchHN || !branchHCM) {
            console.error('❌ Không tìm thấy thông tin Kho Hà Nội (HN) hoặc Kho HCM (HCM) trong DB.');
            process.exit(1);
        }

        console.log(`📍 Tìm thấy Kho Hà Nội ID: ${branchHN._id}`);
        console.log(`📍 Tìm thấy Kho HCM ID: ${branchHCM._id}`);

        // Đường dẫn tới file Bảng dữ liệu/Nhanh.vn_Product_Inventory.csv
        const filePath = path.resolve(process.cwd(), '../Bảng dữ liệu/Nhanh.vn_Product_Inventory.csv');
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
                    rows.push(data);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📊 Đọc được ${rows.length} dòng từ CSV. Tải danh sách sản phẩm hiện tại để đối chiếu...`);
        const allProducts = await Product.find({}).lean();
        const productMap = new Map<string, any>();
        for (const p of allProducts) {
            if (p.code) {
                productMap.set(String(p.code).trim().toLowerCase(), p);
            }
        }

        console.log(`📦 Bắt đầu chuẩn bị bulkWrite cho ${rows.length} dòng...`);

        const productBulkOps: any[] = [];
        const stockBulkOps: any[] = [];
        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;

        for (const row of rows) {
            const code = row['Mã sản phẩm']?.trim();
            if (!code) {
                skipCount++;
                continue;
            }

            const product = productMap.get(code.toLowerCase());
            if (!product) {
                failCount++;
                continue;
            }

            // Parse numbers, if empty/null/undefined or non-numeric (e.g. many ";;;"), default to 0
            const qtyHanoi = parseInt(row['Kho Hà Nội'], 10) || 0;
            const qtyHCM = parseInt(row['Kho HCM'], 10) || 0;
            const totalStock = parseInt(row['Tổng tồn'], 10) || 0;

            // 1. Prepare Product total stock update
            productBulkOps.push({
                updateOne: {
                    filter: { _id: product._id },
                    update: { $set: { qty: totalStock } }
                }
            });

            // 2. Prepare Stock for HN
            stockBulkOps.push({
                updateOne: {
                    filter: { productId: product._id, branchId: branchHN._id },
                    update: { $set: { qty: qtyHanoi } },
                    upsert: true
                }
            });

            // 3. Prepare Stock for HCM
            stockBulkOps.push({
                updateOne: {
                    filter: { productId: product._id, branchId: branchHCM._id },
                    update: { $set: { qty: qtyHCM } },
                    upsert: true
                }
            });

            successCount++;
        }

        console.log(`🚀 Đang chạy bulkWrite cập nhật số lượng cho ${productBulkOps.length} sản phẩm...`);
        if (productBulkOps.length > 0) {
            await Product.bulkWrite(productBulkOps);
        }

        console.log(`🚀 Đang chạy bulkWrite cập nhật tồn kho chi tiết cho ${stockBulkOps.length} bản ghi...`);
        if (stockBulkOps.length > 0) {
            await ProductBranchStock.bulkWrite(stockBulkOps);
        }

        console.log(`\n🎉 HOÀN TẤT CẬP NHẬT DỮ LIỆU TỒN KHO:`);
        console.log(`   - Cập nhật thành công: ${successCount} sản phẩm.`);
        console.log(`   - Không tìm thấy mã sản phẩm trong DB: ${failCount} sản phẩm.`);
        console.log(`   - Bỏ qua do dòng trống hoặc không có mã sản phẩm: ${skipCount} dòng.`);
        process.exit(0);

    } catch (error) {
        console.error('❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH CẬP NHẬT:', error);
        process.exit(1);
    }
}

runUpdate();

// Ép Node.js dùng DNS Google nội bộ để trị dứt điểm lỗi kết nối mạng ECONNREFUSED
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const csv = require('csv-parser');

const URI = "mongodb+srv://tiendodev:290105@tiendev.oi4lav0.mongodb.net/";
const DB_NAME = "ladystars";

// Tự động phát hiện dấu phân tách (Comma, Semicolon, Tab) của Excel
function detectSeparator(filePath) {
    if (!fs.existsSync(filePath)) return ',';
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0] || '';
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (semicolons > commas && semicolons > tabs) return ';';
    if (tabs > commas && tabs > semicolons) return '\t';
    return ',';
}

function readCSV(filePath) {
    const sep = detectSeparator(filePath);
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv({
                separator: sep,
                mapHeaders: ({ header }) => header.replace(/[\uFEFF\u200B"']/g, '').trim()
            }))
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
}

// BẬT LẠI RADAR BÁO LỖI KHÔNG TÌM THẤY FILE
async function safeReadCSV(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`   ❌ LỖI: Không tìm thấy file "${filePath}"! Hãy kiểm tra lại tên file.`);
        return [];
    }
    const data = await readCSV(filePath);
    if (data.length === 0) {
        console.log(`   ⚠️ CẢNH BÁO: File "${filePath}" có tồn tại nhưng bên trong trống rỗng (0 dòng)!`);
    }
    return data;
}

// ✨ SIÊU HÀM TỐI THƯỢNG: Ưu tiên khớp chính xác 100% trước, sau đó mới quét linh hoạt
function getFlexVal(row, includeKeywords, excludeKeywords = []) {
    if (!Array.isArray(includeKeywords)) includeKeywords = [includeKeywords];
    if (!Array.isArray(excludeKeywords)) excludeKeywords = [excludeKeywords];

    const normalizedRowKeys = Object.keys(row).map(k => ({
        original: k,
        norm: k.toLowerCase().trim().normalize('NFC').replace(/[\uFEFF\u200B"']/g, '')
    }));

    const normIncludes = includeKeywords.map(k => k.toLowerCase().trim().normalize('NFC'));
    const normExcludes = excludeKeywords.map(k => k.toLowerCase().trim().normalize('NFC'));

    // 1. ƯU TIÊN 1: Khớp chính xác 100%
    for (const target of normIncludes) {
        const exactMatch = normalizedRowKeys.find(k => k.norm === target);
        if (exactMatch) return row[exactMatch.original] ? String(row[exactMatch.original]).trim() : null;
    }

    // 2. ƯU TIÊN 2: Quét linh hoạt có chứa từ khóa và loại trừ từ rác
    const matchedKey = normalizedRowKeys.find(k => {
        const matchesInclude = normIncludes.some(kw => k.norm.includes(kw));
        const matchesExclude = normExcludes.some(kw => k.norm.includes(kw));
        return matchesInclude && !matchesExclude;
    });

    return matchedKey && row[matchedKey.original] ? String(row[matchedKey.original]).trim() : null;
}

async function startMigration() {
    const client = new MongoClient(URI);
    try {
        await client.connect();
        console.log("🚀 Đã kết nối thành công tới MongoDB Atlas!");
        const db = client.db(DB_NAME);

        const collectionsToDrop = [
            'products', 'productbranchstocks', 'categories',
            'vendors', 'inventorychecks', 'inventorytransfers', 'inventoryimexbills'
        ];

        console.log("🧹 Đang tự động dọn sạch tàn dư cũ trên Atlas...");
        for (const colName of collectionsToDrop) {
            try {
                await db.collection(colName).drop();
            } catch (err) { }
        }
        console.log("✨ Khởi động dòng chảy dữ liệu VÉT CẠN...\n");

        console.log("⏳ BƯỚC 1: ĐANG TÌM VÀ ĐỌC FILE...");
        const rawCategories = await safeReadCSV('./categories.csv');
        const rawVendors = await safeReadCSV('./vendors.csv');
        const rawProducts = await safeReadCSV('./products.csv');
        const rawInventory = await safeReadCSV('./inventory.csv');
        const rawChecks = await safeReadCSV('./inventory_checks.csv');
        const rawTransfers = await safeReadCSV('./inventory_transfers.csv');
        const rawImexBills = await safeReadCSV('./imex_bills.csv');

        // IN RA BÁO CÁO NHƯ CŨ ĐỂ BIẾT TOOL CÓ ĐỌC ĐƯỢC CHỮ NÀO KHÔNG
        console.log(`\n📊 KẾT QUẢ ĐỌC FILE VÀO BỘ NHỚ:`);
        console.log(`   - Danh mục: ${rawCategories.length} dòng`);
        console.log(`   - Nhà cung cấp: ${rawVendors.length} dòng`);
        console.log(`   - Sản phẩm: ${rawProducts.length} dòng`);
        console.log(`   - Tồn kho: ${rawInventory.length} dòng`);
        console.log(`   - Kiểm kho: ${rawChecks.length} dòng`);
        console.log(`   - Chuyển kho: ${rawTransfers.length} dòng`);
        console.log(`   - Hóa đơn XNK: ${rawImexBills.length} dòng\n`);

        // ==========================================
        // 1. DANH MỤC
        // ==========================================
        const catOps = [];
        for (const row of rawCategories) {
            const name = getFlexVal(row, ['name', 'tên danh mục', 'danh mục']);
            if (!name) continue;
            catOps.push({
                updateOne: {
                    filter: { code: getFlexVal(row, ['code', 'mã danh mục']) || name },
                    update: {
                        $set: {
                            name: name,
                            code: getFlexVal(row, ['code', 'mã danh mục']) || name,
                            isActive: !(getFlexVal(row, ['isactive', 'trạng thái', 'hiển thị']) || '').toLowerCase().includes('ẩn'),
                            createdAt: getFlexVal(row, ['ngày tạo', 'createdat']) ? new Date(getFlexVal(row, ['ngày tạo', 'createdat'])) : new Date()
                        }
                    },
                    upsert: true
                }
            });
        }
        if (catOps.length > 0) {
            const r = await db.collection('categories').bulkWrite(catOps);
            console.log(`✅ DANH MỤC: Up thành công ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }

        // ==========================================
        // 2. NHÀ CUNG CẤP
        // ==========================================
        const vendorOps = [];
        for (const row of rawVendors) {
            const name = getFlexVal(row, ['tên nhà cung cấp', 'nhà cung cấp']);
            const id = getFlexVal(row, ['mã nhà cung cấp', 'id']);
            if (!name && !id) continue;

            const code = id || name;
            vendorOps.push({
                updateOne: {
                    filter: { code: code },
                    update: {
                        $set: {
                            code: code,
                            name: name || 'Chưa rõ',
                            address: getFlexVal(row, ['địa chỉ', 'address']) || '',
                            phone: getFlexVal(row, ['điện thoại', 'phone']) || '',
                            email: getFlexVal(row, ['email']) || '',
                            type: getFlexVal(row, ['loại', 'type']) || 'Cá nhân',
                            bankInfo: {
                                bankName: getFlexVal(row, ['ngân hàng']) || '',
                                branch: getFlexVal(row, ['chi nhánh']) || '',
                                accountNumber: getFlexVal(row, ['số tài khoản']) || '',
                                accountHolder: getFlexVal(row, ['chủ tài khoản']) || ''
                            },
                            status: getFlexVal(row, ['trạng thái', 'status'])?.includes('giao dịch') ? 'active' : 'inactive'
                        }
                    },
                    upsert: true
                }
            });
        }
        if (vendorOps.length > 0) {
            const r = await db.collection('vendors').bulkWrite(vendorOps);
            console.log(`✅ NHÀ CUNG CẤP: Up thành công ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }

        // ==========================================
        // 3. SẢN PHẨM & TỒN KHO
        // ==========================================
        const productOps = [];
        const stockOps = [];
        const branchHN_Id = new ObjectId("6a05946e67c30b7a39107bca");
        const branchHCM_Id = new ObjectId("6a05946e67c30b7a39107bcb");

        for (const row of rawProducts) {
            const sku = getFlexVal(row, ['mã sản phẩm', 'sku'], ['cha']);
            if (!sku) continue;

            const productId = new ObjectId();
            productOps.push({
                updateOne: {
                    filter: { code: sku },
                    update: {
                        $set: {
                            _id: productId, code: sku, sku: sku,
                            barcode: getFlexVal(row, ['mã vạch', 'barcode']) || '',
                            name: getFlexVal(row, ['tên sản phẩm', 'name'], ['cha']) || 'Sản phẩm không tên',
                            unit: getFlexVal(row, ['đơn vị tính', 'unit']) || 'Cái',

                            purchasePrice: parseInt(getFlexVal(row, ['giá nhập', 'purchase'], ['vat', '+', 'mode'])) || 0,
                            salePrice: parseInt(getFlexVal(row, ['giá bán', 'sale'], ['vat', '+', 'mode', 'sỉ', 'chi nhánh'])) || 0,
                            wholesalePrice: parseInt(getFlexVal(row, ['giá sỉ', 'wholesale'], ['vat', '+', 'chi nhánh'])) || 0,
                            originalPrice: parseInt(getFlexVal(row, ['giá cũ', 'original'])) || 0,

                            weight: getFlexVal(row, ['cân nặng', 'khối lượng']) || '',
                            warrantyMonths: parseInt(getFlexVal(row, ['bảo hành'])) || 0,
                            categoryName: getFlexVal(row, ['danh mục', 'category'], ['mã', 'nội bộ']) || '',
                            brandName: getFlexVal(row, ['thương hiệu', 'brand']) || '',

                            status: getFlexVal(row, ['trạng thái', 'status'])?.includes('Mới') ? 'active' : 'inactive',
                            attributes: {
                                color: getFlexVal(row, ['màu sắc', 'màu']),
                                size: getFlexVal(row, ['kích thước', 'size'])
                            },
                            createdAt: new Date()
                        }
                    },
                    upsert: true
                }
            });

            const invRow = rawInventory.find(i => getFlexVal(i, ['mã sản phẩm', 'sku'], ['cha']) === sku);
            if (invRow) {
                const stockHN = parseInt(getFlexVal(invRow, ['kho hà nội', 'hà nội'])) || 0;
                const stockHCM = parseInt(getFlexVal(invRow, ['kho hcm', 'hcm'])) || 0;
                if (stockHN > 0) stockOps.push({ updateOne: { filter: { product_id: productId, branch_id: branchHN_Id }, update: { $set: { stock: stockHN } }, upsert: true } });
                if (stockHCM > 0) stockOps.push({ updateOne: { filter: { product_id: productId, branch_id: branchHCM_Id }, update: { $set: { stock: stockHCM } }, upsert: true } });
            }
        }
        if (productOps.length > 0) {
            const r = await db.collection('products').bulkWrite(productOps);
            console.log(`✅ SẢN PHẨM: Up thành công ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }
        if (stockOps.length > 0) {
            const r = await db.collection('productbranchstocks').bulkWrite(stockOps);
            console.log(`✅ TỒN KHO CHI NHÁNH: Phân bổ ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }

        // ==========================================
        // 4. KIỂM KHO
        // ==========================================
        const checkOps = [];
        for (const row of rawChecks) {
            const id = getFlexVal(row, ['id']);
            if (id) checkOps.push({ updateOne: { filter: { code: id }, update: { $set: { code: id, date: getFlexVal(row, ['ngày', 'date']), type: getFlexVal(row, ['loại kiểm kho', 'type']), branchName: getFlexVal(row, ['kho', 'branch']), creator: getFlexVal(row, ['người tạo', 'creator']), note: getFlexVal(row, ['ghi chú', 'note']) } }, upsert: true } });
        }
        if (checkOps.length > 0) {
            const r = await db.collection('inventorychecks').bulkWrite(checkOps);
            console.log(`✅ PHIẾU KIỂM KHO: Up thành công ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }

        // ==========================================
        // 5. CHUYỂN KHO
        // ==========================================
        const transferOps = [];
        for (const row of rawTransfers) {
            const id = getFlexVal(row, ['id']);
            if (id) transferOps.push({ updateOne: { filter: { code: id }, update: { $set: { code: id, date: getFlexVal(row, ['ngày', 'date']), type: getFlexVal(row, ['kiểu', 'type']), branchRoute: getFlexVal(row, ['kho', 'branch']), totalQuantity: parseInt(getFlexVal(row, ['tổng sl', 'số lượng'])) || 0, creator: getFlexVal(row, ['người tạo', 'creator']), note: getFlexVal(row, ['mô tả', 'note']) } }, upsert: true } });
        }
        if (transferOps.length > 0) {
            const r = await db.collection('inventorytransfers').bulkWrite(transferOps);
            console.log(`✅ PHIẾU CHUYỂN KHO: Up thành công ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }

        // ==========================================
        // 6. HÓA ĐƠN XNK
        // ==========================================
        const billOps = [];
        for (const row of rawImexBills) {
            const id = getFlexVal(row, ['id']);
            if (id) billOps.push({
                updateOne: {
                    filter: { code: id }, update: {
                        $set: {
                            code: id, date: getFlexVal(row, ['ngày', 'date']), branchName: getFlexVal(row, ['kho hàng', 'kho']), type: getFlexVal(row, ['kiểu', 'type']),
                            totalItems: parseInt(getFlexVal(row, ['số sp', 'sp'])) || 0, totalAmount: parseInt(getFlexVal(row, ['tổng tiền', 'amount'])) || 0,
                            discount: parseInt(getFlexVal(row, ['chiết khấu', 'discount'])) || 0,
                            creator: getFlexVal(row, ['người lập phiếu', 'người tạo', 'creator']) || '',
                            customerName: getFlexVal(row, ['khách hàng', 'tên khách hàng', 'customer']) || '',
                            customerPhone: getFlexVal(row, ['điện thoại', 'sđt', 'phone']) || ''
                        }
                    }, upsert: true
                }
            });
        }
        if (billOps.length > 0) {
            const r = await db.collection('inventoryimexbills').bulkWrite(billOps);
            console.log(`✅ HÓA ĐƠN XNK: Up thành công ${r.upsertedCount + r.modifiedCount} bản ghi.`);
        }

        console.log("\n🎉 TOÀN BỘ DỮ LIỆU ĐÃ ĐƯỢC CHẠY XONG! HÃY KIỂM TRA LẠI ATLAS!");

    } catch (error) {
        console.error("❌ Lỗi hệ thống:", error);
    } finally {
        await client.close();
    }
}

startMigration();
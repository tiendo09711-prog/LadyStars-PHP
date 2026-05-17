import xlsx from 'xlsx';
import mongoose from 'mongoose';

const uri = "mongodb://tiendodev:290105@ac-vmjik1y-shard-00-00.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-01.oi4lav0.mongodb.net:27017,ac-vmjik1y-shard-00-02.oi4lav0.mongodb.net:27017/ladystars?tls=true&authSource=admin&replicaSet=atlas-1204cs-shard-0&retryWrites=true&w=majority&appName=tiendev";

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const workbook = xlsx.readFile('C:\\Users\\tiend\\Desktop\\LadyStars\\Bảng dữ liệu\\Bảng Sản Phẩm.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const headers = data[0];
  
  let updatedCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const getVal = (colName) => {
      const idx = headers.indexOf(colName);
      return idx >= 0 ? row[idx] : undefined;
    };

    const code = getVal('Mã sản phẩm');
    if (!code) continue;

    // Parse specific fields based on excel columns
    const updatePayload = {
      name: getVal('Tên sản phẩm') || '',
      type: getVal('Loại sản phẩm') === 'Sản phẩm' ? 'product' : 'service',
      unit: getVal('Đơn vị tính') || '',
      weight: parseFloat(getVal('Trọng lượng nguyên hộp(gram)')) || 0,
      cost: parseFloat(getVal('Giá vốn')) || 0,
      price: parseFloat(getVal('Giá bán')) || 0,
      qty: parseFloat(getVal('Tổng tồn')) || 0,
      warehouseQty: parseFloat(getVal('Tồn trong kho')) || 0,
      availableStock: parseFloat(getVal('Có thể bán')) || 0,
      holdQty: parseFloat(getVal('Tạm giữ')) || 0,
      pendingImportQty: parseFloat(getVal('Đang chuyển kho')) || 0,
      preorderQty: parseFloat(getVal('Đặt trước')) || 0,
      status: getVal('Trạng thái') || 'Mới',
      categoryName: getVal('Danh mục') || '',
      trademarkName: getVal('Thương hiệu') || '',
      supplierName: getVal('Nhà cung cấp') || '',
      color: getVal('Màu sắc') || '',
      size: getVal('Kích thước') || '',
      origin: getVal('Xuất xứ') || '',
      // Ensure we don't accidentally overwrite id
    };

    await db.collection('products').updateOne(
      { code: String(code) },
      { $set: updatePayload },
      { upsert: true }
    );
    updatedCount++;
    
    if (updatedCount % 100 === 0) {
      console.log(`Processed ${updatedCount} products...`);
    }
  }

  console.log(`Finished processing ${updatedCount} products.`);
  await mongoose.disconnect();
}

run().catch(console.error);

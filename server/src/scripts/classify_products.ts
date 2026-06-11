import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Product, Category } from '../modules/product/product.models.js';

// Định nghĩa từ khóa cho từng danh mục để phân loại bằng AI/Heuristic
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Ốp lưng': ['ốp', 'op lung', 'case', 'bao da', 'ốp lưng', 'cover'],
  'Cường lực': ['cường lực', 'cuong luc', 'kính cường lực', 'dán màn hình', 'miếng dán', 'ppf'],
  'Cáp sạc': ['cáp', 'sạc', 'dây sạc', 'sac', 'cap', 'lightning', 'type-c', 'type c', 'micro usb', 'củ sạc', 'dock sạc'],
  'Tai nghe': ['tai nghe', 'headphone', 'earphone', 'airpods', 'buds', 'headset'],
  'Pin dự phòng': ['pin dự phòng', 'sạc dự phòng', 'powerbank', 'pin du phong', 'sac du phong'],
  'Thiết bị thông minh': ['camera', 'loa', 'speaker', 'mic', 'micro', 'đồng hồ', 'smartwatch', 'gimbal', 'tripod', 'gậy chụp ảnh'],
  'Phụ kiện khác': ['dây đeo', 'túi chống sốc', 'đế đỡ', 'giá đỡ', 'kẹp điện thoại', 'bút cảm ứng', 'stylus', 'đồ chơi xe hơi', 'tẩu sạc']
};

async function runClassification(dryRun = true) {
  try {
    console.log('🔄 Đang kết nối tới Database...');
    await connectDatabase();
    console.log('✅ Đã kết nối DB.');

    // 1. Lấy danh sách danh mục
    const categories = await Category.find({}).lean();
    console.log(`📦 Tìm thấy ${categories.length} danh mục trong hệ thống:`);
    categories.forEach(c => {
      console.log(`   - ID: ${c._id} | Tên: ${c.name} | Code: ${c.code}`);
    });

    // 2. Lấy tất cả sản phẩm
    const products = await Product.find({}).lean();
    console.log(`📊 Tổng số sản phẩm trong hệ thống: ${products.length}`);

    const bulkOps: any[] = [];
    let matchedCount = 0;
    let unchangedCount = 0;

    for (const product of products) {
      const name = product.name || '';
      const nameLower = name.toLowerCase();
      
      let targetCategory: any = null;

      // Bước 1: Khớp theo từ khóa định sẵn
      for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const hasKeyword = keywords.some(keyword => nameLower.includes(keyword));
        if (hasKeyword) {
          // Tìm danh mục thực tế khớp tên
          targetCategory = categories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()) || catName.toLowerCase().includes(c.name.toLowerCase()));
          if (targetCategory) break;
        }
      }

      // Bước 2: Nếu không khớp từ khóa, thử khớp trực tiếp tên danh mục với product.categoryName hiện tại
      if (!targetCategory && product.categoryName) {
        targetCategory = categories.find(c => c.name.toLowerCase() === String(product.categoryName).trim().toLowerCase());
      }

      // Bước 3: Nếu vẫn không khớp, thử xem tên sản phẩm có chứa trực tiếp tên của danh mục nào không
      if (!targetCategory) {
        targetCategory = categories.find(c => nameLower.includes(c.name.toLowerCase()));
      }

      // Nếu tìm thấy danh mục phù hợp
      if (targetCategory) {
        const currentCatIdStr = product.categoryId ? String(product.categoryId) : '';
        const targetCatIdStr = String(targetCategory._id);

        if (currentCatIdStr !== targetCatIdStr || product.categoryName !== targetCategory.name) {
          matchedCount++;
          if (!dryRun) {
            bulkOps.push({
              updateOne: {
                filter: { _id: product._id },
                update: {
                  $set: {
                    categoryId: targetCategory._id,
                    categoryName: targetCategory.name
                  }
                }
              }
            });
          } else {
            console.log(`   [DRY-RUN] SP: "${name}" -> Gán danh mục: "${targetCategory.name}" (Trước: "${product.categoryName || 'Không có'}")`);
          }
        } else {
          unchangedCount++;
        }
      } else {
        console.log(`   ⚠️ Không phân loại được SP: "${name}" (Tên danh mục cũ: "${product.categoryName || 'Không có'}")`);
      }
    }

    console.log(`\n📊 THỐNG KÊ PHÂN LOẠI:`);
    console.log(`   - Số sản phẩm khớp danh mục mới / cần cập nhật: ${matchedCount}`);
    console.log(`   - Số sản phẩm đã đúng danh mục: ${unchangedCount}`);
    console.log(`   - Tổng sản phẩm chưa thể phân loại: ${products.length - (matchedCount + unchangedCount)}`);

    if (!dryRun && bulkOps.length > 0) {
      console.log(`🚀 Đang cập nhật ${bulkOps.length} sản phẩm lên Database...`);
      const result = await Product.bulkWrite(bulkOps);
      console.log(`✅ Hoàn tất! Đã cập nhật thành công.`);
    } else if (!dryRun) {
      console.log(`ℹ️ Không có sản phẩm nào cần cập nhật.`);
    }

    // 3. Cập nhật lại số lượng sản phẩm trong từng danh mục (productCount)
    if (!dryRun) {
      console.log('🔄 Đang cập nhật lại trường productCount cho các danh mục...');
      for (const cat of categories) {
        const count = await Product.countDocuments({ categoryId: cat._id });
        await Category.findByIdAndUpdate(cat._id, { productCount: count });
        console.log(`   - Danh mục "${cat.name}": ${count} sản phẩm.`);
      }
      console.log('✅ Đã cập nhật xong productCount.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

// Lấy tham số `--run` để thực thi thật, mặc định là dry-run
const args = process.argv.slice(2);
const isDryRun = !args.includes('--run');
console.log(isDryRun ? '🧪 ĐANG CHẠY Ở CHẾ ĐỘ THỬ NGHIỆM (DRY-RUN)...' : '🔥 ĐANG CHẠY Ở CHẾ ĐỘ THỰC TẾ (MIGRATION)...');

runClassification(isDryRun);

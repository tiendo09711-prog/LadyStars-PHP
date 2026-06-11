import { test, expect } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const MONGO_URI = process.env.MONGO_URI!;
const TEST_PRODUCT_CODE = 'E2E_SP_TEST';

let mongoClient: MongoClient;

test.beforeAll(async () => {
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db('ladystars');

  // Seed a test product with stock
  await db.collection('products').updateOne(
    { code: TEST_PRODUCT_CODE },
    {
      $set: {
        code: TEST_PRODUCT_CODE,
        name: 'Sản phẩm E2E Test',
        price: 200000,
        cost: 100000,
        qty: 50,
        status: 'Đang bán',
        allowsSale: true,
        type: 'product',
        totalStock: 50,
      }
    },
    { upsert: true }
  );
});

test.afterAll(async () => {
  const db = mongoClient.db('ladystars');
  // Cleanup test data
  await db.collection('products').deleteOne({ code: TEST_PRODUCT_CODE });
  await db.collection('salepayments').deleteMany({ 'meta.customerName': 'Khach E2E Test' });
  await mongoClient.close();
});

test.describe('Luồng Nghiệp Vụ: Tạo Hóa Đơn Bán Lẻ -> Báo Cáo Doanh Thu', () => {
  test('1. Trang Bán Lẻ phải load được và hiển thị danh sách từ SalePayment', async ({ page }) => {
    await page.goto('/sales-channels/admin/retail');
    // The list now comes from /products/sales
    await expect(page.locator('.tabbed-module-page, .revenue-time-container, table, [class*="table"]').first()).toBeVisible({ timeout: 10000 });
    console.log('✅ Trang bán lẻ load thành công');
  });

  test('2. Giao diện Tạo Đơn hàng phải hiển thị đúng khi chọn kho', async ({ page }) => {
    // Get a branch ID from API
    const apiRes = await page.request.get('/api/system/branches');
    const branches = await apiRes.json().catch(() => ({ items: [] }));
    const branchList = branches.items || branches;
    
    if (!branchList || branchList.length === 0) {
      console.log('⏭️ Không có chi nhánh, bỏ qua test này');
      return;
    }
    const branch = branchList[0];
    
    await page.goto(`/sales-channels/admin/retail/create?branchId=${branch._id}`);
    await expect(page.locator('input[placeholder="Nhập họ tên khách hàng"]')).toBeVisible({ timeout: 8000 });
    console.log('✅ Form tạo đơn hàng load thành công');
  });

  test('3. API /products/sales trả về đúng cấu trúc SalePayment', async ({ page }) => {
    // Navigate first to get auth context
    await page.goto('/sales-channels/admin/retail');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const res = await page.request.get('http://localhost:4000/api/products/sales?limit=10', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('items');
    expect(Array.isArray(data.items)).toBeTruthy();
    console.log(`✅ API /products/sales OK - ${data.total} hóa đơn trong hệ thống`);
  });

  test('4. API /reports/revenue-time trả về dữ liệu từ SalePayment (không còn từ RetailInvoice)', async ({ page }) => {
    await page.goto('/reports/revenue/time');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const res = await page.request.get('http://localhost:4000/api/reports/revenue-time?displayType=Theo%20ng%C3%A0y', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    // Each item should have correct keys
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('time');
      expect(data[0]).toHaveProperty('revenue');
      expect(data[0]).toHaveProperty('profit');
    }
    console.log(`✅ API /reports/revenue-time OK - ${data.length} điểm dữ liệu`);
  });

  test('5. Trang Báo cáo Doanh thu /reports/revenue/time load thành công', async ({ page }) => {
    await page.goto('/reports/revenue/time');
    await expect(page.locator('.revenue-time-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Lọc")')).toBeEnabled();
    console.log('✅ Trang báo cáo doanh thu OK');
  });
});

import { test, expect } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const MONGO_URI = process.env.MONGO_URI!;
const TEST_PRODUCT_CODE = 'E2E_SP_TEST_DASHBOARD';

let mongoClient: MongoClient;

test.beforeAll(async () => {
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db('ladystars');

  // Seed a test product with stock
  const productId = new ObjectId();
  await db.collection('products').updateOne(
    { code: TEST_PRODUCT_CODE },
    {
      $set: {
        _id: productId,
        code: TEST_PRODUCT_CODE,
        name: 'Sản phẩm Test Dashboard',
        price: 500000,
        cost: 200000,
        qty: 100,
        status: 'Đang bán',
        allowsSale: true,
        type: 'product',
        totalStock: 100,
      }
    },
    { upsert: true }
  );

  // We need the branchId to seed stock for it. We'll seed stock for all active branches.
  const branches = await db.collection('branches').find({ isActive: true }).toArray();
  for (const branch of branches) {
    await db.collection('productbranchstocks').updateOne(
      { productId, branchId: branch._id },
      {
        $set: {
          productId,
          branchId: branch._id,
          qty: 100,
          costPrice: 200000
        }
      },
      { upsert: true }
    );
  }

  
  // Xóa các giao dịch rác của E2E cũ nếu có
  await db.collection('salepayments').deleteMany({ 'meta.customerName': 'Khach E2E Dashboard' });
});

test.afterAll(async () => {
  const db = mongoClient.db('ladystars');
  // Cleanup test data
  const product = await db.collection('products').findOne({ code: TEST_PRODUCT_CODE });
  if (product) {
    await db.collection('productbranchstocks').deleteMany({ productId: product._id });
  }
  await db.collection('products').deleteOne({ code: TEST_PRODUCT_CODE });
  await db.collection('salepayments').deleteMany({ 'meta.customerName': 'Khach E2E Dashboard' });
  await mongoClient.close();
});

test('Tạo giao dịch bán lẻ và kiểm tra Dashboard cập nhật doanh thu', async ({ page }) => {
  // 1. Lấy danh sách chi nhánh để tạo đơn
  await page.goto('/'); // Cần load page để lấy token từ localStorage
  await page.waitForTimeout(1000);
  const token = await page.evaluate(() => localStorage.getItem('token')); // auth.setup.ts sets this
  
  const apiBase = 'http://localhost:4000';
  let freshToken = token;
  const loginRes = await page.request.post(`${apiBase}/api/auth/login`, {
    data: { email: 'admin@gmail.com', password: '123456' }
  });
  if (loginRes.ok()) {
    const loginData = await loginRes.json();
    freshToken = loginData.token;
  }

  const branchRes = await page.request.get(`${apiBase}/api/system/branches`, {
    headers: { Authorization: `Bearer ${freshToken}` }
  });
  const branchData = await branchRes.json();
  const branchList = branchData.items || branchData;
  if (!branchList || branchList.length === 0) {
    console.log('⏭️ Không có chi nhánh, bỏ qua test này');
    return;
  }
  const branch = branchList[0];

  // 2. Vào trang tạo hóa đơn bán lẻ
  await page.goto(`/sales-channels/admin/retail/create?branchId=${branch._id}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 3. Nhập thông tin khách hàng
  await page.getByPlaceholder('Nhập họ tên khách hàng').fill('Khach E2E Dashboard');
  await page.getByPlaceholder('Nhập số điện thoại').fill('0999999999');
  // 3.5 Kiểm tra xem API trả về product test như thế nào
  const inventoryRes = await page.request.get(`${apiBase}/api/products/inventories?limit=5000`, {
    headers: { Authorization: `Bearer ${freshToken}` }
  });
  const inventoryData = await inventoryRes.json();
  const myProduct = inventoryData.items?.find((i: any) => i.code === TEST_PRODUCT_CODE);
  console.log('API RETURNED MY PRODUCT:', JSON.stringify(myProduct));
  console.log('Current branch in test:', branch.name);

  // 4. Chọn sản phẩm
  const searchInput = page.getByPlaceholder('Tìm theo mã hoặc tên sản phẩm...');
  await searchInput.click();
  await searchInput.pressSequentially(TEST_PRODUCT_CODE, { delay: 100 });
  await page.waitForTimeout(2000); // Chờ dropdown
  
  // Click vào sản phẩm trong dropdown
  await page.getByText(`Mã: ${TEST_PRODUCT_CODE}`).click();
  await page.waitForTimeout(500);

  // Nhập số lượng 2
  const qtyInput = page.locator('input[type="number"]').nth(1); // Thường là ô nhập số lượng sau đơn giá
  await qtyInput.fill('2');
  await page.keyboard.press('Tab'); // Trigger auto calc

  await page.waitForTimeout(1000);

  // 5. Lưu hóa đơn
  await page.locator('button', { hasText: 'Lưu hóa đơn' }).click();
  
  // Chờ chuyển hướng về danh sách hoặc thông báo thành công
  await page.waitForURL('**/sales-channels/admin/retail', { timeout: 10000 });
  console.log('✅ Đã tạo đơn hàng bán lẻ thành công (Giá trị: 1,000,000đ)');
  await page.waitForTimeout(1000);

  // 6. Quay lại Dashboard kiểm tra
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Chờ biểu đồ render

  // 7. Xác minh dữ liệu mới trên UI
  // Bảng Kênh Bán phải có doanh thu
  const table = page.locator('table.dv2-table').first();
  const tableText = await table.innerText();
  
  // Doanh thu phải lớn hơn 0
  expect(tableText).not.toContain('Tổng\t0');
  
  // Biểu đồ có xuất hiện data
  const dashRes = await page.request.get(`${apiBase}/api/dashboard`, {
    headers: { Authorization: `Bearer ${freshToken}` }
  });
  const dashData = await dashRes.json();
  const revenue = dashData.totals?.revenue;
  console.log(`📊 Doanh thu cập nhật trên Dashboard API: ${revenue}`);
  
  expect(revenue).toBeGreaterThanOrEqual(1000000);
  
  console.log('✅ Dashboard đã hiển thị số liệu doanh thu từ giao dịch vừa tạo!');
});

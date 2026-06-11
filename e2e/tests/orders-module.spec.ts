import { test, expect } from '@playwright/test';
import { connectDB } from '../utils/db';

test.describe('Orders Module E2E Flow', () => {
  const TEST_ORDER_CODE = 'E2E-ORDER-001';
  const TEST_SKU = 'E2E-SKU-01';
  let db: any;
  let testProductId: string;

  test.beforeAll(async () => {
    db = await connectDB();
    
    // Clean up before test
    await db.collection('orders').deleteMany({ orderCode: TEST_ORDER_CODE });
    await db.collection('products').deleteMany({ code: TEST_SKU });

    // Seed a product
    const productResult = await db.collection('products').insertOne({
      code: TEST_SKU,
      name: 'Sản phẩm Test E2E Đóng Gói',
      retailPrice: 100000,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    testProductId = productResult.insertedId;

    // Seed an order with "In và đóng gói" status
    await db.collection('orders').insertOne({
      orderCode: TEST_ORDER_CODE,
      customerName: 'Khách hàng E2E',
      customerPhone: '0988888888',
      shippingAddress: 'Hà Nội',
      paymentMethod: 'COD',
      totalAmount: 100000,
      status: 'In và đóng gói',
      warehouse: 'Kho Hà Nội',
      deliveryStatus: 'Chờ lấy hàng',
      note: 'Đơn hàng tạo từ E2E test',
      products: [{
        productId: testProductId,
        sku: TEST_SKU,
        productName: 'Sản phẩm Test E2E Đóng Gói',
        quantity: 2,
        scannedQuantity: 0
      }],
      eInvoiceStatus: 'Chưa tạo',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  test.afterAll(async () => {
    if (db) {
      await db.collection('orders').deleteMany({ orderCode: TEST_ORDER_CODE });
      await db.collection('products').deleteMany({ code: TEST_SKU });
      await db.collection('orderhandovers').deleteMany({ handoverCode: /BBBG-E2E/ });
      await db.collection('orderdisputes').deleteMany({ orderCode: TEST_ORDER_CODE });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    const isLoginVisible = await page.locator('input[type="email"]').isVisible().catch(() => false);
    if (isLoginVisible) {
      await page.fill('input[type="email"]', 'admin@gmail.com');
      await page.fill('input[type="password"]', '123456');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }
  });

  test('Should process an order from Packing to Handover successfully', async ({ page }) => {
    // Enable console logging for debugging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Kiểm tra đơn hàng ở màn quản lý
    await page.goto('http://localhost:5173/orders/manage');
    await page.waitForSelector(`text=${TEST_ORDER_CODE}`);
    await expect(page.locator(`text=${TEST_ORDER_CODE}`).first()).toBeVisible();

    // 2. Vào màn Đóng gói (Packing)
    await page.goto('http://localhost:5173/orders/packing');
    
    // Quét mã đơn hàng
    await page.fill('input[placeholder="Mã đơn hàng (ví dụ: ORD-2026-1001)"]', TEST_ORDER_CODE);
    await page.keyboard.press('Enter');
    
    // Đợi thông tin đơn hàng hiện lên
    await page.waitForSelector(`text=Nạp đơn hàng ${TEST_ORDER_CODE} thành công`);
    await expect(page.locator(`text=${TEST_ORDER_CODE}`).first()).toBeVisible();

    // Quét mã sản phẩm (số lượng 2)
    const productInput = page.locator('input[placeholder="Quét mã vạch SKU sản phẩm"]');
    await productInput.fill(TEST_SKU);
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(500); // Đợi toast báo 1/2
    
    await productInput.fill(TEST_SKU);
    await page.keyboard.press('Enter');
    
    // Khi quét đủ 2/2, hệ thống tự động gọi API lưu (forcePack = false)
    await page.waitForSelector('text=Đã đóng gói thành công đơn hàng');

    // 3. Vào màn Chờ gửi vận chuyển
    await page.goto('http://localhost:5173/orders/shipping-pending');
    await page.waitForSelector(`text=${TEST_ORDER_CODE}`);
    await expect(page.locator(`text=${TEST_ORDER_CODE}`).first()).toBeVisible();

    // 4. Tạo khiếu nại (Test màn Dispute)
    await page.goto('http://localhost:5173/orders/disputes');
    await page.click('button:has-text("Tạo đơn khiếu nại")');
    await page.waitForSelector('text=Tạo đơn khiếu nại');
    
    // Nhập form (customerName và customerPhone sẽ được auto-fill qua backend route intercept)
    await page.fill('input[required][type="text"]', `DISP-${TEST_ORDER_CODE}`); // Mã khiếu nại (1st required input)
    // There are 2 required inputs: disputeCode and orderCode. DataModulePage renders them in order.
    // Let's use exact label queries if possible or just use nth input
    const inputs = page.locator('.modal-card input[required]');
    await inputs.nth(0).fill(`DISP-${TEST_ORDER_CODE}`); // disputeCode
    await inputs.nth(1).fill(TEST_ORDER_CODE); // orderCode

    await page.click('button[type="submit"]:has-text("Lưu")');
    await page.waitForTimeout(1000);
    
    // Kiểm tra xem khiếu nại đã được tạo và hiển thị Tên Khách Hàng tự động đồng bộ từ DB
    await expect(page.locator(`text=Khách hàng E2E`).first()).toBeVisible();
  });
});

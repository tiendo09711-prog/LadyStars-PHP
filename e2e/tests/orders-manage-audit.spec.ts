import { test, expect } from '@playwright/test';
import { connectDB } from '../utils/db';

test.describe('Orders Manage Hardcode Audit', () => {
  let db: any;

  test.beforeAll(async () => {
    db = await connectDB();
    
    // Cleanup any existing test data to ensure isolation
    await db.collection('orders').deleteMany({ orderCode: /AUDIT-ORD/ });
    await db.collection('branches').deleteMany({ code: 'AUDIT-BR' });
    await db.collection('orderhandovers').deleteMany({ handoverCode: 'AUDIT-HO' });

    // Seed test branches
    await db.collection('branches').insertOne({
      name: 'Kho Audit',
      code: 'AUDIT-BR',
      address: '123 Test',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed test handover
    await db.collection('orderhandovers').insertOne({
      handoverCode: 'AUDIT-HO',
      carrier: 'GHTK',
      orderCount: 0,
      status: 'Đang kiểm đếm',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Seed test orders
    await db.collection('orders').insertMany([
      {
        orderCode: 'AUDIT-ORD-1',
        customerName: 'Khách Audit 1',
        paymentMethod: 'COD',
        totalAmount: 150000,
        status: 'Cần xử lí',
        warehouse: 'Kho Audit',
        deliveryStatus: 'Chờ lấy hàng',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        orderCode: 'AUDIT-ORD-2',
        customerName: 'Khách Audit 2',
        paymentMethod: 'Chuyển khoản',
        totalAmount: 200000,
        status: 'Đã thanh toán',
        warehouse: 'Kho Audit',
        deliveryStatus: 'Đang giao',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  });

  test.afterAll(async () => {
    if (db) {
      await db.collection('orders').deleteMany({ orderCode: /AUDIT-ORD/ });
      await db.collection('branches').deleteMany({ code: 'AUDIT-BR' });
      await db.collection('orderhandovers').deleteMany({ handoverCode: 'AUDIT-HO' });
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

  test('Should load orders and metadata directly from API without hardcoded data', async ({ page }) => {
    // 1. Intercept network requests to verify Actual APIs
    const requestPromises = {
      orders: page.waitForResponse(res => res.url().includes('/api/orders/manage') && res.request().method() === 'GET'),
      branches: page.waitForResponse(res => res.url().includes('/api/system/branches') && res.request().method() === 'GET'),
      handover: page.waitForResponse(res => res.url().includes('/api/orders/handover') && res.request().method() === 'GET')
    };

    await page.goto('http://localhost:5173/orders/manage');

    // Wait for all actual APIs to return
    const responses = await Promise.all([
      requestPromises.orders,
      requestPromises.branches,
      requestPromises.handover
    ]);

    expect(responses[0].status()).toBe(200);
    expect(responses[1].status()).toBe(200);
    expect(responses[2].status()).toBe(200);

    // 2. Verify Table reflects DB Orders
    await page.waitForSelector('text=AUDIT-ORD-1');
    await expect(page.locator('text=AUDIT-ORD-1').first()).toBeVisible();
    await expect(page.locator('text=Khách Audit 2').first()).toBeVisible();

    // 3. Verify Branch Filter/Create Form options come from API (Kho Audit)
    // We open the create form to check branch options
    await page.click('button:has-text("Tạo đơn hàng")');
    await page.waitForSelector('.modal-card');
    
    // Kho Audit should be in the select options for 'warehouse'
    const warehouseSelect = page.locator('.modal-card select').filter({ hasText: 'Kho Audit' }).first();
    await expect(warehouseSelect).toBeVisible();

    // Close modal
    await page.click('.modal-card .icon-button[title="Đóng"]');

    // 4. Verify Handover options come from API
    // We select an order and click Add to Handover
    const checkbox = page.locator('table tbody tr').filter({ hasText: 'AUDIT-ORD-1' }).locator('input[type="checkbox"]');
    await checkbox.check();

    await page.click('button:has-text("Thêm đơn vào biên bản bàn giao")');
    await page.waitForSelector('.modal-card h2:has-text("Thêm đơn vào biên bản bàn giao")');

    // Expected to see AUDIT-HO in the select
    const handoverSelect = page.locator('.modal-card select').filter({ hasText: 'AUDIT-HO' }).first();
    await expect(handoverSelect).toBeVisible();

    // Submit
    const bulkActionResponsePromise = page.waitForResponse(res => 
      res.url().includes('/api/orders/manage/bulk-action') && res.request().method() === 'POST'
    );
    await page.click('button:has-text("Xác nhận thêm vào biên bản")');
    const bulkResponse = await bulkActionResponsePromise;
    expect(bulkResponse.status()).toBe(200);
    const bulkJson = await bulkResponse.json();
    expect(bulkJson.success).toBe(true);

    // Verify DB updated
    const updatedOrder = await db.collection('orders').findOne({ orderCode: 'AUDIT-ORD-1' });
    expect(updatedOrder.note).toContain('AUDIT-HO');
  });
});

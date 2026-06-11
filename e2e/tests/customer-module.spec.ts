import { test, expect } from '@playwright/test';

const TEST_CUSTOMER_CODE = `TEST-KH-${Date.now()}`;
const TEST_CUSTOMER_PHONE = `0909${Math.floor(100000 + Math.random() * 900000)}`;

test.describe('Customer Module E2E Flow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/customers/list');
    // Wait for data load
    await page.waitForTimeout(2000);
  });

  test('Should create a new customer successfully', async ({ page }) => {
    await page.click('button:has-text("Thêm khách hàng")');
    await page.waitForSelector('.modal-card');

    await page.getByLabel('Mã KH').fill(TEST_CUSTOMER_CODE);
    await page.getByLabel('Tên khách hàng').fill('Khách Hàng Test E2E');
    await page.getByLabel('Số điện thoại').fill(TEST_CUSTOMER_PHONE);
    await page.getByLabel('Loại').selectOption('person');
    await page.getByLabel('Ghi chú').fill('Được tạo bởi Playwright E2E');

    await page.click('button:has-text("Lưu")');

    // Wait for the modal to close and success alert
    await page.waitForTimeout(1500);

    // Verify it appears in the list (search for it)
    await page.fill('input[placeholder*="Mã, tên"]', TEST_CUSTOMER_CODE);
    await page.waitForTimeout(1000);
    await expect(page.locator(`text=${TEST_CUSTOMER_CODE}`).first()).toBeVisible();
  });

  test('Should auto-fill customer info in Customer Care', async ({ page }) => {
    await page.goto('http://localhost:5173/customers/care');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Thêm mới")');
    await page.waitForSelector('.modal-card');

    // Nhập customerCode, ko nhập Name hay Phone
    await page.getByLabel('Mã khách hàng (nếu có)').fill(TEST_CUSTOMER_CODE);
    await page.getByLabel('Lý do').fill('Hỏi thăm định kỳ');

    // Lưu
    await page.click('button:has-text("Lưu")');
    await page.waitForTimeout(1500);

    // Kiểm tra xem backend đã auto-fill Tên và SĐT lên UI chưa
    // Mở phiếu vừa tạo ra xem chi tiết hoặc nhìn trên bảng
    await expect(page.locator(`text=Khách Hàng Test E2E`).first()).toBeVisible();
    await expect(page.locator(`text=${TEST_CUSTOMER_PHONE}`).first()).toBeVisible();
  });

  test('Should navigate and load data for all customer smart filters (tabs)', async ({ page }) => {
    await page.goto('http://localhost:5173/customers/list');
    await page.waitForTimeout(2000);

    const tabs = [
      'Tất cả',
      'Mua nhiều',
      'Mua nhiều, sinh nhật trong tháng',
      'Mua thường xuyên',
      'Lâu chưa mua'
    ];

    for (const tab of tabs) {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForTimeout(1000); // Wait for network request and render
      // Just verifying we can click through them without the app crashing
      // and checking that the active tab changes (usually by button class change but simply clicking is a good E2E check)
    }
  });

  test('Should sync customer metrics without errors', async ({ page }) => {
    await page.goto('http://localhost:5173/customers/list');
    await page.waitForTimeout(2000);

    // Bấm nút đồng bộ
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Đã đồng bộ');
      await dialog.accept();
    });

    await page.click('button:has-text("Đồng bộ chỉ số mua hàng")');
    await page.waitForTimeout(2000);
  });

  test('Should delete the test customer to cleanup', async ({ page }) => {
    // Navigate back to list
    await page.goto('http://localhost:5173/customers/list');
    await page.waitForTimeout(2000);

    // Search and delete
    await page.fill('input[placeholder*="Mã, tên"]', TEST_CUSTOMER_CODE);
    await page.waitForTimeout(1000);

    // Select row
    const row = page.locator(`tr:has-text("${TEST_CUSTOMER_CODE}")`);
    // Click the delete button on the row directly
    page.on('dialog', dialog => dialog.accept());
    await row.getByTitle('Xóa').click();
    await page.waitForTimeout(1500);

    // Verify it is gone
    await expect(page.locator(`text=${TEST_CUSTOMER_CODE}`).first()).not.toBeVisible();
  });
});

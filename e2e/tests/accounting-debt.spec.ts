import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_CUST_CODE = 'CUST_DEBT_01';
const TEST_VEND_CODE = 'VEND_DEBT_01';
const TEST_STAFF_NAME = 'STAFF_DEBT_01';

test.describe('Accounting Debt Management', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    // Clear out test data
    await db.collection('customerdebtsummaries').deleteMany({ code: TEST_CUST_CODE });
    await db.collection('vendordebtsummaries').deleteMany({ code: TEST_VEND_CODE });
    await db.collection('staffdebtsummaries').deleteMany({ staffName: TEST_STAFF_NAME });
    
    // Insert summaries so they exist when we post initial debt (with createdAt so they sort properly)
    const now = new Date();
    await db.collection('customerdebtsummaries').insertOne({ code: TEST_CUST_CODE, customerName: 'Test Cust', initialReceivable: 0, initialPayable: 0, incurredReceivable: 0, incurredPayable: 0, finalReceivable: 0, finalPayable: 0, createdAt: now });
    await db.collection('vendordebtsummaries').insertOne({ code: TEST_VEND_CODE, vendorName: 'Test Vend', initialReceivable: 0, initialPayable: 0, incurredReceivable: 0, incurredPayable: 0, finalReceivable: 0, finalPayable: 0, createdAt: now });
    await db.collection('staffdebtsummaries').insertOne({ staffName: TEST_STAFF_NAME, collectedRetail: 0, collectedOrders: 0, remainingDebt: 0, createdAt: now });
  });

  test.afterAll(async () => {
    const db = await connectDB();
    await db.collection('customerdebtsummaries').deleteMany({ code: TEST_CUST_CODE });
    await db.collection('vendordebtsummaries').deleteMany({ code: TEST_VEND_CODE });
    await db.collection('staffdebtsummaries').deleteMany({ staffName: TEST_STAFF_NAME });
    await closeDB();
  });

  test('Khởi tạo công nợ đầu kỳ', async ({ page }) => {
    await page.goto('/accounting/debt/initial');
    await page.waitForLoadState('networkidle');

    // Thêm nợ khách hàng (Phải thu / Báo nợ = receivable)
    await page.getByRole('combobox').nth(0).selectOption('receivable'); // Loại phiếu
    await page.getByPlaceholder('Số tiền').fill('1500000');
    await page.getByRole('combobox').nth(1).selectOption('customer'); // Đối tượng
    await page.getByPlaceholder('Mã đối tượng').fill(TEST_CUST_CODE);
    // Chọn option Tiếp tục thêm
    await page.getByLabel('Tiếp tục thêm').check();
    
    page.once('dialog', dialog => {
      console.log('Dialog CUST:', dialog.message());
      dialog.accept();
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.waitForTimeout(500);

    // Thêm nợ nhà cung cấp (Phải trả / Báo có = payable)
    await page.getByRole('combobox').nth(0).selectOption('payable');
    await page.getByPlaceholder('Số tiền').fill('2000000');
    await page.getByRole('combobox').nth(1).selectOption('vendor');
    await page.getByPlaceholder('Mã đối tượng').fill(TEST_VEND_CODE);
    
    page.once('dialog', dialog => {
      console.log('Dialog VEND:', dialog.message());
      dialog.accept();
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.waitForTimeout(500);

    // Thêm nợ nhân viên
    await page.getByRole('combobox').nth(0).selectOption('receivable'); // Nhân viên nợ công ty
    await page.getByPlaceholder('Số tiền').fill('500000');
    await page.getByRole('combobox').nth(1).selectOption('staff');
    await page.getByPlaceholder('Mã đối tượng').fill(TEST_STAFF_NAME);
    
    page.once('dialog', dialog => {
      console.log('Dialog STAFF:', dialog.message());
      dialog.accept();
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    
    await page.waitForTimeout(1000); // Give time for db to update
  });

  test('Kiểm tra công nợ Khách hàng hiển thị đúng', async ({ page }) => {
    await page.goto('/accounting/debt/customers');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for API response

    const row = page.locator('table.debt-table tbody tr').filter({ hasText: TEST_CUST_CODE }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText('1.500.000'); // Initial Receivable
  });

  test('Kiểm tra công nợ Nhà cung cấp hiển thị đúng', async ({ page }) => {
    await page.goto('/accounting/debt/vendors');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const row = page.locator('table.debt-table tbody tr').filter({ hasText: TEST_VEND_CODE }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText('2.000.000'); // Initial Payable
  });

  test('Kiểm tra công nợ Nhân viên hiển thị đúng', async ({ page }) => {
    await page.goto('/accounting/debt/staff');
    await page.waitForLoadState('networkidle');

    const row = page.locator('table.staff-table tbody tr').filter({ hasText: TEST_STAFF_NAME }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('500.000'); // remainingDebt
  });
});

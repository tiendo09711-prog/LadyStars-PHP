import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_ACC_CODE = 'TEST_1111';
const TEST_ACC_NAME = 'Tiền mặt Test';
const TEST_JE_TRANS_ID = 'JE_TEST_01';

test.describe('Accounting Journal & Entries', () => {
  let db: any;

  test.beforeAll(async () => {
    db = await connectDB();
    await db.collection('accountingaccounts').deleteMany({ code: TEST_ACC_CODE });
    await db.collection('cashtransactions').deleteMany({ transactionId: TEST_JE_TRANS_ID });
    await db.collection('logbookentries').deleteMany({ transactionId: TEST_JE_TRANS_ID });
  });

  test.afterAll(async () => {
    await db.collection('accountingaccounts').deleteMany({ code: TEST_ACC_CODE });
    await db.collection('cashtransactions').deleteMany({ transactionId: TEST_JE_TRANS_ID });
    await db.collection('logbookentries').deleteMany({ transactionId: TEST_JE_TRANS_ID });
    await closeDB();
  });

  test('Tạo và hiển thị Hệ thống tài khoản (Accounts)', async ({ page }) => {
    page.on('pageerror', error => console.log('Page Error:', error));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('Console Error:', msg.text());
    });
    await page.goto('/accounting/accounts');
    await page.waitForLoadState('networkidle');

    // Mở modal Thêm mới
    await page.locator('.btn-add').click();
    await expect(page.getByText('Thêm tài khoản')).toBeVisible();

    // Điền form
    const inputs = page.locator('.modal-content input');
    await inputs.nth(0).fill(TEST_ACC_CODE);
    await inputs.nth(1).fill(TEST_ACC_NAME);

    // Lưu
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.waitForTimeout(1000); // Wait for API response & re-fetch

    // Lọc theo mã tài khoản vừa tạo
    await page.getByPlaceholder('Mã/Tên Tài khoản').fill(TEST_ACC_CODE);
    await page.getByRole('button', { name: 'Lọc' }).click();
    await page.waitForTimeout(500);

    // Kiểm tra hiển thị
    const row = page.locator('table.accounts-table tbody tr').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(TEST_ACC_CODE);
    await expect(row).toContainText(TEST_ACC_NAME);
  });

  test('Import Bút toán (Journal Entries) và hiển thị', async ({ page }) => {
    await page.goto('/accounting/entries');
    await page.waitForLoadState('networkidle');

    // Create a mock CSV content
    const csvContent = `ID;Ngày tạo;Loại;Mã đối tượng;Tên đối tượng;Chứng từ;ID chứng từ;Số tiền;Nợ;Có;Diễn giải;Người tạo\n${TEST_JE_TRANS_ID};05/05/2026;Phiếu thu;KH01;Khách Hàng 1;Hóa đơn;HD01;1500000;1111;131;Thu tiền mặt;Admin`;
    
    // Instead of actual upload via file picker which requires file system, 
    // we'll mock the HTTP request or seed directly to test UI display.
    // However, playwright allows setInputFiles! Let's try that.
    
    // Playwright allows creating a buffer for setInputFiles
    await page.setInputFiles('input[type="file"]', {
      name: 'entries.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });

    // Handle the alert
    page.once('dialog', dialog => dialog.accept());
    
    await page.waitForTimeout(1500);

    // Filter to find our entry
    await page.getByPlaceholder('ID', { exact: true }).fill(TEST_JE_TRANS_ID);
    await page.getByRole('button', { name: 'Lọc' }).click();
    await page.waitForTimeout(500);

    const row = page.locator('table.je-table tbody tr').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(TEST_JE_TRANS_ID);
    await expect(row).toContainText('1.500.000');
  });

  test('Import Sổ nhật ký chung (Journal) và hiển thị', async ({ page }) => {
    await page.goto('/accounting/journal');
    await page.waitForLoadState('networkidle');

    const csvContent = `Ngày giao dịch;ID giao dịch;Chứng từ;TK Nợ | TK Có;Tài khoản đối ứng;Nợ;Có\n05/05/2026;${TEST_JE_TRANS_ID};HD01;1111;131;1500000;`;

    await page.setInputFiles('input[type="file"]', {
      name: 'journal.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });

    page.once('dialog', dialog => dialog.accept());
    
    await page.waitForTimeout(1500);

    // We do not have a direct ID filter for transactionId in UI, only VoucherId
    await page.getByPlaceholder('Chứng từ').fill('HD01');
    await page.getByRole('button', { name: 'Lọc' }).click();
    await page.waitForTimeout(500);

    const row = page.locator('table.jl-table tbody tr').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(TEST_JE_TRANS_ID);
    await expect(row).toContainText('HD01');
    await expect(row).toContainText('1.500.000');
  });
});

import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

test.describe('Accounting Receipts - Cash & Bank', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    // No specific ID to delete since ID is randomly generated in the create page:
    // Math.floor(1000000 + Math.random() * 9000000).toString()
    // We'll clean up based on specific note instead
    await db.collection('cashtransactions').deleteMany({ description: 'TEST_E2E_NOTE_CASH' });
    await db.collection('banktransactions').deleteMany({ description: 'TEST_E2E_NOTE_BANK' });
  });

  test.afterAll(async () => {
    const db = await connectDB();
    await db.collection('cashtransactions').deleteMany({ description: 'TEST_E2E_NOTE_CASH' });
    await db.collection('banktransactions').deleteMany({ description: 'TEST_E2E_NOTE_BANK' });
    await closeDB();
  });

  test('Kiểm thử CRUD Sổ quỹ tiền mặt', async ({ page }) => {
    await page.goto('/accounting/cash');
    await page.waitForLoadState('networkidle');

    // Mở trang thêm mới
    await page.getByRole('button', { name: 'Thêm phiếu thu/chi' }).click();
    await expect(page).toHaveURL(/\/accounting\/cash\/create/);
    await page.waitForLoadState('networkidle');

    // Điền form
    // Amount is a placeholder "Số tiền (*)"
    await page.getByPlaceholder('Số tiền (*)').fill('500000');
    // Note is a placeholder "Ghi chú"
    await page.getByPlaceholder('Ghi chú').fill('TEST_E2E_NOTE_CASH');
    
    // Save
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    
    // Đợi chuyển về list
    await expect(page).toHaveURL(/\/accounting\/cash/);
    await page.waitForLoadState('networkidle');

    // Kiểm tra trong bảng có "TEST_E2E_NOTE_CASH"
    const row = page.locator('table.data-table tbody tr').filter({ hasText: 'TEST_E2E_NOTE_CASH' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('500.000');
  });

  test('Kiểm thử CRUD Tiền gửi ngân hàng', async ({ page }) => {
    await page.goto('/accounting/bank');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: 'Thêm báo có/nộp tiền' });
    await createBtn.click();
    await expect(page).toHaveURL(/\/accounting\/bank\/create/);
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Số tiền (*)').fill('1000000');
    await page.getByPlaceholder('Ghi chú').fill('TEST_E2E_NOTE_BANK');

    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    
    await expect(page).toHaveURL(/\/accounting\/bank/);
    await page.waitForLoadState('networkidle');

    const row = page.locator('table.data-table tbody tr').filter({ hasText: 'TEST_E2E_NOTE_BANK' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('1.000.000');
  });

  test('Kiểm thử Tổng hợp thu chi', async ({ page }) => {
    await page.goto('/accounting/summary');
    await page.waitForLoadState('networkidle');
    const table = page.locator('table.data-table');
    await expect(table).toBeVisible();
  });
});

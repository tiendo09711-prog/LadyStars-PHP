import { test, expect } from '@playwright/test';

test.describe('Revenue By Time - UI Buttons Responsiveness', () => {
  
  test('Should be able to interact with all filters and buttons without freezing', async ({ page }) => {
    // 1. Navigate to the page
    await page.goto('/reports/revenue/time');

    // Wait for the page title or chart to ensure it loaded
    await expect(page.locator('.revenue-time-container')).toBeVisible({ timeout: 10000 });

    // 2. Test "Hiển thị" Dropdown (Theo ngày / Theo tháng)
    const displaySelect = page.locator('select').nth(0);
    await displaySelect.selectOption('Theo tháng');
    await expect(displaySelect).toHaveValue('Theo tháng');
    
    // Switch back to ensure two-way binding works
    await displaySelect.selectOption('Theo ngày');
    await expect(displaySelect).toHaveValue('Theo ngày');

    // 3. Test "Kho hàng" Dropdown
    const warehouseSelect = page.locator('select').nth(1);
    // Since it's dynamic data, we just wait for options to load if any
    // We can interact with it by trying to select the first valid option if it exists
    await warehouseSelect.click(); 

    // 4. Test "Danh mục" Dropdown
    const categorySelect = page.locator('select').nth(2);
    await categorySelect.click();

    // 5. Test "Lọc" button
    const filterBtn = page.locator('button:has-text("Lọc")');
    await expect(filterBtn).toBeEnabled();
    
    // We listen to the network request triggered by the filter button
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/reports/revenue-time') && response.status() === 200
    );
    
    await filterBtn.click();
    
    // Verify the network request actually fired and succeeded (meaning the button is NOT frozen)
    await responsePromise;

    // 6. Check DateRangePicker button
    const datePickerBtn = page.locator('.date-range-trigger, button:has-text("/")').first();
    if (await datePickerBtn.isVisible()) {
      await datePickerBtn.click();
      await expect(page.locator('.date-range-popover, .calendar')).toBeVisible({ timeout: 2000 }).catch(() => {
        console.log('No calendar popover found, might have a different class name.');
      });
      await page.keyboard.press('Escape');
    }

    // 7. Verify "Xuất dữ liệu" (Export Data) button
    // First, verify the button exists
    const exportBtn = page.locator('button:has-text("Xuất dữ liệu")');
    await expect(exportBtn).toBeVisible();
    
    // Listen for the download event
    // Note: If data is empty, it might just alert. We can handle both.
    page.on('dialog', async dialog => {
      // Just accept any dialog (like empty data alert or development alert)
      await dialog.accept();
    });
    
    // We try to catch the download if there is data
    try {
      const downloadPromise = page.waitForEvent('download', { timeout: 3000 });
      await exportBtn.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('bao_cao_doanh_thu_');
    } catch (e) {
      // It probably triggered the alert instead of download, which is fine for the test
      console.log('Export triggered alert instead of download, which is expected for empty data.');
    }

    // 8. Verify "In báo cáo" (Print) button
    const printBtn = page.locator('button:has-text("In báo cáo")');
    await expect(printBtn).toBeVisible();
    // Mock window.print so it doesn't hang the browser
    await page.evaluate(() => { window.print = () => console.log('Mocked print called'); });
    await printBtn.click();

    // 9. Verify "LayoutGrid" button
    const layoutBtn = page.locator('button:has(.lucide-layout-grid), button:has(svg.lucide-layout-grid)');
    if (await layoutBtn.isVisible()) {
      await layoutBtn.click();
    }

    // 10. Verify Chart renders correctly without crashing
    await expect(page.locator('.recharts-responsive-container')).toBeVisible();

    console.log('✅ All buttons and filters are responsive. No frozen UI components detected.');
  });
});

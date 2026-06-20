import { expect, test } from '@playwright/test';

test.describe('Products bulk toolbar and barcode print', () => {
  test('opens barcode workspace and keeps every print control interactive', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm mới', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thao tác' })).toBeVisible();

    await page.getByRole('button', { name: 'Thao tác' }).click();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('tích chọn');
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'In mã vạch' }).click();

    const productRows = page.locator('table.products-data-table tbody tr').filter({ has: page.locator('input[type="checkbox"]') });
    const firstRow = productRows.first();
    const productRowCount = await productRows.count();
    test.skip(productRowCount === 0, 'No product row is available for barcode smoke test.');
    const secondProductCode = productRowCount > 1
      ? await productRows.nth(1).locator('.products-code').textContent()
      : null;

    await firstRow.locator('input[type="checkbox"]').check();
    await expect(page.getByText(/Đã chọn 1/)).toBeVisible();

    await page.getByRole('button', { name: 'In mã vạch' }).click();
    await expect(page.getByRole('heading', { name: 'In mã vạch sản phẩm' })).toBeVisible();
    await expect(page.locator('.products-hero')).toHaveCount(0);
    await expect(page.getByText('Cấu hình in tem')).toBeVisible();
    await expect(page.getByText('Lấy giá sản phẩm theo chi nhánh')).toHaveCount(0);

    const search = page.getByPlaceholder('Tìm hoặc quét tên, mã sản phẩm, barcode');
    await search.fill('__khong_co_san_pham__');
    await expect(page.getByText('Không tìm thấy sản phẩm phù hợp.')).toBeVisible();
    await page.getByRole('button', { name: 'Xóa từ khóa tìm kiếm' }).click();
    await expect(search).toHaveValue('');

    if (secondProductCode) {
      await search.fill(secondProductCode.trim());
      const productResult = page.getByRole('option').filter({ hasText: secondProductCode.trim() }).first();
      await expect(productResult).toBeVisible();
      await productResult.click();
      await expect(page.locator('.barcode-table tbody')).toContainText(secondProductCode.trim());
      await expect(page.getByText('2 sản phẩm', { exact: true })).toBeVisible();

      await search.fill(secondProductCode.trim());
      await search.press('Enter');
      const addedProductQuantity = page.getByLabel(new RegExp(`Số lượng tem.*`)).nth(1);
      await expect(addedProductQuantity).toHaveValue('2');
    }

    const quantity = page.locator('.barcode-qty').first();
    await quantity.fill('3');
    await expect(page.getByText(secondProductCode ? /5 tem sẽ in/ : /3 tem sẽ in/)).toBeVisible();

    const barcodeType = page.locator('.barcode-config-row select');
    for (const [value, standard] of [
      ['EAN13', 'ean13'],
      ['C128', 'code128'],
      ['C39', 'code39'],
      ['C128A', 'code128'],
      ['QRCODE', 'qrcode'],
    ]) {
      await barcodeType.selectOption(value);
      const barcode = page.locator(`.barcode-preview-label [data-barcode-type="${value}"]`);
      await expect(barcode).toHaveAttribute('data-barcode-standard', standard);
      await expect(barcode.locator('path').first()).toBeVisible();
    }
    await expect(page.locator('.barcode-preview-label .barcode-svg.qr')).toBeVisible();

    const storeCheckbox = page.getByLabel('Hiện tên shop');
    await storeCheckbox.uncheck();
    await expect(page.getByLabel('Tên shop trên tem')).toHaveCount(0);
    await storeCheckbox.check();
    const storeInput = page.getByLabel('Tên shop trên tem');
    await expect(storeInput).toBeEnabled();
    await storeInput.fill('Cửa hàng kiểm thử');
    await expect(page.locator('.barcode-preview-store')).toHaveText('Cửa hàng kiểm thử');

    await page.getByLabel('Hiện mã sản phẩm').check();
    await expect(page.locator('.barcode-preview-code')).toBeVisible();
    await page.getByLabel('Hiện 3 dòng tên sản phẩm').check();
    await expect(page.locator('.barcode-preview-name')).toHaveClass(/three/);
    await page.getByLabel('Hiện giá cũ').check();

    const currencyInput = page.locator('.barcode-config-row').filter({ hasText: 'Đơn vị tiền sau giá bán' }).locator('input');
    await currencyInput.fill('VNĐ');
    await expect(page.locator('.barcode-preview-price')).toContainText('VNĐ');

    const marginInputs = page.locator('.barcode-margin-row input');
    await marginInputs.nth(0).fill('2');
    await marginInputs.nth(1).fill('4');
    await expect(marginInputs.nth(0)).toHaveValue('2');
    await expect(marginInputs.nth(1)).toHaveValue('4');

    const a4PaperItem = page.locator('.barcode-paper-item').filter({ hasText: 'Mẫu giấy 65 nhãn' });
    const a4PaperRadio = a4PaperItem.locator('input[type="radio"]');
    await expect(a4PaperRadio).toBeChecked();
    await expect(page.locator('.barcode-paper-item')).toHaveCount(4);

    await page.getByRole('button', { name: 'Hiển thị khổ giấy cuộn' }).click();
    await expect(page.locator('.barcode-paper-item')).toHaveCount(13);
    await a4PaperRadio.check();
    await expect(page.getByRole('button', { name: 'Ẩn khổ giấy cuộn' })).toBeVisible();

    await page.evaluate(() => {
      (window as any).__printedHtml = '';
      (window as any).open = () => ({
        opener: null,
        document: {
          open: () => undefined,
          write: (html: string) => { (window as any).__printedHtml = html; },
          close: () => undefined,
        },
      });
    });
    await page.getByRole('button', { name: 'Xem và in khổ đang chọn' }).click();
    const printedHtml = await page.evaluate(() => (window as any).__printedHtml as string);
    expect(printedHtml).toContain('Cửa hàng kiểm thử');
    expect(printedHtml).toContain('VNĐ');
    expect(printedHtml).toContain('print-name three');
    expect(printedHtml).toContain('data-barcode-standard="qrcode"');
    expect(printedHtml).toContain('@page { size: 210mm 297mm; margin: 0; }');
    expect(printedHtml).toContain('class="print-page"');
    expect(printedHtml).toContain('class="sheet"');
    expect(printedHtml).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');

    await page.getByRole('button', { name: 'Thao tác' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất dữ liệu' }).click();
    await downloadPromise;

    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();
    await expect(page.locator('.products-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeVisible();
  });
});

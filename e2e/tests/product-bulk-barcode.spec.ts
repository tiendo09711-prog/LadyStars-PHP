import { expect, test } from '@playwright/test';

const products = [
  {
    _id: 'barcode-safe-1',
    code: 'SP-EAN13-TEST',
    name: 'Sản phẩm EAN13 kiểm thử in barcode',
    barcode: '2000214256895',
    price: 125000,
    oldPrice: 150000,
    qty: 10,
    status: 'Mới',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'barcode-safe-2',
    code: 'SP-CODE128-TEST',
    name: 'Sản phẩm Code128 kiểm thử',
    barcode: 'LS-CODE128-ABC-001',
    price: 99000,
    qty: 5,
    status: 'Mới',
    createdAt: new Date().toISOString(),
  },
];

async function mockProducts(page: any) {
  await page.route('**/api/settings/store', async (route: any) => route.fulfill({ json: { shopName: 'Cửa hàng kiểm thử' } }));
  await page.route('**/api/products/products**', async (route: any) => {
    const url = new URL(route.request().url());
    const query = `${url.searchParams.get('q') || ''} ${url.searchParams.get('code') || ''} ${url.searchParams.get('barcode') || ''}`.trim().toLowerCase();
    const filtered = query
      ? products.filter((product) => [product.code, product.name, product.barcode].some((value) => String(value).toLowerCase().includes(query)))
      : products;
    await route.fulfill({ json: { items: filtered, total: filtered.length, page: 1, limit: 15 } });
  });
}

async function installPrintMock(page: any) {
  await page.evaluate(() => {
    const log: string[] = [];
    (window as any).__printLog = log;
    (window as any).__printCount = 0;
    (window as any).__printedHtml = '';
    (window as any).open = () => ({
      opener: null,
      document: {
        open: () => { log.push('open'); },
        write: (html: string) => { (window as any).__printedHtml = html; log.push('write'); },
        close: () => { log.push('close'); },
        readyState: 'complete',
        querySelectorAll: () => {
          const html = (window as any).__printedHtml as string;
          return new Array((html.match(/<svg/g) || []).length);
        },
      },
      requestAnimationFrame: (callback: () => void) => callback(),
      focus: () => { log.push('focus'); },
      print: () => { (window as any).__printCount += 1; log.push('print'); },
      close: () => { log.push('windowclose'); },
      addEventListener: () => undefined,
    });
  });
}

async function openBarcodeWorkspace(page: any) {
  await mockProducts(page);
  await page.goto('/products');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('tab', { name: 'Sản phẩm' })).toBeVisible();
  await page.locator('table.products-data-table tbody tr').filter({ hasText: 'SP-EAN13-TEST' }).locator('input[type="checkbox"]').check();
  await page.locator('.products-bulk-menu .products-dropdown-button').click();
  await page.getByRole('button', { name: 'In mã vạch' }).click();
  await expect(page.getByRole('heading', { name: 'In mã vạch sản phẩm' })).toBeVisible();
}

test.describe('Products bulk barcode print safety', () => {
  test('Auto mode, migration, SVG, template list, print HTML, A4 pagination, density guard and workspace regression', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('barcodePrintSettings', JSON.stringify({
        barcodeType: 'C39',
        paperId: 'a4-65',
        showStore: true,
        storeName: 'Shop lưu cũ',
        showCode: false,
        showName: true,
        showPrice: true,
        currencySuffix: 'VNĐ',
        marginLeft: 2,
        marginTop: 4,
        recentPaperIds: ['a4-65', 'roll-50x30-1'],
      }));
    });

    await openBarcodeWorkspace(page);

    const barcodeType = page.locator('.barcode-config-row').filter({ hasText: 'Loại mã' }).locator('select');
    await expect(barcodeType).toHaveValue('AUTO');
    const savedSettings = await page.evaluate(() => JSON.parse(window.localStorage.getItem('barcodePrintSettings') || '{}'));
    expect(savedSettings.barcodeType).toBe('AUTO');
    expect(savedSettings.paperId).toBe('a4-65');
    expect(savedSettings.storeName).toBe('Shop lưu cũ');
    expect(savedSettings.marginLeft).toBe(2);
    expect(savedSettings.marginTop).toBe(4);

    await expect(page.locator('.barcode-standard-note')).toContainText('Chuẩn in thực tế: EAN-13');
    const previewSvg = page.locator('.barcode-preview-label svg.barcode-svg');
    await expect(previewSvg).toHaveAttribute('data-barcode-type', 'EAN13');
    await expect(previewSvg).toHaveAttribute('data-barcode-requested-type', 'AUTO');
    await expect(previewSvg).toHaveAttribute('data-barcode-standard', 'ean13');
    await expect(previewSvg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    await expect(previewSvg).toHaveAttribute('data-barcode-natural-width', /\d+/);
    await expect(previewSvg).not.toHaveAttribute('transform', /.+/);
    await expect(previewSvg).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const previewBoxOverflow = await page.locator('.barcode-preview-label').evaluate((el: HTMLElement) => getComputedStyle(el).overflow);
    expect(previewBoxOverflow).not.toBe('hidden');

    await barcodeType.selectOption('C128A');
    await expect(page.locator('.barcode-preview-label svg.barcode-svg')).toHaveAttribute('data-barcode-type', 'C128A');
    await expect(page.locator('.barcode-preview-label svg.barcode-svg')).toHaveAttribute('data-barcode-standard', 'code128a');
    await barcodeType.selectOption('AUTO');

    await page.getByRole('button', { name: 'Hiển thị tất cả 14 khổ giấy' }).click();
    await expect(page.locator('.barcode-paper-item')).toHaveCount(14);
    const templateTexts = await page.locator('.barcode-paper-item label span').allTextContents();
    expect(new Set(templateTexts).size).toBe(14);
    await expect(page.locator('.barcode-paper-item').filter({ hasText: 'Mỗi nhãn 70x22mm.' })).toHaveCount(1);

    const search = page.getByPlaceholder('Tìm hoặc quét tên, mã sản phẩm, barcode');
    await search.fill('SP-CODE128-TEST');
    await page.getByRole('option').filter({ hasText: 'SP-CODE128-TEST' }).click();
    await expect(page.locator('.barcode-table tbody')).toContainText('SP-CODE128-TEST');
    const qty = page.locator('.barcode-qty').first();
    await qty.fill('66');
    await expect(page.getByText(/67 tem sẽ in/)).toBeVisible();
    await page.locator('.barcode-table tbody tr').filter({ hasText: 'SP-CODE128-TEST' }).getByRole('button', { name: /Xóa/ }).click();
    await expect(page.locator('.barcode-table tbody')).not.toContainText('SP-CODE128-TEST');
    await qty.fill('66');

    await page.getByLabel('Hiện mã sản phẩm').check();
    await page.getByLabel('Hiện 3 dòng tên sản phẩm').check();
    await expect(page.locator('.barcode-preview-name')).toHaveClass(/three/);
    await page.getByLabel('Hiện giá cũ').check();
    await page.getByLabel('Hiện tên shop').uncheck();
    await page.getByLabel('Hiện mã sản phẩm').uncheck();
    await page.getByLabel('Hiện tên sản phẩm').uncheck();
    await page.getByLabel('Hiện giá sản phẩm').uncheck();
    await page.getByLabel('Hiện giá cũ').uncheck();
    await expect(page.locator('.barcode-print-guide')).toContainText('Scale = 100% / Actual size');

    await installPrintMock(page);
    await page.getByRole('button', { name: 'Xem và in khổ đang chọn' }).click();
    const printResult = await page.evaluate(() => ({
      html: (window as any).__printedHtml as string,
      log: (window as any).__printLog as string[],
      printCount: (window as any).__printCount as number,
    }));
    expect(printResult.printCount).toBe(1);
    expect(printResult.html).toContain('@page { size: 210mm 297mm; margin: 0; }');
    expect(printResult.html).toContain('grid-template-columns: repeat(5, 38.1mm)');
    expect(printResult.html).toContain('data-barcode-type="EAN13"');
    expect(printResult.html).toContain('data-barcode-requested-type="AUTO"');
    expect(printResult.html).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(printResult.html).toContain('data-module-width-mm="');
    expect(printResult.html).toContain('data-page-index="2"');
    expect(printResult.html).not.toContain('width: 100%; height: 100%');
    expect(printResult.html).not.toMatch(/transform:\s*scale|zoom\s*:/);
    expect(printResult.html).toContain('overflow: visible');
    expect((printResult.html.match(/class="print-label"/g) || []).length).toBe(66);
    expect((printResult.html.match(/class="print-page"/g) || []).length).toBe(2);

    if (await page.getByRole('button', { name: 'Hiển thị tất cả 14 khổ giấy' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Hiển thị tất cả 14 khổ giấy' }).click();
    }
    await page.getByText('Mẫu giấy 180 nhãn').click();
    await page.evaluate(() => { (window as any).__printedHtml = ''; (window as any).__printCount = 0; });
    await page.getByRole('button', { name: 'Xem và in khổ đang chọn' }).click();
    const afterUnsafeAllowed = await page.evaluate(() => ({ html: (window as any).__printedHtml, printCount: (window as any).__printCount }));
    expect(afterUnsafeAllowed.printCount).toBe(1);
    expect(afterUnsafeAllowed.html).toContain('@page { size: 210mm 297mm; margin: 0; }');

    await page.locator('.products-bulk-menu .products-dropdown-button').click();
    await expect(page.getByRole('button', { name: 'Xuất dữ liệu' })).toBeVisible();
    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();
    await expect(page.getByRole('tab', { name: 'Sản phẩm' })).toBeVisible();
  });
});

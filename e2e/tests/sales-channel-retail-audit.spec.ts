import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000/api';

async function authHeaders(page: any) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Retail invoice ACT audit', () => {
  test('loads real invoices, filters on the server and opens complete invoice detail', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const listResponse = page.waitForResponse(
      (response) => response.url().includes('/api/products/sales?') && response.status() === 200,
    );
    await page.goto('/sales-channels/store/retail');
    await listResponse;

    await expect(page.getByRole('tab', { name: 'Tất cả' })).toBeVisible();
    await expect(page.getByText('Xác nhận thanh toán')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Thêm hóa đơn lẻ/i })).toBeVisible();
    await expect(page.locator('.retail-table-card')).toBeVisible();
    await expect(page.getByText(/Không tải được dữ liệu/i)).toHaveCount(0);

    const firstInvoiceLink = page.locator('.retail-invoice-link').first();
    await expect(firstInvoiceLink).toBeVisible();
    const invoiceCode = (await firstInvoiceLink.textContent())?.trim() || '';

    const filterResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/products/sales')
        && url.searchParams.get('invoiceCode') === invoiceCode
        && response.status() === 200;
    });
    await page.getByPlaceholder('Nhập mã hóa đơn').fill(invoiceCode);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await filterResponse;
    await expect(page.locator('.retail-invoice-link').first()).toHaveText(invoiceCode);

    const detailResponse = page.waitForResponse(
      (response) => /\/api\/products\/sales\/[a-f0-9]{24}$/i.test(new URL(response.url()).pathname) && response.status() === 200,
    );
    await page.locator('.retail-invoice-link').first().click();
    await detailResponse;
    await expect(page.getByRole('dialog', { name: invoiceCode })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Sản phẩm/ })).toBeVisible();
    await expect(page.locator('.retail-detail-table tbody tr').first()).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).last().click();

    await page.setViewportSize({ width: 768, height: 900 });
    const keepsHorizontalTableScroll = await page.locator('.retail-table-scroll').evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    expect(keepsHorizontalTableScroll).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(consoleErrors).toEqual([]);
  });

  test('supports every real list filter and resets pagination to page 1', async ({ page }) => {
    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);

    const headers = await authHeaders(page);
    const seedResponse = await page.request.get(`${API}/products/sales?page=1&limit=50`, { headers });
    expect(seedResponse.ok()).toBeTruthy();
    const seedData = await seedResponse.json();
    const invoice = seedData.items.find((item: any) => item.customerId?.phone && item.items?.[0]?.productId?.name && item.branchId?._id)
      || seedData.items.find((item: any) => item.customerId?.phone && item.items?.[0]?.productId?.name)
      || seedData.items[0];
    expect(invoice).toBeTruthy();

    const cases = [
      { placeholder: 'Nhập mã hóa đơn', param: 'invoiceCode', value: invoice.code },
      { placeholder: 'Tên hoặc số điện thoại', param: 'customerKeyword', value: invoice.customerId?.phone || invoice.customerId?.name },
      { placeholder: 'Mã hoặc tên sản phẩm', param: 'productKeyword', value: invoice.items?.[0]?.productId?.code || invoice.items?.[0]?.productId?.name },
    ].filter((item) => item.value);

    for (const filterCase of cases) {
      await page.getByRole('button', { name: 'Đặt lại' }).click();
      const responsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/products/sales')
          && url.searchParams.get(filterCase.param) === String(filterCase.value)
          && url.searchParams.get('page') === '1';
      });
      await page.getByPlaceholder(filterCase.placeholder).fill(String(filterCase.value));
      await page.getByRole('button', { name: /^Lọc$/ }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
    }

    if (invoice.branchId?._id) {
      await page.getByRole('button', { name: 'Đặt lại' }).click();
      const storeResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/products/sales')
          && url.searchParams.get('storeId') === invoice.branchId._id
          && url.searchParams.get('page') === '1';
      });
      await page.getByLabel('Cửa hàng').selectOption(invoice.branchId._id);
      await page.getByRole('button', { name: /^Lọc$/ }).click();
      expect((await storeResponse).status()).toBe(200);
    }

    const createdDate = new Date(invoice.createdAt).toISOString().slice(0, 10);
    await page.getByRole('button', { name: 'Đặt lại' }).click();
    const dateResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/products/sales')
        && url.searchParams.get('dateFrom') === createdDate
        && url.searchParams.get('dateTo') === createdDate
        && url.searchParams.get('page') === '1';
    });
    await page.getByLabel('Từ ngày').fill(createdDate);
    await page.getByLabel('Đến ngày').fill(createdDate);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    expect((await dateResponse).status()).toBe(200);
  });

  test('creates a real multi-product, multi-payment invoice and restores every stock on cancel', async ({ page }) => {
    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);
    const headers = await authHeaders(page);

    const customersResponse = await page.request.get(`${API}/customers/customers?limit=20`, { headers });
    expect(customersResponse.ok()).toBeTruthy();
    const customers = (await customersResponse.json()).items || [];
    const customer = customers.find((item: any) => item.name);
    expect(customer).toBeTruthy();

    await page.getByRole('button', { name: /Thêm hóa đơn lẻ/i }).click();
    await expect(page.getByRole('dialog', { name: 'Chọn kho hàng' })).toBeVisible();
    await page.getByRole('button', { name: /^Chọn$/ }).click();
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail\/create\?branchId=/);

    const branchId = new URL(page.url()).searchParams.get('branchId');
    const productsResponse = await page.request.get(`${API}/products/inventories?branchId=${branchId}&limit=5000`, { headers });
    expect(productsResponse.ok()).toBeTruthy();
    const products = (await productsResponse.json()).items || [];
    const selectedProducts = products.filter((item: any) => Number(item.selectedStock) > 0 && item.code).slice(0, 2);
    expect(selectedProducts).toHaveLength(2);
    const stockBefore = new Map(selectedProducts.map((product: any) => [product._id, Number(product.selectedStock)]));

    await page.getByPlaceholder('Nhập họ tên hoặc số điện thoại').fill(customer.name);
    const customerSuggestion = page.locator('.customer-search .create-dropdown button').filter({ hasText: customer.name }).first();
    if (await customerSuggestion.isVisible().catch(() => false)) await customerSuggestion.click();

    for (const product of selectedProducts) {
      await page.getByPlaceholder('Tìm theo mã, barcode hoặc tên sản phẩm...').fill(product.code);
      await page.locator('.product-results button').filter({ hasText: product.code }).first().click();
    }
    await expect(page.locator('.create-table-scroll tbody tr')).toHaveCount(2);

    const paymentInputs = page.getByLabel('Số tiền thanh toán');
    const totalAmount = Number(await paymentInputs.first().inputValue());
    const firstPayment = Math.floor(totalAmount / 2);
    await paymentInputs.first().fill(String(firstPayment));
    await page.getByRole('button', { name: 'Thêm phương thức' }).click();
    await expect(paymentInputs).toHaveCount(2);
    expect(Number(await paymentInputs.nth(1).inputValue())).toBe(totalAmount - firstPayment);

    const createResponsePromise = page.waitForResponse(
      (response) => response.url() === `${API}/products/sales` && response.request().method() === 'POST',
    );
    const completeResponsePromise = page.waitForResponse(
      (response) => /\/api\/products\/sales\/[a-f0-9]{24}\/complete$/i.test(response.url()) && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Xác nhận & Lưu', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const completeResponse = await completeResponsePromise;
    expect(completeResponse.ok()).toBeTruthy();
    const completed = await completeResponse.json();
    expect(completed.items).toHaveLength(2);
    expect(completed.typePayment).toHaveLength(2);
    expect(completed.typePayment.reduce((sum: number, line: any) => sum + Number(line.amount), 0)).toBe(Number(completed.valuePayment));
    expect(Number(completed.valuePayment)).toBe(Number(completed.value));

    for (const product of selectedProducts) {
      const stockResponse = await page.request.get(`${API}/products/products/${product._id}/stocks`, { headers });
      expect(stockResponse.ok()).toBeTruthy();
      const stockPayload = await stockResponse.json();
      const branchStock = (stockPayload.items || []).find((item: any) => item.warehouseId === branchId);
      expect(Number(branchStock?.quantity ?? 0)).toBe(stockBefore.get(product._id) - 1);
    }

    await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/, { timeout: 10000 });
    await page.getByPlaceholder('Nhập mã hóa đơn').fill(created.code);
    const refreshed = page.waitForResponse((response) => response.url().includes(`invoiceCode=${created.code}`) && response.status() === 200);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await refreshed;
    await expect(page.locator('.retail-invoice-link')).toHaveText(created.code);

    const cancelResponse = await page.request.post(`${API}/products/sales/${created._id}/cancel`, { headers });
    expect(cancelResponse.ok()).toBeTruthy();
    const afterCancelResponse = await page.request.get(`${API}/products/inventories?branchId=${branchId}&limit=5000`, { headers });
    const afterCancelItems = (await afterCancelResponse.json()).items || [];
    for (const product of selectedProducts) {
      expect(Number(afterCancelItems.find((item: any) => item._id === product._id)?.selectedStock)).toBe(stockBefore.get(product._id));
    }
  });

  test('keeps real row actions and redirects retired payment-confirmation URLs', async ({ page }) => {
    for (const oldUrl of [
      '/sales-channels/store/retail/confirm',
      '/sales-channels/store/retail/payment-confirmation',
      '/sales-channels/store/retail?tab=confirm',
    ]) {
      await page.goto(oldUrl);
      await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/);
      await expect(page.getByText('Xác nhận thanh toán')).toHaveCount(0);
    }

    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);
    const headers = await authHeaders(page);
    const listResponse = await page.request.get(`${API}/products/sales?page=1&limit=50&channel=store`, { headers });
    expect(listResponse.ok()).toBeTruthy();
    const listData = await listResponse.json();
    const editableInvoice = (listData.items || []).find((item: any) => item.canEdit === true && item.status === 'completed');
    test.skip(!editableInvoice, 'No editable completed retail invoice available');
    const firstRow = page.locator('.retail-table-card tbody tr').filter({
      has: page.getByRole('button', { name: editableInvoice.code, exact: true }),
    }).first();
    await firstRow.getByRole('button', { name: /Thao tác hóa đơn/ }).click();
    await expect(page.getByRole('button', { name: 'Xem chi tiết' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In hóa đơn', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sửa đơn hàng' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đổi trả hàng' })).toBeVisible();

    await page.getByRole('button', { name: 'Sửa đơn hàng' }).click();
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail\/create\?editId=/);

    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);
    const refundableInvoice = (listData.items || []).find((item: any) => item.canRefund === true);
    test.skip(!refundableInvoice, 'No refundable retail invoice available');
    const completedRow = page.locator('.retail-table-card tbody tr').filter({
      has: page.getByRole('button', { name: refundableInvoice.code, exact: true }),
    }).first();
    await completedRow.getByRole('button', { name: /Thao tác hóa đơn/ }).click();
    await page.getByRole('button', { name: 'Đổi trả hàng' }).click();
    await expect(page).toHaveURL(/\/sales-channels\/store\/refund\/create\?saleId=/);
  });
});

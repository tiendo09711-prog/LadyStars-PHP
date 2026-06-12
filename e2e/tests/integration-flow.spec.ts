import { test, expect, Page } from '@playwright/test';
import { cleanupTestData } from '../utils/db';

test.describe.serial('E2E Integration Flow - LadyStars 6 Modules', () => {
  let page: Page;
  const UNIQUE_ID = Date.now().toString().slice(-6);
  const PRODUCT_CODE = `P${UNIQUE_ID}`;
  const CATEGORY_NAME = `Cat-${UNIQUE_ID}`;
  const CUSTOMER_CODE = `C${UNIQUE_ID}`;
  const CUSTOMER_PHONE = `09${Math.floor(Math.random() * 100000000)}`;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // 1. Authentication
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@gmail.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:5173/');
  });

  test.afterAll(async () => {
    // Dọn dẹp dữ liệu
    await cleanupTestData(PRODUCT_CODE);
    await page.close();
  });

  test('Module 1: Cụm SẢN PHẨM (Products & Categories)', async () => {
    test.setTimeout(120000);
    await page.goto('http://localhost:5173/products');
    await page.waitForTimeout(2000);

    // Click qua các tab của ProductMainPage
    const tabs = ['Sản phẩm', 'Tồn kho', 'Danh mục', 'Lịch sử sửa/xóa'];
    for (const tab of tabs) {
      await page.locator('.workspace-tabs button', { hasText: tab }).click();
      await page.waitForTimeout(500);
    }

    // Quay lại tab Danh mục
    await page.locator('.workspace-tabs button', { hasText: 'Danh mục' }).click();
    await page.waitForTimeout(1000);

    // Quay lại tab Sản phẩm để tạo sản phẩm
    await page.locator('.workspace-tabs button', { hasText: 'Sản phẩm' }).click();
    await page.waitForTimeout(1000);

    // Tạo sản phẩm mới
    await page.click('button:has-text("Thêm sản phẩm")');
    await expect(page.locator('h2', { hasText: 'Thêm sản phẩm' })).toBeVisible();

    // Điền form Sản phẩm
    const modal = page.locator('.modal-card');
    await modal.locator('span:text-is("Mã sản phẩm *") + input').fill(PRODUCT_CODE);
    await modal.locator('span:text-is("Tên sản phẩm *") + input').fill(`Sản phẩm E2E ${UNIQUE_ID}`);
    await modal.locator('span:text-is("Giá vốn") + input').fill('150000');
    await modal.locator('span:text-is("Giá bán") + input').fill('350000');
    await modal.locator('span:text-is("Trạng thái") + select').selectOption({ label: 'Mới' });
    
    // Lưu sản phẩm
    await modal.locator('button:has-text("Tạo sản phẩm")').click();
    await page.waitForTimeout(2000);
    
    // Tìm lại sản phẩm để xác nhận
    await page.fill('input[placeholder*="Tên SP, mã, barcode"]', PRODUCT_CODE);
    await page.click('button:has-text("Tìm kiếm")');
    await page.waitForTimeout(1500);
    await expect(page.locator(`text=${PRODUCT_CODE}`).first()).toBeVisible();
  });

  test('Module 2: Cụm KHO HÀNG (Warehouse)', async () => {
    test.setTimeout(120000);
    await page.goto('http://localhost:5173/warehouse/transactions');
    await page.waitForTimeout(2000);

    // TabbedModulePage: chuyển tab
    await page.locator('.workspace-tabs button', { hasText: 'Sản phẩm xuất nhập kho' }).click();
    await page.waitForTimeout(1000);
    await page.locator('.workspace-tabs button', { hasText: 'Phiếu xuất nhập kho' }).click();
    await page.waitForTimeout(1000);

    // Click Nút Tạo phiếu XNK -> Nhập kho
    await page.goto('http://localhost:5173/warehouse/transactions/vouchers/import');
    await page.waitForTimeout(2000);

    // Test form Nhập kho
    await page.locator('select').first().selectOption({ label: 'Chi nhánh trung tâm' });
    
    // F3 Search box (nhập mã SP vừa tạo)
    await page.fill('#product-f3-search', PRODUCT_CODE);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);

    // Bật cấu hình cột hiển thị
    await page.click('button[title="Ẩn/Hiện cột"]');
    await page.waitForTimeout(500);
    await page.click('label:has-text("Số tồn")'); // Test tương tác tắt/mở cột
    await page.click('button[title="Ẩn/Hiện cột"]'); // Đóng menu dropdown

    // Thay đổi số lượng nhập của dòng đầu tiên
    await page.locator('input[type="number"]').nth(0).fill('50'); // Số lượng
    await page.locator('input[type="number"]').nth(1).fill('150000'); // Giá

    // Test checkbox
    await page.click('text="Hiện ô nhập ghi chú cho tất cả sản phẩm"');
    await page.waitForTimeout(500);

    // Nhập ghi chú
    await page.fill('textarea[placeholder*="ghi chú cho toàn bộ phiếu"]', `Phiếu nhập E2E - SP ${PRODUCT_CODE}`);

    // Lưu phiếu
    await page.click('button:has-text("Lưu phiếu nhập"), button:has-text("Lưu & Hoàn tất")');
    await page.waitForTimeout(3000);
  });

  test('Module 3: Cụm KHÁCH HÀNG (Customers)', async () => {
    test.setTimeout(120000);
    await page.goto('http://localhost:5173/customers/list');
    await page.waitForTimeout(2000);

    // Check các sub-tabs
    const tabs = ['Tất cả', 'Mua nhiều', 'Lâu chưa mua'];
    for (const tab of tabs) {
      await page.locator('.workspace-tabs button', { hasText: tab }).first().click();
      await page.waitForTimeout(1000);
    }
    
    // Trở lại tab "Tất cả"
    await page.locator('.workspace-tabs button', { hasText: 'Tất cả' }).first().click();
    await page.waitForTimeout(1000);

    // Bấm nút "Thêm khách hàng"
    await page.click('button:has-text("Thêm khách hàng"), button:has-text("Thêm mới")');
    await page.waitForTimeout(1000);

    // Điền form thêm Khách hàng
    // Tuỳ thuộc UI, có thể là modal hoặc row ngang
    const modal = page.locator('.modal-card, .form-container').last();
    if (await modal.isVisible()) {
      await modal.locator('span:has-text("Mã KH") + input, input[name="code"]').fill(CUSTOMER_CODE);
      await modal.locator('span:has-text("Tên khách hàng") + input, input[name="name"]').fill(`Khách hàng E2E ${UNIQUE_ID}`);
      await modal.locator('span:has-text("Số điện thoại") + input, input[name="phone"]').fill(CUSTOMER_PHONE);
      
      await modal.locator('button:has-text("Lưu"), button:has-text("Xác nhận")').click();
      await page.waitForTimeout(2000);
    }
  });

  test('Module 4: Cụm KÊNH BÁN - CỬA HÀNG (Sales Channels - POS)', async () => {
    test.setTimeout(120000);
    await page.goto('http://localhost:5173/sales-channels/pos/retail/create');
    await page.waitForTimeout(3000); // Chờ POS load sản phẩm và cấu hình

    // Tìm và chọn sản phẩm
    await page.fill('input[placeholder*="Tìm theo mã hoặc tên sản phẩm"]', PRODUCT_CODE);
    await page.waitForTimeout(1500);
    await page.locator('.dropdown-menu > div, [style*="position: absolute"] > div').filter({ hasText: PRODUCT_CODE }).first().click();
    await page.waitForTimeout(1000);

    // Tương tác nút số lượng/giảm giá trên dòng sản phẩm POS (nếu có)
    // Tạm thời để mặc định số lượng 1

    // Tìm và chọn khách hàng
    await page.fill('input[placeholder*="Nhập họ tên khách hàng"]', CUSTOMER_CODE);
    await page.waitForTimeout(1500);
    const customerOption = page.locator('.dropdown-menu > div, [style*="position: absolute"] > div').filter({ hasText: CUSTOMER_CODE });
    if (await customerOption.count() > 0) {
      await customerOption.first().click();
    } else {
      await page.keyboard.press('Escape'); // Đóng dropdown nếu không có (khách hàng mới)
      await page.fill('input[placeholder="Nhập số điện thoại"]', CUSTOMER_PHONE);
    }
    await page.waitForTimeout(1000);

    // Check Ghi chú hóa đơn
    await page.fill('textarea[placeholder*="Ghi chú"], input[placeholder*="Ghi chú"]', 'Đơn hàng bán lẻ test E2E');

    // Nút Lưu hóa đơn (Thay vì Thanh toán)
    await page.click('button:has-text("Lưu hóa đơn")');
    await page.waitForTimeout(3000);
  });

  test('Module 5: Cụm ĐƠN HÀNG (Orders)', async () => {
    test.setTimeout(120000);
    await page.goto('http://localhost:5173/orders/manage');
    await page.waitForTimeout(2000);

    // Click và kiểm tra các trạng thái
    const statusTabs = ['Tất cả', 'Chờ xác nhận', 'Đóng gói', 'Đang giao', 'Thành công'];
    for (const tab of statusTabs) {
      const tabBtn = page.locator('.quick-filter-list button', { hasText: tab });
      if (await tabBtn.count() > 0) {
        await tabBtn.first().click();
        await page.waitForTimeout(800);
      }
    }
    
    // Quay về Tất cả và test nút Đồng bộ
    await page.locator('.quick-filter-list button', { hasText: 'Tất cả' }).first().click();
    const refreshBtn = page.locator('button', { hasText: 'Làm mới' });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Có thể check mã đơn hàng hoặc khách hàng vừa tạo có xuất hiện không
    await page.fill('input[placeholder*="Mã, tên, số điện thoại"]', CUSTOMER_PHONE);
    await page.waitForTimeout(1500);
  });

  test('Module 6: Cụm TỔNG QUAN (Dashboard)', async () => {
    test.setTimeout(120000);
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(3000);

    // Kiểm tra render các widget Tổng quan
    await expect(page.locator('h1').first()).toContainText('Tổng quan');
    
    // Tương tác với bộ lọc thời gian nếu có
    const filterBtn = page.locator('button:has-text("Hôm nay")');
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(500);
      await page.locator('.dv2-date-item', { hasText: 'Tuần này' }).click();
      await page.waitForTimeout(1500);
    }

    // Đảm bảo không có màn hình trắng/crash
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Uncaught TypeError');
  });
});

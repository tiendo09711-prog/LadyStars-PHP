async function runTest() {
    const API_URL = 'http://localhost:4000/api';
    console.log('🚀 Bắt đầu chạy Test Tự động: Tạo Hóa đơn bán lẻ -> Kiểm tra Báo cáo Doanh thu');
    try {
        // 1. Đăng nhập
        console.log('1. Đang đăng nhập với admin@gmail.com...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@gmail.com', password: '123456' })
        });
        if (!loginRes.ok)
            throw new Error(`Đăng nhập thất bại: ${loginRes.statusText}`);
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('   ✅ Đăng nhập thành công! Token:', token.substring(0, 15) + '...');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        // 2. Lấy Doanh thu ban đầu (Hôm nay)
        console.log('2. Đang kiểm tra Doanh thu hiện tại...');
        const today = new Date();
        const fromDate = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const toDate = new Date(today.setHours(23, 59, 59, 999)).toISOString();
        const branchId = '6a05946e67c30b7a39107bcb'; // Kho HCM
        const revenueRes1 = await fetch(`${API_URL}/reports/revenue-time?displayType=Theo%20ngày&fromDate=${fromDate}&toDate=${toDate}&branchId=${branchId}`, { headers });
        const revenueData1 = await revenueRes1.json();
        const d = new Date();
        const todayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const todayData1 = revenueData1.find((item) => item.time === todayStr) || { revenue: 0 };
        const initialRevenue = todayData1.revenue || 0;
        console.log(`   ✅ Doanh thu ban đầu hôm nay (${todayStr}): ${initialRevenue.toLocaleString()} VND`);
        // 3. Tạo 1 Đơn hàng bán lẻ mới
        console.log('3. Đang tạo một Hóa đơn bán lẻ mới trị giá 500,000 VND...');
        const invoicePayload = {
            customerName: 'Khách hàng Test Tự Động',
            productCode: 'TEST_PROD_123',
            productName: 'Sản phẩm Test',
            totalAmount: 500000,
            price: 500000,
            quantity: 1,
            status: 'Thành công',
            branchId: branchId,
            branchName: 'Kho HCM',
            tabs: ['all'],
            metadata: { autoCalculated: false }
        };
        const invoiceRes = await fetch(`${API_URL}/products/retail-invoices`, {
            method: 'POST',
            headers,
            body: JSON.stringify(invoicePayload)
        });
        if (!invoiceRes.ok)
            throw new Error(`Tạo hóa đơn thất bại: ${await invoiceRes.text()}`);
        console.log('   ✅ Đã tạo Hóa đơn bán lẻ thành công!');
        // 4. Lấy Doanh thu sau khi tạo Hóa đơn
        console.log('4. Đang kiểm tra lại Doanh thu báo cáo...');
        const revenueRes2 = await fetch(`${API_URL}/reports/revenue-time?displayType=Theo%20ngày&fromDate=${fromDate}&toDate=${toDate}&branchId=${branchId}`, { headers });
        const revenueData2 = await revenueRes2.json();
        console.log('   [DEBUG] revenueData2:', JSON.stringify(revenueData2, null, 2));
        const todayData2 = revenueData2.find((item) => item.time === todayStr) || { revenue: 0 };
        const finalRevenue = todayData2.revenue || 0;
        console.log(`   ✅ Doanh thu sau khi tạo đơn (${todayStr}): ${finalRevenue.toLocaleString()} VND`);
        // 5. Kiểm tra logic (Assert)
        const expectedRevenue = initialRevenue + 500000;
        if (finalRevenue === expectedRevenue) {
            console.log('\n🎉 KẾT QUẢ TEST: [PASSED]');
            console.log('===========================================================');
            console.log(`Doanh thu đã tăng chính xác 500,000 VND (${initialRevenue} -> ${finalRevenue})!`);
            console.log('Logic Báo Cáo Doanh Thu HOẠT ĐỘNG HOÀN HẢO!');
            console.log('===========================================================');
        }
        else {
            console.log('\n❌ KẾT QUẢ TEST: [FAILED]');
            console.log('===========================================================');
            console.log(`Dự kiến doanh thu phải là: ${expectedRevenue.toLocaleString()} VND`);
            console.log(`Nhưng thực tế lại là: ${finalRevenue.toLocaleString()} VND`);
            console.log('Phát hiện lỗi logic đồng bộ dữ liệu giữa Hóa đơn và Báo cáo!');
            console.log('===========================================================');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\n❌ KẾT QUẢ TEST: [ERROR BẤT NGỜ]');
        console.error('Test script bị crash vì lỗi hệ thống hoặc API:');
        console.error(error.message);
        process.exit(1);
    }
}
runTest();
export {};

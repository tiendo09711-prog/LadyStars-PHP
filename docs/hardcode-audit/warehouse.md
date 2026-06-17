# Hardcode Audit: warehouse

## Routes đã quét

| Route | Component | Inventory done | Testcase done | E2E done | Fix done | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/warehouse/transactions/vouchers/export` | `client/src/modules/warehouse/VoucherExportPage.tsx` | yes | yes | yes | yes | pass |
| `/warehouse/transactions/vouchers/excel` | `client/src/modules/warehouse/VoucherExcelImportPage.tsx` | yes | yes | yes | yes | pass |
| `/warehouse/transfers` | `client/src/modules/warehouse/WarehouseTransferPage.tsx` | yes | yes | yes | yes | pass |
| `/warehouse/transfers/create` | `client/src/modules/warehouse/WarehouseTransferCreatePage.tsx` | yes | yes | yes | yes | pass |

## Phát hiện

| ID | Route | Loại lỗi | Bằng chứng | File sửa | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| warehouse-vouchers-export-001 | `/warehouse/transactions/vouchers/export` | Form state hardcode | Default `supplierCustomer` là "Nhà cung cấp A", Default `warehouse` là "Chi nhánh trung tâm", `options` kho cứng | `client/src/modules/warehouse/VoucherExportPage.tsx` | Đã sửa |
| warehouse-vouchers-excel-001 | `/warehouse/transactions/vouchers/excel` | Dữ liệu mẫu an toàn | Sử dụng `IMPORT_TYPES` cố định do là enum, `sysBranches` được tải từ API chuẩn. Dữ liệu mẫu `xnkRows` trong file `.xlsx` được sử dụng hợp lệ làm template import chứ không phải fake UI data. | Không cần sửa đổi | Hoàn thành |
| warehouse-transfers-001 | `/warehouse/transfers` | Mọi data đều call API | Các tab chuyển param hợp lệ, UI lấy data từ `/api/warehouse/transfers`. | N/A | Hoàn thành |
| warehouse-transfers-create-001 | `/warehouse/transfers/create` | Dữ liệu mảng rác | Mảng `MOCK_PRODUCTS` tồn tại trong code nhưng không được sử dụng. Dữ liệu thực tế được nạp đúng qua API branches và products inventories. Đã xoá bỏ `MOCK_PRODUCTS` để làm sạch file. | `client/src/modules/warehouse/WarehouseTransferCreatePage.tsx` | Đã sửa |

## Test đã chạy

```bash
cd e2e
npx playwright test tests/warehouse-vouchers-export-audit.spec.ts --project=chromium
npx playwright test tests/warehouse-transfers-audit.spec.ts --project=chromium
```

Kết quả: pass

## Còn lại

- Các route khác trong module `warehouse` chưa được quét trong phạm vi task này.

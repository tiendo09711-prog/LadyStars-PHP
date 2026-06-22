# Warehouse Branches UI Function Map

## Route

- Path: `/warehouse/branches`
- Main component: `client/src/modules/warehouse/WarehouseBranchesPage.tsx`
- Related files:
  - `client/src/core/api/branch.api.ts`
  - `client/src/modules/warehouse/warehouseBranchesPage.css`
- Layout/Auth/Permission: route dùng auth/app layout hiện có; thao tác ghi/xóa yêu cầu xác nhận mật khẩu Admin và backend permission như cũ.

## Tổng Quan Trang

- Trang dùng để quản lý cấu hình kho hàng/chi nhánh.
- Khu vực chính: header, tìm kiếm/lọc trạng thái, danh sách kho, form thông tin kho, cấu hình in hóa đơn, vùng hành động an toàn, modal xác nhận Admin.
- Phase 2 chỉ gỡ UI/action đặt kho mặc định khỏi trang này; không đổi backend/database/business rule.

## API Đang Dùng

| Chức năng | Method | Endpoint | File gọi API | Handler | State liên quan | Ghi chú |
| --------- | ------ | -------- | ------------ | ------- | --------------- | ------- |
| Load danh sách kho | GET | `/system/branches` | `branch.api.ts` | `loadBranchesData` | `branches`, `selectedBranchId`, `form` | Giữ nguyên fallback chọn kho hiện có |
| Load chi tiết kho | GET | `/system/branches/:id` | `branch.api.ts` | `loadBranchDetail` | `loadingDetail`, `form`, `branches` | Giữ Phase 1 stale guard/AbortController |
| Load store setting | GET | `/settings/store` | `branch.api.ts` | `loadStoreSetting` | `storeSetting` | Giữ nguyên |
| Tạo kho | POST | `/system/branches` | `branch.api.ts` | `submitAction` action `create` | `form`, `submitting`, `notice`, `error` | Giữ nguyên |
| Cập nhật kho | PATCH | `/system/branches/:id` | `branch.api.ts` | `submitAction` action `save` | `form`, `targetBranchId`, `submitting` | Giữ Phase 1 targetBranchId/phone validation |
| Activate kho | POST | `/system/branches/:id/activate` | `branch.api.ts` | `submitAction` action `activate` | `selectedBranchId`, `branches` | Giữ nguyên |
| Deactivate kho | POST | `/system/branches/:id/deactivate` | `branch.api.ts` | `submitAction` action `deactivate` | `selectedBranchId`, `branches` | Giữ nguyên |
| Load usage | GET | `/system/branches/:id/usage` | `branch.api.ts` | `loadUsage` | `usageByBranchId`, `loadingUsage` | Giữ nguyên |
| Xóa kho | DELETE | `/system/branches/:id` | `branch.api.ts` | `submitAction` action `delete` | `branches`, `selectedBranchId` | Giữ nguyên |

## State Quan Trọng

| State | File | Mục đích | Update ở đâu |
| ----- | ---- | -------- | ------------ |
| `branches` | `WarehouseBranchesPage.tsx` | Danh sách kho | `loadBranchesData`, `loadBranchDetail`, save |
| `selectedBranchId` | `WarehouseBranchesPage.tsx` | Kho đang chọn | load list, chọn kho, tạo/xóa |
| `form` | `WarehouseBranchesPage.tsx` | Dữ liệu form | map branch, input handlers, save |
| `isCreateMode` | `WarehouseBranchesPage.tsx` | Phân biệt tạo/sửa | `openCreateMode`, `selectBranch`, submit |
| `confirmAction` | `WarehouseBranchesPage.tsx` | Modal xác nhận Admin | action buttons, close modal |
| `submitting` | `WarehouseBranchesPage.tsx` | Disable khi thao tác ghi | `submitAction` |
| `detailRequestSeqRef` | `WarehouseBranchesPage.tsx` | Chống stale detail | `loadBranchDetail` |
| `formEditVersionRef` | `WarehouseBranchesPage.tsx` | Dirty-form guard | `updateForm`, `loadBranchDetail` |

## Filter/Search

| UI filter | Field gửi API | State | Handler | Ghi chú |
| --------- | ------------- | ----- | ------- | ------- |
| Search keyword | local filter, không gửi API hiện tại | `searchQuery` | input search | Giữ nguyên |
| Trạng thái | local filter | `statusFilter` | filter buttons | Giữ nguyên |

## Button/Action

| UI cũ | Vị trí | Chức năng | Handler hiện tại | Phase 2 |
| ----- | ------ | --------- | ---------------- | ------- |
| Thêm kho hàng | Header | Mở create mode | `openCreateMode` | Giữ nguyên |
| Lưu/Tạo kho hàng | Action row | Mở confirm create/save | `setConfirmAction` + `submitAction` | Giữ nguyên |
| Kích hoạt/Ngừng hoạt động | Action row | Toggle active | `activateBranch`/`deactivateBranch` | Giữ nguyên |
| Xem dữ liệu liên kết | Action row | Load usage | `loadUsage` | Giữ nguyên |
| In thử mẫu hóa đơn | Action row | Print preview | `printPreview` | Giữ nguyên |
| Xóa vĩnh viễn | Action row | Delete nếu an toàn | `deleteBranch` | Giữ nguyên |

## Phase 2 Scope

- Gỡ badge/label hiển thị kho mặc định trong list/card/detail.
- Gỡ nút và confirm action đặt kho mặc định.
- Gỡ import/export/caller frontend `setDefaultBranch` nếu không còn caller.
- Không còn render hay phụ thuộc vào `Branch.isDefault` trong UI này.

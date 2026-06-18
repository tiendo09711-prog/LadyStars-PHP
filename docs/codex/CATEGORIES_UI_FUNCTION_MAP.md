# CATEGORIES UI Function Map

## Route

- Path: `/products/categories`
- Main component: `client/src/modules/product/CategoriesPage.tsx`
- Related files:
  - `client/src/modules/product/CategoriesPage.tsx`
  - `client/src/modules/product/components/CategoryList.tsx`
  - `client/src/modules/product/categories-page.css`
  - `client/src/core/api/product.api.ts`
  - `client/src/core/components/Pagination.tsx`
  - `client/src/modules/product/components/ExportExcelModal.tsx`
- Layout/Auth/Permission: render inside `AppLayout`, no separate permission guard found for this route.

## Tong quan trang

- Page states:
  - category list view
  - create category editor
  - edit category editor
- Main UI zones in current refactor:
  - hero summary card
  - primary actions row
  - inline search/filter form
  - category table with bulk selection
  - row action menu + direct view-products button
  - export modal
  - import modal
  - category products modal
- Main functions kept:
  - load category list
  - search categories by `q`
  - paginate categories
  - create category
  - update category
  - delete single category
  - delete selected categories
  - bulk change active status
  - export excel
  - import excel
  - view products by category

## APIs in use

| Function | Method | Endpoint | API file | Handler | State | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Load categories | `GET` | `/products/categories` | `product.api.ts` | `load` | `items`, `total`, `loading` | main list loader |
| Search / paginate categories | `GET` | `/products/categories` | `product.api.ts` | `handleSearch`, `Pagination.onPageChange` | `search`, `page` | params `page`, `limit`, `q` |
| Create category | `POST` | `/products/categories` | `product.api.ts` | `CategoryEditorPanel.handleSave`, `handleImportSubmit` | `editorMode`, `editingCategory`, `importMode` | keep existing payload fields only |
| Update category | `PATCH` | `/products/categories/:id` | `product.api.ts` | `CategoryEditorPanel.handleSave`, `handleBulkStatus`, `handleImportSubmit` | `selectedIds`, `editorMode`, `editingCategory` | keep existing backend mapping |
| Delete category | `DELETE` | `/products/categories/:id` | `product.api.ts` | `handleDeleteCategory`, `handleDeleteSelected` | `selectedIds` | single + bulk delete |
| Export category data | `GET` many calls | `/products/categories` | `product.api.ts` | `handleExcelExport` | `exportLoading` | client-side workbook export |
| Load category products modal | `GET` | `/products/inventories` | `product.api.ts` | `CategoryProductsModal.load` | modal `items`, `total`, `loading` | params `page`, `limit`, `q`, `categoryId` |

## Important state

| State | File | Purpose | Updated in |
| --- | --- | --- | --- |
| `items` | `CategoryList.tsx` | category rows | `load` |
| `loading` | `CategoryList.tsx` | list loading state | `load` |
| `search` | `CategoryList.tsx` | category keyword | search input |
| `page` | `CategoryList.tsx` | current category page | `handleSearch`, `Pagination` |
| `total` | `CategoryList.tsx` | total categories | `load` |
| `selectedIds` | `CategoryList.tsx` | selected row ids | checkboxes + list refresh filter |
| `showExportModal` | `CategoryList.tsx` | export modal open/close | export button + bulk menu |
| `openAddMenu` | `CategoryList.tsx` | create split menu | add split button |
| `openBulkMenu` | `CategoryList.tsx` | bulk menu | bulk trigger |
| `openBulkStatusMenu` | `CategoryList.tsx` | bulk status submenu | status menu item |
| `openActionMenuId` | `CategoryList.tsx` | active row menu | row action button |
| `editorMode` | `CategoryList.tsx` | switch list/create/edit | create/edit open, cancel, save |
| `editingCategory` | `CategoryList.tsx` | current row being edited | edit open / close |
| `categoryOptions` | `CategoryList.tsx` | parent category options | `loadCategoryOptions` |
| `showImportModal` | `CategoryList.tsx` | import modal open/close | add menu -> import |
| `importMode` | `CategoryList.tsx` | create/update import mode | radio inputs |
| `importFile` | `CategoryList.tsx` | chosen excel file | file input |
| `importing` | `CategoryList.tsx` | import loading | `handleImportSubmit` |
| `actionLoading` | `CategoryList.tsx` | bulk action loading | `handleBulkStatus`, `handleDeleteSelected` |
| `viewProductsCategory` | `CategoryList.tsx` | active category for products modal | row view actions |

## Filter / Search

| UI filter | API field | State | Handler | Notes |
| --- | --- | --- | --- | --- |
| Main keyword search | `q` | `search` | `handleSearch` | fixed stale-page flow: reset to page 1 before reloading |
| Modal product keyword search | `q` | modal `search` | `CategoryProductsModal.handleSearch` | fixed same page-reset issue |

## Button / Action map

| UI | Position | Purpose | Handler | API call | Modal / Route | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Them moi` | hero actions | open create editor | `openCreateEditor` | indirect | editor | keeps existing create flow |
| add split caret | hero actions | open add dropdown | `setOpenAddMenu` | no | dropdown | contains import entry |
| `Nhap tu excel` | add dropdown | open import modal | `setShowImportModal(true)` | no direct | modal | same route |
| `Xuat Excel` | hero actions | open export modal directly | `setShowExportModal(true)` | no direct | modal | added for clearer UX and easier verification |
| `Thao tac` | hero actions | open bulk menu | `setOpenBulkMenu` | no direct | dropdown | selected rows required for destructive actions |
| bulk `Xuat du lieu` | bulk dropdown | open export modal | `setShowExportModal(true)` | no direct | modal | same logic as before |
| bulk `Doi trang thai` | bulk dropdown | toggle selected rows active state | `handleBulkStatus` | yes | none | uses existing PATCH endpoint |
| bulk `Xoa cache` | bulk dropdown | placeholder alert | inline `alert` | no | none | no backend configured |
| bulk `Xoa cac dong da chon` | bulk dropdown | delete selected rows | `handleDeleteSelected` | yes | browser confirm | existing DELETE flow |
| search submit | right filter area | reload by keyword | `handleSearch` | yes | none | keeps `q` filter |
| `Lam moi` | toolbar foot | reload current list state | `load` | yes | none | keeps current keyword/page state |
| row checkbox | table | select row | `handleToggleSelected` | no | none | bulk action source |
| header checkbox | table | select all rows in current page | `handleToggleSelectPage` | no | none | current page only |
| category name | table | open products modal | `setViewProductsCategory(item)` | modal follow-up yes | modal | keeps existing behavior |
| product count | table | open products modal | `setViewProductsCategory(item)` | modal follow-up yes | modal | now styled as richer stat button |
| `Xem san pham` | row action area | open products modal directly | `setViewProductsCategory(item)` | modal follow-up yes | modal | made visible without opening dropdown |
| row `Thao tac` | row action area | open row menu | `setOpenActionMenuId` | no direct | dropdown | edit/delete still grouped |
| row menu `Sua` | row menu | open edit editor | `openEditEditor(item)` | indirect | editor | existing update flow |
| row menu `Xoa` | row menu | delete single category | `handleDeleteCategory(item)` | yes | browser confirm | existing delete flow |
| editor `Luu` | create/edit header | submit category form | `CategoryEditorPanel.handleSave` | yes | same route | POST/PATCH only |
| editor `Huy` | create/edit header | return to list | `onCancel` | no | same route | no state mutation |
| import modal `Luu` | import footer | submit excel import | `handleImportSubmit` | yes | modal | CRUD endpoints only |
| products modal `Dong` | modal footer | close modal | `onClose` | no | modal | same as before |

## Table columns

| Column | Data field | Sort | Click | Action | Notes |
| --- | --- | --- | --- | --- | --- |
| checkbox | N/A | no | yes | selection | bulk actions |
| code | `code` | no | no | no | fallback `-` |
| name | `name` + `url` display helper | no | yes | open modal | added subtitle line for URL |
| active | `isActive` | no | no | no | badge |
| visible | `isVisible` | no | no | no | chip |
| product count | `productCount` | no | yes | open modal | now styled as small stat |
| created at | `createdAt` | no | no | no | `vi-VN` date |
| actions | N/A | no | yes | row actions | visible view button + dropdown |

## Modal / Panel map

| UI piece | Opened from | State | Purpose | API |
| --- | --- | --- | --- | --- |
| Export Excel modal | direct export button or bulk export | `showExportModal` | choose export scope and columns | `GET /products/categories` |
| Import Excel modal | add dropdown | `showImportModal` | choose file + import mode | `GET/POST/PATCH /products/categories` |
| Category products modal | name, count, visible row button, row menu | `viewProductsCategory` | inspect products in selected category | `GET /products/inventories` |
| Category editor panel | `Them moi` / `Sua` | `editorMode`, `editingCategory` | create/edit category | `POST/PATCH /products/categories` |
| Row action dropdown | row action trigger | `openActionMenuId` | view/edit/delete | no direct |
| Bulk action dropdown | hero bulk trigger | `openBulkMenu`, `openBulkStatusMenu` | export/status/delete | mixed |

## Pagination

| State page | Limit | Handler | API |
| --- | --- | --- | --- |
| list `page` | `20` | `setPage` | `GET /products/categories` |
| modal `page` | `10` | modal `setPage` | `GET /products/inventories` |

## Refactor risks

| Risk | Mitigation |
| --- | --- |
| list refactor accidentally hides old CRUD/import/export flows | kept same handlers and same component file, changed layout/style only |
| search while on page > 1 can reload stale page | fixed both list and modal search handlers |
| row actions become harder to verify after redesign | kept direct visible `Xuat Excel` and `Xem san pham` buttons |
| modal/editor layout changes break responsive behavior | CSS rewritten with mobile breakpoints for hero, table header, editor grid |

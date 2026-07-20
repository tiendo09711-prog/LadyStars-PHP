<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Category;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use App\Support\ApiPagination;
use App\Support\NodeShape;
use App\Support\LocalToken;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 20)), 1), 5000);
        $query = Product::query()->with('category');

        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%")
                    ->orWhere('category_name', 'like', "%{$search}%");
            });
        }

        if ($categoryId = $request->query('categoryId')) $query->where('category_id', $categoryId);
        if ($request->has('allowsSale')) $query->where('allows_sale', filter_var($request->query('allowsSale'), FILTER_VALIDATE_BOOLEAN));
        if ($status = trim((string) $request->query('status', ''))) $query->where('status', $status);
        if ($branchId = $request->query('branchId')) {
            $query->whereHas('stocks', fn ($builder) => $builder->where('branch_id', $branchId)->where('qty', '>', 0));
        }

        $sortMap = [
            'createdAt' => 'created_at',
            'name' => 'name',
            'code' => 'code',
            'barcode' => 'barcode',
            'cost' => 'cost',
            'price' => 'price',
            'qty' => 'qty',
            'status' => 'status',
        ];
        $sortInput = (string) $request->query('sort', 'createdAt');
        $sortColumn = $sortMap[$sortInput] ?? 'created_at';
        $orderInput = strtolower((string) $request->query('order', 'desc'));
        $sortOrder = $orderInput === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortColumn, $sortOrder)->orderBy('id', $sortOrder);

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (Product $product): array => NodeShape::product($product))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        // Trả meta.statuses để frontend không hardcode, lấy distinct từ DB (kèm default)
        $statuses = Product::query()
            ->select('status')
            ->distinct()
            ->pluck('status')
            ->map(fn ($s) => trim((string) $s))
            ->filter(fn ($s) => $s !== '')
            ->unique()
            ->sort(SORT_NATURAL)
            ->values()
            ->all();
        $payload['meta'] = ['statuses' => $statuses];

        return response()->json($payload);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->validatedPayload($request);
        $stocks = $payload['initialStocks'] ?? [];
        unset($payload['initialStocks']);
        $payload['code'] = $payload['code'] ?: $this->nextCode();
        $payload['barcode'] = $payload['barcode'] ?: $this->nextBarcode();

        try {
            $product = DB::transaction(function () use ($payload, $stocks): Product {
                $product = Product::query()->create($payload);
                $this->syncInitialStocks($product, $stocks);
                $this->refreshProductQty($product);
                return $product->load('category');
            });
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json(NodeShape::product($product), 201);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:20480'],
            'branchId' => ['required', 'integer', 'exists:branches,id'],
            'importMode' => ['nullable', 'string'],
        ]);

        $file = $request->file('file');
        $path = $file?->getRealPath();
        if ($path === false || $path === null || !is_readable($path)) {
            return response()->json(['message' => 'Khong doc duoc file import.'], 422);
        }

        $branchId = (int) $request->integer('branchId');
        $importMode = trim((string) $request->post('importMode', ''));
        $normalizedImportMode = strtolower(trim(\Illuminate\Support\Str::ascii($importMode)));
        $updateExisting = in_array($normalizedImportMode, ['cap nhat thong tin', 'update', 'update existing', 'update_existing', 'true', '1'], true)
            || str_contains($normalizedImportMode, 'cap nhat');

        // EMPLOYEE / anonymous: force add-only — never update existing products or add stock via import.
        if ($updateExisting && ! $this->isAdminUser($this->resolveAuthUser($request))) {
            $updateExisting = false;
        }

        $readHandle = function () use ($path) {
            $handle = fopen($path, 'r');
            if ($handle === false) {
                return false;
            }
            $head = fread($handle, 3);
            if ($head !== "\xEF\xBB\xBF") {
                rewind($handle);
            }
            return $handle;
        };

        $handle = $readHandle();
        if ($handle === false) {
            return response()->json(['message' => 'Khong mo duoc file import.'], 422);
        }

        $header = fgetcsv($handle, 0, ';');
        $separator = ';';
        if ($header === false || $header === null || count($header) <= 1) {
            fclose($handle);
            $handle = $readHandle();
            if ($handle === false) {
                return response()->json(['message' => 'Khong mo duoc file import.'], 422);
            }
            $header = fgetcsv($handle, 0, ',');
            $separator = ',';
            if ($header === false || $header === null) {
                fclose($handle);
                return response()->json(['message' => 'File CSV khong co dong header.'], 422);
            }
        }

        $header = array_map(fn ($h) => trim((string) $h), $header);
        $colIndex = [];
        $normalizedColIndex = [];
        $normalizeHeader = function (string $value): string {
            $ascii = \Illuminate\Support\Str::ascii(trim($value));
            $ascii = strtolower((string) preg_replace('/\s+/', ' ', $ascii));
            return trim($ascii);
        };
        foreach ($header as $i => $name) {
            if (!isset($colIndex[$name])) {
                $colIndex[$name] = $i;
            }
            $normalizedName = $normalizeHeader($name);
            if ($normalizedName !== '' && !isset($normalizedColIndex[$normalizedName])) {
                $normalizedColIndex[$normalizedName] = $i;
            }
        }
        $pick = function (string ...$names) use ($colIndex, $normalizedColIndex, $normalizeHeader): ?int {
            foreach ($names as $name) {
                if (isset($colIndex[$name])) {
                    return (int) $colIndex[$name];
                }
                $normalizedName = $normalizeHeader($name);
                if (isset($normalizedColIndex[$normalizedName])) {
                    return (int) $normalizedColIndex[$normalizedName];
                }
            }
            return null;
        };
        $colCode = $pick('Mã sản phẩm', 'ma san pham', 'code', 'Mã SP', 'ma sp', 'Code');
        $colName = $pick('Tên sản phẩm', 'ten san pham', 'name', 'Tên', 'ten', 'Name');
        $colUnit = $pick('Đơn vị', 'don vi', 'unit', 'Đơn vị tính', 'don vi tinh', 'Unit');
        $colCost = $pick('Giá nhập', 'gia nhap', 'cost', 'Giá vốn', 'gia von', 'Cost');
        $colPrice = $pick('Giá bán', 'gia ban', 'price', 'Giá bán lẻ', 'gia ban le', 'Price');
        $colWholesale = $pick('Giá buôn', 'gia buon', 'wholesalePrice', 'wholesale_price', 'Wholesale price');
        $colQty = $pick('Tồn trong kho', 'ton trong kho', 'qty', 'Tồn kho', 'ton kho', 'quantity', 'Quantity');
        $colCategory = $pick('Danh mục', 'danh muc', 'category', 'categoryName', 'Category');
        $colTrademark = $pick('Thương hiệu', 'thuong hieu', 'trademark', 'trademarkName', 'Trademark');
        $colSupplier = $pick('Nhà cung cấp', 'nha cung cap', 'supplier', 'supplierName', 'Supplier');
        $colColor = $pick('Màu sắc', 'mau sac', 'color', 'Color');
        $colSize = $pick('Kích thước', 'kich thuoc', 'size', 'Size');
        $colStatus = $pick('Trạng thái', 'trang thai', 'status', 'Status');
        $colBarcode = $pick('Mã vạch', 'ma vach', 'barcode', 'Barcode');

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $stockAdded = 0.0;
        $errors = [];
        $lineNo = 1;

        DB::transaction(function () use ($handle, $separator, $branchId, $updateExisting, $colCode, $colName, $colUnit, $colCost, $colPrice, $colWholesale, $colQty, $colCategory, $colTrademark, $colSupplier, $colColor, $colSize, $colStatus, $colBarcode, &$created, &$updated, &$skipped, &$stockAdded, &$errors, &$lineNo): void {
            while (($row = fgetcsv($handle, 0, $separator)) !== false) {
                $lineNo++;
                if ($row === [null] || (count($row) === 1 && trim((string) ($row[0] ?? '')) === '')) {
                    $skipped++;
                    continue;
                }
                $valueAt = function (?int $index) use ($row): string {
                    if ($index === null || !isset($row[$index])) {
                        return '';
                    }
                    return trim((string) $row[$index]);
                };
                $code = $valueAt($colCode);
                $name = $valueAt($colName);
                if ($name === '') {
                    $errors[] = sprintf('Dong %d bo qua: thieu ten san pham.', $lineNo);
                    $skipped++;
                    continue;
                }
                $qty = (float) ($valueAt($colQty) ?: 0);
                $payload = [
                    'code' => $code,
                    'name' => $name,
                    'unit' => $valueAt($colUnit) ?: null,
                    'cost' => (float) ($valueAt($colCost) ?: 0),
                    'price' => (float) ($valueAt($colPrice) ?: 0),
                    'wholesale_price' => (float) ($valueAt($colWholesale) ?: 0),
                    'category_name' => $valueAt($colCategory) ?: null,
                    'trademark_name' => $valueAt($colTrademark) ?: null,
                    'supplier_name' => $valueAt($colSupplier) ?: null,
                    'color' => $valueAt($colColor) ?: null,
                    'size' => $valueAt($colSize) ?: null,
                    'status' => $valueAt($colStatus) ?: 'Moi',
                    'type' => 'product',
                    'allows_sale' => true,
                ];
                $existing = $code !== '' ? Product::query()->where('code', $code)->first() : null;
                if ($existing && !$updateExisting) {
                    $errors[] = sprintf('Dong %d bo qua: ma san pham "%s" da ton tai.', $lineNo, $code);
                    $skipped++;
                    continue;
                }
                if ($existing) {
                    $existing->fill(collect($payload)->except(['code'])->toArray());
                    $existing->save();
                    if ($qty > 0) {
                        $this->addStockForBranch($existing, $branchId, $qty);
                        $stockAdded += $qty;
                    }
                    $this->refreshProductQty($existing->fresh());
                    $updated++;
                    continue;
                }
                try {
                    $product = new Product($payload);
                    if ($product->code === '') {
                        $product->code = $this->nextCode();
                    }
                    $barcode = $valueAt($colBarcode);
                    $product->barcode = $barcode !== '' ? $barcode : $this->nextBarcode();
                    $product->save();
                } catch (QueryException $error) {
                    $errors[] = sprintf('Dong %d bo qua: %s', $lineNo, str_contains($error->getMessage(), 'UNIQUE') ? 'ma hoac barcode da ton tai' : 'loi luu san pham');
                    $skipped++;
                    continue;
                }
                if ($qty > 0) {
                    $this->addStockForBranch($product, $branchId, $qty);
                    $stockAdded += $qty;
                }
                $this->refreshProductQty($product->fresh());
                $created++;
            }
        });

        fclose($handle);

        return response()->json(['summary' => [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'stockAdded' => $stockAdded,
            'errors' => $errors,
            'voucherId' => null,
        ]]);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(NodeShape::product($product->load(['category', 'stocks.branch'])));
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $this->requireAdminUser($request);

        $payload = $this->validatedPayload($request, $product);
        $stocks = $payload['initialStocks'] ?? null;
        unset($payload['initialStocks']);
        if (($payload['code'] ?? '') === '') unset($payload['code']);
        if (($payload['barcode'] ?? '') === '') unset($payload['barcode']);

        try {
            $product = DB::transaction(function () use ($product, $payload, $stocks): Product {
                $product->update($payload);
                if (is_array($stocks)) $this->syncInitialStocks($product, $stocks);
                $this->refreshProductQty($product);
                return $product->load('category');
            });
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json(NodeShape::product($product));
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        $this->requireAdminUser($request);

        $blockingReason = $this->productDeleteBlockingReason($product);
        if ($blockingReason !== null) {
            return response()->json(['message' => $blockingReason], 409);
        }

        $product->delete();

        return response()->json(['ok' => true, 'message' => 'Deleted']);
    }

    public function stocks(Product $product): JsonResponse
    {
        $stocks = $product->stocks()->with(['branch', 'product.category'])->orderBy('branch_id')->get();
        $items = $stocks->map(fn (ProductBranchStock $stock): array => NodeShape::stock($stock))->values();

        return response()->json([
            'data' => $items,
            'items' => $items,
            'totalQuantity' => (float) $stocks->sum('qty'),
        ]);
    }

    public function inventories(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 50)), 1), 5000);
        $search = trim((string) $request->query('q', $request->query('search', '')));
        // Resolve mongo_id / code / local id → branches.id so transfer create (meta uses mongo_id) works.
        $branchId = $this->resolveBranchLocalId($request->query('branchId'));
        $categoryId = $request->query('categoryId');
        $stockStatus = (string) $request->query('stockStatus', '');
        $sort = (string) $request->query('sort', 'createdAt');
        $isAsc = strtolower((string) $request->query('order', 'desc')) === 'asc';
        $order = $isAsc ? 'asc' : 'desc';

        $totalStockQuantity = 0;
        $totalInventoryValue = 0;

        // === SEMANTICS (rõ ràng, thống nhất FE/BE) ===
        // - branchId filter: lọc ROW (chỉ lấy sản phẩm có record stock ở kho đó). Dùng để "tập trung" vào kho.
        // - totalStock + stockByBranch*: LUÔN là tổng TOÀN BỘ các kho (không bị ảnh hưởng bởi branch filter).
        //   Lý do: UI luôn hiển thị cột tất cả kho + cột Tổng tồn.
        // - stockStatus + branchId: aggregate TÍNH TRONG KHO được filter (in_stock: qty>0 tại kho; sellable: qty-locked >0 tại kho).
        // - stockStatus không branch: aggregate TOÀN HỆ THỐNG.

        $fullTotalStockSub = ProductBranchStock::query()
            ->whereColumn('product_id', 'products.id')
            ->selectRaw('COALESCE(SUM(qty), 0)');

        // Các sub cho status filter (đã dùng whereExists an toàn)
        $statusStockSub = ProductBranchStock::query()
            ->whereColumn('product_id', 'products.id')
            ->when($branchId, fn ($b) => $b->where('branch_id', $branchId))
            ->selectRaw('COALESCE(SUM(qty), 0)');

        $statusLockedSub = ProductBranchStock::query()
            ->whereColumn('product_id', 'products.id')
            ->when($branchId, fn ($b) => $b->where('branch_id', $branchId))
            ->selectRaw('COALESCE(SUM(locked_quantity), 0)');

        $query = Product::query()
            ->with(['category', 'stocks.branch']);

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }
        if ($categoryId) $query->where('category_id', $categoryId);
        if ($branchId) $query->whereHas('stocks', fn ($builder) => $builder->where('branch_id', $branchId));

        // Sử dụng whereExists + group having để filter aggregate stock an toàn (không toSql lỗi 1064)
        if ($stockStatus === 'in_stock') {
            $query->whereExists(function ($exists) use ($branchId) {
                $exists->select(DB::raw('1'))
                    ->from('product_branch_stocks as s')
                    ->whereColumn('s.product_id', 'products.id')
                    ->when($branchId, fn ($w) => $w->where('s.branch_id', $branchId))
                    ->groupBy('s.product_id')
                    ->havingRaw('SUM(s.qty) > 0');
            });
        } elseif ($stockStatus === 'sellable') {
            $query->whereExists(function ($exists) use ($branchId) {
                $exists->select(DB::raw('1'))
                    ->from('product_branch_stocks as s')
                    ->whereColumn('s.product_id', 'products.id')
                    ->when($branchId, fn ($w) => $w->where('s.branch_id', $branchId))
                    ->groupBy('s.product_id')
                    ->havingRaw('SUM(s.qty) - SUM(s.locked_quantity) > 0');
            });
        }

        // === Aggregate "TỔNG TỒN" (total quantity sum over FULL filtered result set, not page) ===
        // Uses explicit product filter subquery (same conditions as list) + branch scope for sum.
        // - Tất cả kho: sum(qty) over all branches for matching products
        // - Specific kho: sum( only that branch's qty ) for matching products
        // - Respects search, stockStatus (in_stock/sellable scoped to branch if chosen)
        $productIdSub = Product::query()->select('id');
        if ($search !== '') {
            $productIdSub->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }
        if ($categoryId) $productIdSub->where('category_id', $categoryId);
        if ($branchId) {
            $productIdSub->whereHas('stocks', fn ($builder) => $builder->where('branch_id', $branchId));
        }
        if ($stockStatus === 'in_stock') {
            $productIdSub->whereExists(function ($exists) use ($branchId) {
                $exists->select(DB::raw('1'))
                    ->from('product_branch_stocks as s')
                    ->whereColumn('s.product_id', 'products.id')
                    ->when($branchId, fn ($w) => $w->where('s.branch_id', $branchId))
                    ->groupBy('s.product_id')
                    ->havingRaw('SUM(s.qty) > 0');
            });
        } elseif ($stockStatus === 'sellable') {
            $productIdSub->whereExists(function ($exists) use ($branchId) {
                $exists->select(DB::raw('1'))
                    ->from('product_branch_stocks as s')
                    ->whereColumn('s.product_id', 'products.id')
                    ->when($branchId, fn ($w) => $w->where('s.branch_id', $branchId))
                    ->groupBy('s.product_id')
                    ->havingRaw('SUM(s.qty) - SUM(s.locked_quantity) > 0');
            });
        }

        $aggStockQ = ProductBranchStock::query()->whereIn('product_id', $productIdSub);
        if ($branchId) {
            $aggStockQ->where('branch_id', $branchId);
        }
        $totalStockQuantity = (float) ($aggStockQ->selectRaw('COALESCE(SUM(qty), 0) as sum_qty')->value('sum_qty') ?? 0);

        // === Aggregate "TỔNG GIÁ TRỊ" (full filtered, not page) ===
        // - qty scoped by branchId (or full total if no branch)
        // - uses product.cost as unit value (giá vốn/nhập)
        // - respects same filters as totalStockQuantity and list (search, stockStatus, branch presence)
        $aggValueQ = ProductBranchStock::query()
            ->join('products as p', 'p.id', '=', 'product_branch_stocks.product_id')
            ->whereIn('product_branch_stocks.product_id', $productIdSub);
        if ($branchId) {
            $aggValueQ->where('product_branch_stocks.branch_id', $branchId);
        }
        $totalInventoryValue = (float) ($aggValueQ->selectRaw('COALESCE(SUM(product_branch_stocks.qty * p.cost), 0) as sum_value')->value('sum_value') ?? 0);

        $sortKey = strtolower($sort);
        if (preg_match('/^stock_(\d+)$/', $sortKey, $matches) === 1) {
            $sortBranchId = (int) $matches[1];
            $sortStockSub = ProductBranchStock::query()
                ->whereColumn('product_id', 'products.id')
                ->where('branch_id', $sortBranchId)
                ->selectRaw('COALESCE(SUM(qty), 0)');
            $query->orderByRaw('(' . $sortStockSub->toSql() . ') ' . $order, $sortStockSub->getBindings())
                ->orderBy('id', $order);
        } elseif ($sortKey === 'totalstock') {
            // totalStock sort LUÔN dùng full total (không bị ảnh hưởng branch filter)
            $query->orderByRaw('(' . $fullTotalStockSub->toSql() . ') ' . $order, $fullTotalStockSub->getBindings())
                ->orderBy('id', $order);
        } elseif ($sortKey === 'createdat') {
            $query->orderBy('created_at', $order)->orderBy('id', $order);
        } elseif (in_array($sortKey, ['code', 'name', 'cost', 'price'], true)) {
            $query->orderBy($sortKey, $order)->orderBy('id', $order);
        } else {
            $query->orderBy('created_at', $order)->orderBy('id', $order);
        }

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])
            ->map(function (Product $product) use ($branchId): array {
                $shape = NodeShape::inventory($product);
                // When a warehouse is selected (retail/wholesale create, inventory filter),
                // expose branch-scoped stock so sellers cannot use totalStock across warehouses.
                if ($branchId) {
                    $key = (string) $branchId;
                    $shape['selectedStock'] = (float) ($shape['stockByBranchId'][$key] ?? 0);
                    $shape['qty'] = $shape['selectedStock'];
                    $shape['quantity'] = $shape['selectedStock'];
                    // Branch-scoped lock is required for transfer "có thể chuyển" = qty - locked.
                    $branchStock = $product->relationLoaded('stocks')
                        ? $product->stocks->first(fn ($s) => (string) $s->branch_id === $key)
                        : null;
                    $locked = (float) ($branchStock?->locked_quantity ?? ($shape['lockedByBranchId'][$key] ?? 0));
                    $shape['lockedQuantity'] = $locked;
                    $shape['availableStock'] = max(0.0, $shape['selectedStock'] - $locked);
                }

                return $shape;
            })
            ->all();
        $payload['items'] = $items;
        $payload['data'] = $items;
        $payload['totalStockQuantity'] = $totalStockQuantity;
        $payload['totalInventoryValue'] = $totalInventoryValue;

        // Full-set breakdown for inventory report chart (backward-compatible additive field).
        // Scoped to the same filtered product set as totalStockQuantity / totalInventoryValue.
        $byWarehouseQ = ProductBranchStock::query()
            ->join('branches as b', 'b.id', '=', 'product_branch_stocks.branch_id')
            ->join('products as p', 'p.id', '=', 'product_branch_stocks.product_id')
            ->whereIn('product_branch_stocks.product_id', $productIdSub);
        if ($branchId) {
            $byWarehouseQ->where('product_branch_stocks.branch_id', $branchId);
        }
        $byWarehouse = $byWarehouseQ
            ->groupBy('b.id', 'b.name', 'b.mongo_id')
            ->orderBy('b.name')
            ->get([
                'b.id as branch_id',
                'b.mongo_id as branch_mongo_id',
                'b.name as branch_name',
                DB::raw('COALESCE(SUM(product_branch_stocks.qty), 0) as qty'),
                DB::raw('COALESCE(SUM(product_branch_stocks.qty * p.cost), 0) as value'),
            ])
            ->map(fn ($row): array => [
                'branchId' => (string) ($row->branch_mongo_id ?: $row->branch_id),
                'localBranchId' => (int) $row->branch_id,
                'name' => (string) $row->branch_name,
                'qty' => (float) $row->qty,
                'value' => (float) $row->value,
            ])
            ->values()
            ->all();

        $payload['breakdowns'] = [
            'byWarehouse' => $byWarehouse,
        ];
        $payload['meta'] = [
            'generatedAt' => now()->toIso8601String(),
            'capabilities' => [
                'warehouseBreakdown' => true,
                'valueMetrics' => true,
            ],
        ];

        return response()->json($payload);
    }

    public function updateInventory(Request $request, ProductBranchStock $stock): JsonResponse
    {
        $data = $request->validate([
            'qty' => ['nullable', 'numeric', 'min:0'],
            'quantity' => ['nullable', 'numeric', 'min:0'],
            'lockedQuantity' => ['nullable', 'numeric', 'min:0'],
            'minQuantity' => ['nullable', 'numeric', 'min:0'],
            'maxQuantity' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($stock, $data): void {
            $beforeQty = (float) $stock->qty;
            $nextQty = (float) ($data['quantity'] ?? $data['qty'] ?? $stock->qty);

            $stock->update([
                'qty' => $nextQty,
                'locked_quantity' => $data['lockedQuantity'] ?? $stock->locked_quantity,
                'min_quantity' => $data['minQuantity'] ?? $stock->min_quantity,
                'max_quantity' => $data['maxQuantity'] ?? $stock->max_quantity,
            ]);
            $this->refreshProductQty($stock->product);
            $this->writeLocalStockAdjustmentLog($stock->fresh()->load(['product', 'branch']), $beforeQty, $nextQty);
        });

        return response()->json(NodeShape::stock($stock->fresh()->load(['branch', 'product.category'])));
    }

    public function categories(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 100)), 1), 5000);
        $query = Category::query()->orderBy('name');
        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(fn ($builder) => $builder->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"));
        }
        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));

        // Compute live product counts from products table (product_count column may be stale from legacy import).
        // This ensures /products/categories page shows accurate "Số sản phẩm" synced to current MySQL data.
        $rawItems = $payload['items'] ?? [];
        $ids = collect($rawItems)->pluck('id')->filter()->values()->all();
        $countMap = [];
        if (count($ids) > 0) {
            $countMap = Product::query()
                ->select('category_id', DB::raw('COUNT(*) as cnt'))
                ->whereIn('category_id', $ids)
                ->groupBy('category_id')
                ->get()
                ->pluck('cnt', 'category_id')
                ->all();
        }
        $items = collect($rawItems)->map(function (Category $category) use ($countMap): array {
            $shape = NodeShape::category($category);
            $shape['productCount'] = (int) ($countMap[$category->id] ?? 0);
            return $shape;
        })->all();

        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $this->validatedCategoryPayload($request);

        try {
            $category = DB::transaction(function () use ($data): Category {
                return Category::query()->create($data);
            });
        } catch (QueryException $error) {
            if (str_contains($error->getMessage(), 'UNIQUE') || (int) ($error->errorInfo[1] ?? 0) === 1062) {
                return response()->json(['message' => 'Ma danh muc hoac ten danh muc da ton tai.'], 409);
            }
            throw $error;
        }

        return response()->json(NodeShape::category($category), 201);
    }

    public function updateCategory(Request $request, Category $category): JsonResponse
    {
        $data = $this->validatedCategoryPayload($request, $category);

        try {
            DB::transaction(function () use ($category, $data): void {
                $category->update($data);

                // Đồng bộ denormalized category_name trên products khi đổi tên danh mục.
                if (array_key_exists('name', $data)) {
                    Product::query()
                        ->where('category_id', $category->id)
                        ->update(['category_name' => $data['name']]);
                }
            });
        } catch (QueryException $error) {
            if (str_contains($error->getMessage(), 'UNIQUE') || (int) ($error->errorInfo[1] ?? 0) === 1062) {
                return response()->json(['message' => 'Ma danh muc hoac ten danh muc da ton tai.'], 409);
            }
            throw $error;
        }

        return response()->json(NodeShape::category($category->fresh()));
    }

    public function destroyCategory(Category $category): JsonResponse
    {
        $blockingReason = $this->categoryDeleteBlockingReason($category);
        if ($blockingReason !== null) {
            return response()->json(['message' => $blockingReason], 409);
        }

        $category->delete();

        return response()->json(['ok' => true, 'message' => 'Deleted']);
    }

    private function validatedCategoryPayload(Request $request, ?Category $category = null): array
    {
        $id = $category?->id;
        $data = $request->validate([
            'name' => [$id === null ? 'required' : 'sometimes', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:255', Rule::unique('categories', 'code')->ignore($id)],
            'parentId' => ['nullable', 'integer', 'exists:categories,id'],
            'isActive' => ['nullable', 'boolean'],
            'isVisible' => ['nullable', 'boolean'],
            'url' => ['nullable', 'string', 'max:255'],
        ]);

        $parentId = $data['parentId'] ?? null;
        if ($parentId !== null && $id !== null && (int) $parentId === (int) $id) {
            throw \Illuminate\Validation\ValidationException::withMessages(['parentId' => ['Danh muc cha khong duoc trung chinh no.']]);
        }

        // Chặn vòng lặp cây: không cho gán parent là chính nó hoặc hậu duệ (A→B→A, A→B→C→A, ...).
        if ($parentId !== null && $id !== null) {
            $cursor = (int) $parentId;
            $guard = 0;
            while ($cursor > 0 && $guard < 64) {
                if ($cursor === (int) $id) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'parentId' => ['Danh muc cha khong hop le: tao vong lap phan cap.'],
                    ]);
                }
                $cursor = (int) (Category::query()->whereKey($cursor)->value('parent_id') ?? 0);
                $guard++;
            }
        }

        // Giới hạn tối đa 4 cấp: root = cấp 1. Parent ở cấp 4 thì không cho tạo con (cấp 5).
        if ($parentId !== null) {
            $depth = 1;
            $cursor = (int) $parentId;
            $guard = 0;
            while ($cursor > 0 && $guard < 64) {
                $depth++;
                $cursor = (int) (Category::query()->whereKey($cursor)->value('parent_id') ?? 0);
                $guard++;
            }
            if ($depth > 4) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'parentId' => ['Danh muc chi ho tro toi da 4 cap.'],
                ]);
            }
        }

        $payload = [];

        // Khi update, chi ghi cac truong thuc su duoc gui de tranh xoa du lieu hien co.
        if (array_key_exists('name', $data)) {
            $payload['name'] = trim((string) $data['name']);
        }
        if ($request->has('parentId') || $id === null) {
            $payload['parent_id'] = $parentId;
        }
        if ($request->has('code') || $id === null) {
            $payload['code'] = (string) ($data['code'] ?? '') === '' ? null : trim((string) $data['code']);
        }
        if ($request->has('isActive') || $id === null) {
            $payload['is_active'] = $data['isActive'] ?? true;
        }
        if ($request->has('isVisible') || $id === null) {
            $payload['is_visible'] = $data['isVisible'] ?? true;
        }
        if ($request->has('url') || $id === null) {
            $payload['url'] = (string) ($data['url'] ?? '') === '' ? null : trim((string) $data['url']);
        }

        return $payload;
    }

    private function categoryDeleteBlockingReason(Category $category): ?string
    {
        if (Product::query()->where('category_id', $category->id)->exists()) {
            return 'Khong the xoa danh muc dang con san pham thuoc danh muc nay.';
        }

        if (Category::query()->where('parent_id', $category->id)->exists()) {
            return 'Khong the xoa danh muc dang la danh muc cha cua danh muc khac.';
        }

        return null;
    }

    public function storageDuration(Request $request): JsonResponse
    {
        // Sensitive stock/cost report: require a valid login token (ADMIN or EMPLOYEE).
        $this->requireAuthenticatedUser($request);

        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 20)), 1), 5000);
        $thresholdDays = max((int) $request->query('thresholdDays', $request->query('alertDays', 30)), 1);
        $search = trim((string) $request->query('q', $request->query('search', '')));
        $tab = (string) $request->query('tab', 'all');
        $minStartDays = $request->filled('minStartDays') ? max((int) $request->query('minStartDays'), 0) : null;
        $minSoldDays = $request->filled('minSoldDays') ? max((int) $request->query('minSoldDays'), 0) : null;
        $branchIdFilter = $request->query('branchId');
        $minStock = $request->filled('minStock') ? max((float) $request->query('minStock'), 0) : null;

        $query = Product::query()
            ->with(['category', 'stocks.branch'])
            ->where('qty', '>', 0)
            ->orderByDesc('qty')
            ->orderBy('name');

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%")
                    ->orWhere('category_name', 'like', "%{$search}%");
            });
        }
        if ($categoryId = $request->query('categoryId')) {
            $query->where('category_id', $categoryId);
        }
        if ($branchIdFilter !== null && $branchIdFilter !== '') {
            // Branch scope: only products with stock at that branch.
            // When minStock is set, compare against branch qty (not global Product.qty).
            $query->whereHas('stocks', function ($builder) use ($branchIdFilter, $minStock): void {
                $builder->where('branch_id', $branchIdFilter);
                if ($minStock !== null) {
                    $builder->where('qty', '>=', $minStock);
                } else {
                    $builder->where('qty', '>', 0);
                }
            });
        } elseif ($minStock !== null) {
            $query->where('qty', '>=', $minStock);
        }

        $products = $query->get();

        // Build enriched maps once for the current scope to avoid N+1 queries.
        $lastSoldMap = $this->lastSoldDatesByMongoId($products, $branchIdFilter);
        $txnMap = $this->inventoryTransactionDatesByProductId($products, $branchIdFilter);

        $shape = function (Product $product) use ($thresholdDays, $lastSoldMap, $txnMap, $branchIdFilter): array {
            return $this->storageDurationShape($product, $thresholdDays, $lastSoldMap, $txnMap, $branchIdFilter);
        };

        $shaped = $products->map($shape)->values();

        // Semantic day filters apply to both list and tab KPI counts so badges match the
        // advanced filters currently selected (search/branch/category/minStock already in SQL).
        $itemsForKpi = $shaped;
        if ($minStartDays !== null) {
            $itemsForKpi = $itemsForKpi->filter(fn (array $item): bool => (int) $item['daysFromStart'] >= $minStartDays);
        }
        if ($minSoldDays !== null) {
            $itemsForKpi = $itemsForKpi->filter(function (array $item) use ($minSoldDays): bool {
                $days = $item['daysFromLastSold'];

                return $days === null || (int) $days >= $minSoldDays;
            });
        }
        $itemsForKpi = $itemsForKpi->values();

        // Tab filter only affects the visible list + summary totalValue (not tab badge counts).
        $filtered = $itemsForKpi;
        if ($tab === 'unsold_long') {
            $filtered = $filtered->filter(fn (array $item): bool => $item['status'] === 'unsold_long');
        } elseif ($tab === 'slow_selling') {
            $filtered = $filtered->filter(fn (array $item): bool => $item['status'] === 'slow_selling');
        }
        $filtered = $filtered->values();

        $total = $filtered->count();
        $page = max((int) $request->query('page', 1), 1);
        $offset = ($page - 1) * $perPage;
        $pageItems = $filtered->slice($offset, $perPage)->values()->all();

        $valueOf = static fn (array $item): float => (float) ($item['qty'] ?? 0) * (float) ($item['cost'] ?? 0);

        $payload = [
            'items' => $pageItems,
            'data' => $pageItems,
            'total' => $total,
            'page' => $page,
            'limit' => $perPage,
            'per_page' => $perPage,
            'current_page' => $page,
            'last_page' => max((int) ceil($total / max($perPage, 1)), 1),
            'from' => $total > 0 ? $offset + 1 : null,
            'to' => $total > 0 ? min($offset + $perPage, $total) : null,
        ];
        // Age chart buckets follow active tab + common filters (same set as list/totalValue).
        // Badge counts stay on $itemsForKpi (pre-tab); chart/export value use $filtered.
        $ageBuckets = [
            ['key' => '0_30', 'label' => '0–30 ngày', 'min' => 0, 'max' => 30, 'count' => 0, 'value' => 0.0],
            ['key' => '31_60', 'label' => '31–60 ngày', 'min' => 31, 'max' => 60, 'count' => 0, 'value' => 0.0],
            ['key' => '61_90', 'label' => '61–90 ngày', 'min' => 61, 'max' => 90, 'count' => 0, 'value' => 0.0],
            ['key' => 'over_90', 'label' => 'Trên 90 ngày', 'min' => 91, 'max' => null, 'count' => 0, 'value' => 0.0],
        ];
        foreach ($filtered as $item) {
            $days = $item['daysFromLastSold'];
            if ($days === null) {
                $days = (int) ($item['daysFromStart'] ?? 0);
            } else {
                $days = (int) $days;
            }
            $value = $valueOf($item);
            foreach ($ageBuckets as &$bucket) {
                $min = (int) $bucket['min'];
                $max = $bucket['max'];
                if ($days >= $min && ($max === null || $days <= (int) $max)) {
                    $bucket['count']++;
                    $bucket['value'] += $value;
                    break;
                }
            }
            unset($bucket);
        }

        $payload['kpis'] = [
            // Tab badges: after SQL + day filters, before active tab.
            'totalProducts' => $itemsForKpi->count(),
            'unsoldLong' => $itemsForKpi->where('status', 'unsold_long')->count(),
            'slowSelling' => $itemsForKpi->where('status', 'slow_selling')->count(),
            // Summary money reflects the currently visible filtered set (including tab).
            // qty is branch-scoped when branchId is active.
            'totalValue' => (float) $filtered->sum($valueOf),
            'oldStockValue' => (float) $itemsForKpi->whereIn('status', ['unsold_long', 'slow_selling'])->sum($valueOf),
            'unsoldLongValue' => (float) $itemsForKpi->where('status', 'unsold_long')->sum($valueOf),
            'slowSellingValue' => (float) $itemsForKpi->where('status', 'slow_selling')->sum($valueOf),
            'thresholdDays' => $thresholdDays,
            'lastRefreshedAt' => now()->toISOString(),
            'topUnsoldLong' => $itemsForKpi->where('status', 'unsold_long')->take(5)->values()->all(),
            'topSlowSelling' => $itemsForKpi->where('status', 'slow_selling')->take(5)->values()->all(),
            'ageBuckets' => $ageBuckets,
        ];
        $payload['breakdowns'] = [
            'ageBuckets' => $ageBuckets,
        ];
        $payload['meta'] = [
            'generatedAt' => now()->toIso8601String(),
            'capabilities' => [
                'ageBuckets' => true,
            ],
        ];

        return response()->json($payload);
    }

    /**
     * Build a map of product key => last non-cancelled sale completed_at (Carbon instance).
     * Keys are product mongo_id when available, otherwise local id string.
     * Line productId may be mongo_id (string), local PK (int/string), or nested object —
     * same contract as DashboardController / RevenueByProductReportService.
     * When $branchIdFilter, only sales from that branch_id (sale_payments has branch_id).
     */
    private function lastSoldDatesByMongoId($products, $branchIdFilter = null): array
    {
        if ($products->isEmpty()) {
            return [];
        }

        // Canonical key for shape lookup: prefer mongo_id, fallback local id string.
        $canonicalByLineKey = [];
        foreach ($products as $product) {
            $canonical = filled($product->mongo_id) ? (string) $product->mongo_id : (string) $product->id;
            if (filled($product->mongo_id)) {
                $canonicalByLineKey[(string) $product->mongo_id] = $canonical;
            }
            $canonicalByLineKey[(string) $product->id] = $canonical;
        }

        $cancelledSaleIds = $this->cancelledSalePaymentIdsByProductMongoId($products);
        // Also index by product code for legacy import lines that only have productCode.
        $canonicalByCode = [];
        foreach ($products as $product) {
            if (filled($product->code)) {
                $canonical = filled($product->mongo_id) ? (string) $product->mongo_id : (string) $product->id;
                $canonicalByCode[(string) $product->code] = $canonical;
            }
        }

        $map = [];
        $rows = \App\Models\MirrorRecord::query()
            ->from('sale_payments')
            ->where('status', 'completed')
            ->whereNotNull('completed_at')
            ->when($branchIdFilter, fn ($q) => $q->where('branch_id', $branchIdFilter))
            ->get(['mongo_id', 'items', 'payload', 'completed_at']);

        foreach ($rows as $row) {
            // Prefer column items; fallback payload.items (Excel import only filled payload).
            $items = is_array($row->items) ? $row->items : null;
            if (!is_array($items) || $items === []) {
                $payload = is_array($row->payload) ? $row->payload : json_decode((string) $row->payload, true);
                $items = is_array($payload) ? ($payload['items'] ?? null) : null;
            }
            if (!is_array($items) || $items === []) {
                $decoded = json_decode((string) $row->items, true);
                $items = is_array($decoded) ? $decoded : [];
            }
            if (!is_array($items) || $items === []) {
                continue;
            }
            $completedAt = \Illuminate\Support\Carbon::parse($row->completed_at);
            foreach ($items as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $pidRaw = $line['productId'] ?? $line['product_id'] ?? null;
                if (is_array($pidRaw)) {
                    $pidRaw = $pidRaw['id'] ?? $pidRaw['_id'] ?? $pidRaw['mongo_id'] ?? null;
                }
                $canonical = null;
                if ($pidRaw !== null && $pidRaw !== '') {
                    $canonical = $canonicalByLineKey[(string) $pidRaw] ?? null;
                }
                if ($canonical === null) {
                    $code = $line['productCode'] ?? $line['code'] ?? null;
                    if ($code !== null && $code !== '') {
                        $canonical = $canonicalByCode[(string) $code] ?? null;
                    }
                }
                if ($canonical === null) {
                    continue;
                }
                if (isset($cancelledSaleIds[$canonical]) && in_array((string) $row->mongo_id, $cancelledSaleIds[$canonical], true)) {
                    continue;
                }
                if (!isset($map[$canonical]) || $completedAt->greaterThan($map[$canonical])) {
                    $map[$canonical] = $completedAt;
                }
            }
        }

        return $map;
    }

    /**
     * Build a map of product mongo_id => cancelled sale payment mongo_ids.
     */
    private function cancelledSalePaymentIdsByProductMongoId($products): array
    {
        if (!Schema::hasColumn('product_logs', 'source_type') || !Schema::hasColumn('product_logs', 'source_mongo_id')) {
            return [];
        }

        $byLocalId = $products->filter(fn (Product $product): bool => filled($product->mongo_id))
            ->mapWithKeys(fn (Product $product): array => [(int) $product->id => (string) $product->mongo_id])
            ->all();
        $mongoIds = array_values($byLocalId);
        if (empty($mongoIds)) {
            return [];
        }

        $hasProductId = Schema::hasColumn('product_logs', 'product_id');
        $hasProductMongoId = Schema::hasColumn('product_logs', 'product_mongo_id');
        if (!$hasProductId && !$hasProductMongoId) {
            return [];
        }

        $rows = \App\Models\MirrorRecord::query()
            ->from('product_logs')
            ->where('source_type', 'SalePaymentCancel')
            ->whereNotNull('source_mongo_id')
            ->where(function ($query) use ($byLocalId, $mongoIds, $hasProductId, $hasProductMongoId): void {
                if ($hasProductMongoId) {
                    $query->whereIn('product_mongo_id', $mongoIds);
                }
                if ($hasProductId) {
                    $method = $hasProductMongoId ? 'orWhereIn' : 'whereIn';
                    $query->{$method}('product_id', array_keys($byLocalId));
                }
            })
            ->get(array_values(array_filter([
                $hasProductId ? 'product_id' : null,
                $hasProductMongoId ? 'product_mongo_id' : null,
                'source_mongo_id',
            ])));

        $map = [];
        foreach ($rows as $row) {
            $productMongoId = $row->product_mongo_id ?: ($byLocalId[(int) $row->product_id] ?? null);
            $salePaymentId = $row->source_mongo_id;
            if (!$productMongoId || !$salePaymentId) {
                continue;
            }
            $map[(string) $productMongoId][] = (string) $salePaymentId;
        }

        foreach ($map as $productMongoId => $salePaymentIds) {
            $map[$productMongoId] = array_values(array_unique($salePaymentIds));
        }

        return $map;
    }

    /**
     * Build a map of product_id => [first => Carbon, last => Carbon] from inventory_products.
     * When $branchIdFilter provided, only consider transactions for that branch (using branch_id column).
     */
    private function inventoryTransactionDatesByProductId($products, $branchIdFilter = null): array
    {
        $hasProductId = Schema::hasColumn('inventory_products', 'product_id');
        $hasProductMongoId = Schema::hasColumn('inventory_products', 'product_mongo_id');
        $hasProductCode = Schema::hasColumn('inventory_products', 'product_code');
        $hasBranchId = Schema::hasColumn('inventory_products', 'branch_id');
        $hasBranchMongoId = Schema::hasColumn('inventory_products', 'branch_mongo_id');

        $productIds = $products->pluck('id')->map(fn ($id): int => (int) $id)->unique()->values()->all();
        $productMongoIds = $products->pluck('mongo_id')->filter()->map(fn ($id): string => (string) $id)->unique()->values()->all();
        $productCodes = $products->pluck('code')->filter()->unique()->values()->all();
        // Legacy/import rows may store local PK (as string/int) in product_mongo_id instead of hex mongo_id.
        $localIdKeys = array_map('strval', $productIds);
        if (
            (!$hasProductId || empty($productIds))
            && (!$hasProductMongoId || (empty($productMongoIds) && empty($localIdKeys)))
            && (!$hasProductCode || empty($productCodes))
        ) {
            return [];
        }

        $byMongoId = $products->filter(fn (Product $product): bool => filled($product->mongo_id))
            ->mapWithKeys(fn (Product $product): array => [(string) $product->mongo_id => (int) $product->id])
            ->all();
        $byLocalId = array_fill_keys($productIds, true);
        $byCode = $products->filter(fn (Product $product): bool => filled($product->code))
            ->mapWithKeys(fn (Product $product): array => [(string) $product->code => (int) $product->id])
            ->all();
        $branchMongoIdFilter = null;
        if ($branchIdFilter && !$hasBranchId && $hasBranchMongoId) {
            $branchMongoIdFilter = \App\Models\Branch::query()
                ->whereKey($branchIdFilter)
                ->value('mongo_id');
        }

        $rows = \App\Models\MirrorRecord::query()
            ->from('inventory_products')
            ->where(function ($query) use ($productIds, $productMongoIds, $productCodes, $localIdKeys, $hasProductId, $hasProductMongoId, $hasProductCode): void {
                $hasCondition = false;
                if ($hasProductId && !empty($productIds)) {
                    $query->whereIn('product_id', $productIds);
                    $hasCondition = true;
                }
                if ($hasProductMongoId && !empty($productMongoIds)) {
                    $method = $hasCondition ? 'orWhereIn' : 'whereIn';
                    $query->{$method}('product_mongo_id', $productMongoIds);
                    $hasCondition = true;
                }
                // Also match product_mongo_id holding local PK strings from import.
                if ($hasProductMongoId && !empty($localIdKeys)) {
                    $method = $hasCondition ? 'orWhereIn' : 'whereIn';
                    $query->{$method}('product_mongo_id', $localIdKeys);
                    $hasCondition = true;
                }
                if ($hasProductCode && !empty($productCodes)) {
                    $method = $hasCondition ? 'orWhereIn' : 'whereIn';
                    $query->{$method}('product_code', $productCodes);
                }
            })
            ->whereNotNull('business_date')
            ->when($branchIdFilter && $hasBranchId, fn ($q) => $q->where('branch_id', $branchIdFilter))
            ->when($branchIdFilter && !$hasBranchId && $branchMongoIdFilter, fn ($q) => $q->where('branch_mongo_id', $branchMongoIdFilter))
            ->get(array_values(array_filter([
                $hasProductId ? 'product_id' : null,
                $hasProductMongoId ? 'product_mongo_id' : null,
                $hasProductCode ? 'product_code' : null,
                $hasBranchId ? 'branch_id' : null,
                $hasBranchMongoId ? 'branch_mongo_id' : null,
                'business_date',
            ])));

        $map = [];
        foreach ($rows as $row) {
            $date = \Illuminate\Support\Carbon::parse($row->business_date);
            $pid = isset($row->product_id) && $row->product_id ? (int) $row->product_id : null;
            if (!$pid && isset($row->product_mongo_id) && $row->product_mongo_id !== null && $row->product_mongo_id !== '') {
                $pm = (string) $row->product_mongo_id;
                // Prefer true mongo_id match; legacy/import rows often store local PK in product_mongo_id.
                $pid = $byMongoId[$pm] ?? null;
                if (!$pid && ctype_digit($pm) && isset($byLocalId[(int) $pm])) {
                    $pid = (int) $pm;
                }
            }
            if (!$pid && isset($row->product_code) && $row->product_code) {
                $pid = $byCode[(string) $row->product_code] ?? null;
            }
            if (!$pid) {
                continue;
            }
            if (!isset($map[$pid])) {
                $map[$pid] = ['first' => $date, 'last' => $date];
                continue;
            }
            if ($date->lessThan($map[$pid]['first'])) {
                $map[$pid]['first'] = $date;
            }
            if ($date->greaterThan($map[$pid]['last'])) {
                $map[$pid]['last'] = $date;
            }
        }

        return $map;
    }

    private function storageDurationShape(Product $product, int $thresholdDays, array $lastSoldMap = [], array $txnMap = [], $branchIdFilter = null): array
    {
        $created = $product->created_at ?: now();
        $now = now();

        $txn = $txnMap[(int) $product->id] ?? null;
        $firstImport = $txn['first'] ?? null;
        $lastTxn = $txn['last'] ?? null;

        $firstDate = $firstImport ?: $created;
        $lastDate = $lastTxn ?: ($product->updated_at ?: $created);

        $today = $now->copy()->startOfDay();
        $daysFromStart = max(0, (int) $firstDate->copy()->startOfDay()->diffInDays($today));
        $daysFromLast = max(0, (int) $lastDate->copy()->startOfDay()->diffInDays($today));

        $mongoId = $product->mongo_id;
        // Map is keyed by mongo_id when present; also accept local id for products without mongo_id.
        $lastSold = $lastSoldMap[(string) $mongoId] ?? $lastSoldMap[(string) $product->id] ?? null;
        $lastSoldDate = $lastSold ? $lastSold->toIso8601String() : null;
        $daysFromLastSold = $lastSold ? max(0, (int) $lastSold->copy()->startOfDay()->diffInDays($today)) : null;

        $slowThreshold = max(30, (int) floor($thresholdDays / 2));

        if ($daysFromLastSold === null && $daysFromStart >= $thresholdDays) {
            $status = 'unsold_long';
        } elseif ($daysFromLastSold !== null && $daysFromLastSold >= $slowThreshold) {
            $status = 'slow_selling';
        } elseif ($daysFromLastSold === null && $daysFromStart >= $slowThreshold) {
            // Imported a while ago and never sold yet -> treat as slow selling risk.
            $status = 'slow_selling';
        } else {
            $status = 'normal';
        }

        $branchName = null;
        $displayQty = (float) $product->qty;
        $branchQty = null;
        if ($product->relationLoaded('stocks')) {
            $stocks = $product->stocks;
            if ($branchIdFilter !== null && $branchIdFilter !== '') {
                $matched = $stocks->firstWhere('branch_id', (int) $branchIdFilter);
                $branchName = $matched?->branch?->name;
                if ($matched) {
                    $branchQty = (float) $matched->qty;
                    $displayQty = $branchQty;
                }
            }
            $branchName = $branchName ?? $stocks->first()?->branch?->name;
        }

        return [
            '_id' => (string) $product->id,
            'id' => $product->id,
            'code' => $product->code,
            'name' => $product->name,
            'supplierName' => $product->supplier_name,
            'categoryName' => $product->category_name ?? $product->category?->name,
            'cost' => (float) $product->cost,
            'price' => (float) $product->price,
            'clearancePrice' => (float) $product->clearance_price,
            'clearanceActive' => (bool) $product->clearance_active,
            'clearanceNote' => $product->clearance_note,
            'qty' => $displayQty,
            'globalQty' => (float) $product->qty,
            'branchQty' => $branchQty,
            'firstTransactionDate' => optional($firstDate)->toISOString(),
            'lastTransactionDate' => optional($lastDate)->toISOString(),
            'lastSoldDate' => $lastSoldDate,
            'daysFromStart' => $daysFromStart,
            'daysFromLast' => $daysFromLast,
            'daysFromLastSold' => $daysFromLastSold,
            'status' => $status,
            'statusLabel' => $status === 'unsold_long' ? 'Tồn lâu' : ($status === 'slow_selling' ? 'Bán chậm' : 'Bình thường'),
            'branchName' => $branchName,
        ];
    }

    public function placeholders(): JsonResponse
    {
        return response()->json([
            'data' => Product::query()
                ->where('status', 'MIGRATION_PLACEHOLDER')
                ->orderBy('code')
                ->get(['id', 'mongo_id', 'name', 'code', 'status', 'note', 'extra']),
        ]);
    }


    private function productDeleteBlockingReason(Product $product): ?string
    {
        if ($product->stocks()->where(function ($query): void {
            $query->where('qty', '>', 0)->orWhere('locked_quantity', '>', 0);
        })->exists()) {
            return 'Không thể xóa sản phẩm đang còn tồn kho hoặc tồn khóa. Hãy đưa tồn về 0 trước.';
        }

        $mirrorChecks = [
            ['sale_payments', 'items'],
            ['product_refunds', 'items'],
            ['inventory_vouchers', 'product_id'],
            ['inventory_products', 'product_id'],
            ['warehouse_transfers', 'lines'],
            ['product_logs', 'product_id'],
        ];

        $productId = (int) $product->id;
        $mongoId = filled($product->mongo_id) ? (string) $product->mongo_id : null;
        $code = trim((string) $product->code);

        foreach ($mirrorChecks as [$table, $column]) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $base = (new MirrorRecord())->forTable($table)->newQuery();
            $hasProductId = Schema::hasColumn($table, 'product_id');
            $hasProductMongoId = Schema::hasColumn($table, 'product_mongo_id');
            $hasPayload = Schema::hasColumn($table, 'payload');

            // Fresh query each check — never stack where clauses on a reused builder.
            if ($column === 'product_id' && $hasProductId && (clone $base)->where('product_id', $productId)->exists()) {
                return 'Không thể xóa sản phẩm đã có chứng từ/log nghiệp vụ liên quan.';
            }

            // Skip null mongo_id: `where(product_mongo_id, null)` would match every row with NULL
            // and falsely block delete for local-created products without mongo_id.
            if ($mongoId !== null && $hasProductMongoId && (clone $base)->where('product_mongo_id', $mongoId)->exists()) {
                return 'Không thể xóa sản phẩm đã có chứng từ/log nghiệp vụ liên quan.';
            }

            if ($column !== 'product_id' && $code !== '' && $hasPayload && (clone $base)->where('payload', 'like', '%'.$code.'%')->exists()) {
                return 'Không thể xóa sản phẩm đã có chứng từ/log nghiệp vụ liên quan.';
            }
        }

        return null;
    }

    /**
     * Resolve caller from Authorization: Bearer local-laravel-token-{userId}.
     */
    private function resolveAuthUser(Request $request): ?User
    {
        return LocalToken::resolve($request);
    }

    private function isActiveUser(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if (($user->status === 'LOCKED') || ($user->is_active === false)) {
            return false;
        }

        return true;
    }

    private function isAdminUser(?User $user): bool
    {
        if (! $this->isActiveUser($user)) {
            return false;
        }

        return (bool) $user->is_root_owner || strtoupper((string) $user->role) === 'ADMIN';
    }

    /**
     * Any logged-in active user (ADMIN / EMPLOYEE / …) may read sensitive reports.
     */
    private function requireAuthenticatedUser(Request $request): User
    {
        $user = $this->resolveAuthUser($request);
        if (! $this->isActiveUser($user)) {
            abort(401, 'Unauthenticated.');
        }

        return $user;
    }

    /**
     * Product update/delete require ADMIN or root owner with a valid login token.
     */
    private function requireAdminUser(Request $request): User
    {
        $user = $this->resolveAuthUser($request);
        if (! $this->isAdminUser($user)) {
            abort(403, 'Chỉ quản trị viên (ADMIN) mới được sửa hoặc xóa sản phẩm.');
        }

        return $user;
    }

    private function writeLocalStockAdjustmentLog(ProductBranchStock $stock, float $beforeQty, float $nextQty): void
    {
        if (abs($beforeQty - $nextQty) < 0.0001) {
            return;
        }

        $product = $stock->product;
        $branch = $stock->branch;
        $mongoId = 'localstock'.str_pad((string) (int) (microtime(true) * 1000), 14, '0', STR_PAD_LEFT);

        (new MirrorRecord())->forTable('product_logs')->newQuery()->create([
            'mongo_id' => substr($mongoId, 0, 24),
            'code' => 'LOCAL-STOCK-'.$stock->id.'-'.now()->format('YmdHis'),
            'name' => 'Local stock adjustment',
            'status' => 'LOCAL_ADJUSTMENT',
            'type' => 'stock_adjustment',
            'amount' => $nextQty - $beforeQty,
            'branch_mongo_id' => $branch?->mongo_id,
            'product_mongo_id' => $product?->mongo_id,
            'business_date' => now(),
            'product_id' => $product?->id,
            'source_type' => 'LOCAL_STOCK_UPDATE',
            'source_mongo_id' => null,
            'value_before' => $beforeQty,
            'value_after' => $nextQty,
            'amount_before' => $beforeQty,
            'amount_after' => $nextQty,
            'payload' => [
                'source' => 'Laravel local stock update',
                'stockId' => $stock->id,
                'productId' => $product?->id,
                'productCode' => $product?->code,
                'productName' => $product?->name,
                'branchId' => $branch?->id,
                'branchName' => $branch?->name,
                'beforeQty' => $beforeQty,
                'afterQty' => $nextQty,
            ],
        ]);
    }

    private function validatedPayload(Request $request, ?Product $product = null): array
    {
        $isUpdate = $product !== null;
        $id = $product?->id;

        // Create: name required, mapper applies create defaults.
        // Update: only fields present in the request are validated and written (partial PATCH safe).
        $rules = [
            'code' => [$isUpdate ? 'sometimes' : 'nullable', 'string', 'max:255', Rule::unique('products', 'code')->ignore($id)],
            'barcode' => [$isUpdate ? 'sometimes' : 'nullable', 'string', 'max:255', Rule::unique('products', 'barcode')->ignore($id)],
            'type' => [$isUpdate ? 'sometimes' : 'nullable', Rule::in(['product', 'service', 'combo'])],
            'name' => $isUpdate
                ? ['sometimes', 'required', 'string', 'max:255']
                : ['required', 'string', 'max:255'],
            'unit' => [$isUpdate ? 'sometimes' : 'nullable', 'string', 'max:255'],
            'status' => [$isUpdate ? 'sometimes' : 'nullable', 'string', 'max:255'],
            'categoryId' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'integer', 'exists:categories,id'],
            'categoryName' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string', 'max:255'],
            'cost' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'price' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'wholesalePrice' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'clearancePrice' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'clearanceActive' => [$isUpdate ? 'sometimes' : 'nullable', 'boolean'],
            'clearanceNote' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string'],
            'clearanceStartedAt' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'date'],
            'weight' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'weightType' => [$isUpdate ? 'sometimes' : 'nullable', Rule::in(['gram', 'kg'])],
            'allowsSale' => [$isUpdate ? 'sometimes' : 'nullable', 'boolean'],
            'minQuantity' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'maxQuantity' => [$isUpdate ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'description' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string'],
            'note' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string'],
            'origin' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string', 'max:255'],
            'color' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string', 'max:255'],
            'size' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string', 'max:255'],
            'parentCode' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string', 'max:255'],
            'parentName' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'string', 'max:255'],
            'initialStocks' => [$isUpdate ? 'sometimes' : 'nullable', 'nullable', 'array'],
            'initialStocks.*.warehouseId' => ['required_with:initialStocks', 'integer', 'exists:branches,id'],
            'initialStocks.*.quantity' => ['required_with:initialStocks', 'numeric', 'min:0'],
        ];

        $data = $request->validate($rules);

        if ($isUpdate) {
            return $this->mapUpdatePayload($request, $data);
        }

        return $this->mapCreatePayload($data);
    }

    /**
     * Full create payload with defaults (POST /products).
     */
    private function mapCreatePayload(array $data): array
    {
        $category = !empty($data['categoryId']) ? Category::query()->find($data['categoryId']) : null;

        return [
            'code' => trim((string) ($data['code'] ?? '')),
            'barcode' => trim((string) ($data['barcode'] ?? '')) ?: null,
            'type' => $data['type'] ?? 'product',
            'name' => trim((string) $data['name']),
            'unit' => $data['unit'] ?? null,
            'status' => $data['status'] ?? 'Moi',
            'category_id' => $data['categoryId'] ?? null,
            'category_name' => $data['categoryName'] ?? $category?->name,
            'cost' => $data['cost'] ?? 0,
            'price' => $data['price'] ?? 0,
            'wholesale_price' => $data['wholesalePrice'] ?? 0,
            'clearance_price' => $data['clearancePrice'] ?? 0,
            'clearance_active' => $data['clearanceActive'] ?? false,
            'clearance_note' => $data['clearanceNote'] ?? null,
            'clearance_started_at' => array_key_exists('clearanceStartedAt', $data)
                ? ($data['clearanceStartedAt'] ?: null)
                : null,
            'weight' => $data['weight'] ?? null,
            'weight_type' => $data['weightType'] ?? 'gram',
            'allows_sale' => $data['allowsSale'] ?? true,
            'min_quantity' => $data['minQuantity'] ?? 0,
            'max_quantity' => $data['maxQuantity'] ?? 999999999,
            'description' => $data['description'] ?? null,
            'note' => $data['note'] ?? null,
            'origin' => $data['origin'] ?? null,
            'color' => $data['color'] ?? null,
            'size' => $data['size'] ?? null,
            'parent_code' => $data['parentCode'] ?? null,
            'parent_name' => $data['parentName'] ?? null,
            'initialStocks' => $data['initialStocks'] ?? [],
        ];
    }

    /**
     * Partial update payload: only keys present in the HTTP request body are mapped.
     * Does not apply create defaults (avoids wiping fields on PATCH {status}).
     */
    private function mapUpdatePayload(Request $request, array $data): array
    {
        $payload = [];

        if ($request->exists('code')) {
            $payload['code'] = trim((string) ($data['code'] ?? ''));
        }
        if ($request->exists('barcode')) {
            $payload['barcode'] = trim((string) ($data['barcode'] ?? '')) ?: null;
        }
        if ($request->exists('type')) {
            $payload['type'] = $data['type'] ?? 'product';
        }
        if ($request->exists('name')) {
            $payload['name'] = trim((string) ($data['name'] ?? ''));
        }
        if ($request->exists('unit')) {
            $payload['unit'] = $data['unit'] ?? null;
        }
        if ($request->exists('status')) {
            $payload['status'] = $data['status'] ?? null;
        }
        if ($request->exists('categoryId') || $request->exists('categoryName')) {
            $category = !empty($data['categoryId']) ? Category::query()->find($data['categoryId']) : null;
            if ($request->exists('categoryId')) {
                $payload['category_id'] = $data['categoryId'] ?? null;
            }
            if ($request->exists('categoryName') || $request->exists('categoryId')) {
                $payload['category_name'] = $data['categoryName'] ?? $category?->name;
            }
        }
        if ($request->exists('cost')) {
            $payload['cost'] = $data['cost'] ?? 0;
        }
        if ($request->exists('price')) {
            $payload['price'] = $data['price'] ?? 0;
        }
        if ($request->exists('wholesalePrice')) {
            $payload['wholesale_price'] = $data['wholesalePrice'] ?? 0;
        }
        if ($request->exists('clearancePrice')) {
            $payload['clearance_price'] = $data['clearancePrice'] ?? 0;
        }
        if ($request->exists('clearanceActive')) {
            $payload['clearance_active'] = $data['clearanceActive'] ?? false;
        }
        if ($request->exists('clearanceNote')) {
            $payload['clearance_note'] = $data['clearanceNote'] ?? null;
        }
        if ($request->exists('clearanceStartedAt')) {
            $payload['clearance_started_at'] = $data['clearanceStartedAt'] ?? null;
        }
        if ($request->exists('weight')) {
            $payload['weight'] = $data['weight'] ?? null;
        }
        if ($request->exists('weightType')) {
            $payload['weight_type'] = $data['weightType'] ?? 'gram';
        }
        if ($request->exists('allowsSale')) {
            $payload['allows_sale'] = $data['allowsSale'] ?? true;
        }
        if ($request->exists('minQuantity')) {
            $payload['min_quantity'] = $data['minQuantity'] ?? 0;
        }
        if ($request->exists('maxQuantity')) {
            $payload['max_quantity'] = $data['maxQuantity'] ?? 999999999;
        }
        if ($request->exists('description')) {
            $payload['description'] = $data['description'] ?? null;
        }
        if ($request->exists('note')) {
            $payload['note'] = $data['note'] ?? null;
        }
        if ($request->exists('origin')) {
            $payload['origin'] = $data['origin'] ?? null;
        }
        if ($request->exists('color')) {
            $payload['color'] = $data['color'] ?? null;
        }
        if ($request->exists('size')) {
            $payload['size'] = $data['size'] ?? null;
        }
        if ($request->exists('parentCode')) {
            $payload['parent_code'] = $data['parentCode'] ?? null;
        }
        if ($request->exists('parentName')) {
            $payload['parent_name'] = $data['parentName'] ?? null;
        }
        if ($request->exists('initialStocks')) {
            $payload['initialStocks'] = $data['initialStocks'] ?? [];
        }

        return $payload;
    }

    private function syncInitialStocks(Product $product, array $stocks): void
    {
        foreach ($stocks as $line) {
            ProductBranchStock::query()->updateOrCreate(
                ['product_id' => $product->id, 'branch_id' => (int) $line['warehouseId']],
                ['qty' => (float) $line['quantity'], 'locked_quantity' => 0, 'min_quantity' => 0, 'max_quantity' => 999999999]
            );
        }
    }

    /**
     * Map FE branch identifiers (local id, mongo_id, code) to product_branch_stocks.branch_id.
     * Warehouse transfer meta returns warehouses.value = mongo_id; inventories must accept that.
     */
    private function resolveBranchLocalId(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = is_string($value) ? trim($value) : $value;
        if ($raw === '' || $raw === null) {
            return null;
        }

        $branch = Branch::query()
            ->where(function ($query) use ($raw): void {
                if (is_numeric($raw)) {
                    $query->where('id', (int) $raw);
                }
                $query->orWhere('mongo_id', (string) $raw)
                    ->orWhere('code', (string) $raw);
            })
            ->first();

        return $branch?->id;
    }

    private function refreshProductQty(Product $product): void
    {
        $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
    }

    private function addStockForBranch(Product $product, int $branchId, float $qty): void
    {
        if ($qty <= 0) return;
        $stock = ProductBranchStock::query()->where('product_id', $product->id)->where('branch_id', $branchId)->first();
        if ($stock) {
            $stock->qty = (float) $stock->qty + $qty;
            $stock->save();
        } else {
            ProductBranchStock::query()->create([
                'product_id' => $product->id,
                'branch_id' => $branchId,
                'qty' => $qty,
                'locked_quantity' => 0,
                'min_quantity' => 0,
                'max_quantity' => 999999999,
            ]);
        }
    }

    private function nextCode(): string
    {
        return 'SP'.now()->format('ymdHis').str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    }

    private function nextBarcode(): string
    {
        return '20'.now()->format('ymdHis').str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    }

    private function duplicateResponse(QueryException $error): JsonResponse
    {
        if (str_contains($error->getMessage(), 'UNIQUE') || (int) ($error->errorInfo[1] ?? 0) === 1062) {
            return response()->json(['message' => 'Ma san pham hoac ma vach da ton tai.'], 409);
        }

        throw $error;
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class InventoryAuditController extends Controller
{
    private const PAGE_LIMIT = 20;
    private const MAX_LIMIT = 5000;

    private const AUDIT_TYPES = [
        ['value' => 'FULL', 'label' => 'Toàn kho'],
        ['value' => 'BY_PRODUCT', 'label' => 'Theo sản phẩm'],
    ];

    private const STATUSES = [
        ['value' => 'DRAFT', 'label' => 'Nháp'],
        ['value' => 'COUNTING', 'label' => 'Đang kiểm'],
        ['value' => 'SUBMITTED', 'label' => 'Đã nộp'],
        ['value' => 'RECONCILED', 'label' => 'Đã bù trừ'],
        ['value' => 'CANCELLED', 'label' => 'Đã hủy'],
    ];

    private const RECONCILIATION_STATUSES = [
        ['value' => 'PENDING', 'label' => 'Chưa bù trừ'],
        ['value' => 'RECONCILED', 'label' => 'Đã bù trừ'],
        ['value' => 'REVERSED', 'label' => 'Đã đảo bù trừ'],
    ];

    private const VARIANCE_REASONS = [
        ['value' => 'BROKEN', 'label' => 'Hỏng/vỡ'],
        ['value' => 'EXPIRED', 'label' => 'Hết hạn'],
        ['value' => 'LOSS', 'label' => 'Thất thoát'],
        ['value' => 'FOUND', 'label' => 'Tìm thấy/thừa thực tế'],
        ['value' => 'DATA_ERROR', 'label' => 'Sai dữ liệu trước đó'],
        ['value' => 'OTHER', 'label' => 'Khác'],
    ];

    public function meta(): JsonResponse
    {
        $context = $this->resolveCallerContext(request());
        $activeBranches = Branch::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'mongo_id', 'name', 'code']);

        // Admin/root: all active warehouses. Employee: assigned / default / branch only.
        $scopedBranches = $activeBranches;
        if (!$context['isAdminOrRoot'] && !empty($context['localBranchIds'])) {
            $allowed = array_flip($context['localBranchIds']);
            $scopedBranches = $activeBranches->filter(
                fn (Branch $branch): bool => isset($allowed[(int) $branch->id])
            )->values();
        } elseif (!$context['isAdminOrRoot'] && empty($context['localBranchIds']) && $context['user'] !== null) {
            $scopedBranches = collect();
        }

        $warehouses = $scopedBranches
            ->map(fn (Branch $branch): array => [
                'value' => (string) $branch->id,
                'label' => $branch->name,
                'code' => $branch->code,
            ])
            ->values();

        $userWarehouseIds = $scopedBranches
            ->map(fn (Branch $branch): string => (string) $branch->id)
            ->values()
            ->all();

        return response()->json([
            'role' => $context['role'],
            'isRootOwner' => $context['isRootOwner'],
            'isAdmin' => $context['isAdminOrRoot'],
            'userWarehouseIds' => $userWarehouseIds,
            'warehouses' => $warehouses,
            'auditTypes' => self::AUDIT_TYPES,
            'statuses' => self::STATUSES,
            'reconciliationStatuses' => self::RECONCILIATION_STATUSES,
            'varianceReasons' => self::VARIANCE_REASONS,
        ]);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $query = $this->auditQuery($request);

        $audits = $query->get();
        $itemCount = 0;
        $countedItemCount = 0;
        $totalVarianceQuantity = 0;
        $totalIncreaseQuantity = 0;
        $totalDecreaseQuantity = 0;
        $byStatus = [];
        foreach (self::STATUSES as $entry) {
            $byStatus[$entry['value']] = ['status' => $entry['value'], 'label' => $entry['label'], 'count' => 0];
        }

        foreach ($audits as $audit) {
            $payload = is_array($audit->payload) ? $audit->payload : [];
            $status = $this->auditStatus($audit, $payload);
            if (isset($byStatus[$status])) {
                $byStatus[$status]['count']++;
            }
            $items = $this->itemsOf($audit);
            foreach ($items as $line) {
                $itemCount++;
                $system = (float) ($line['systemQuantitySnapshot'] ?? $line['system_quantity'] ?? $line['stock'] ?? 0);
                $physical = $line['physicalQuantity'] ?? $line['actual_stock'] ?? $line['actualStock'] ?? null;
                if ($physical !== null && $physical !== '') {
                    $countedItemCount++;
                    $variance = (float) ($line['varianceQuantity'] ?? $line['difference'] ?? 0);
                    $totalVarianceQuantity += $variance;
                    if ($variance > 0) {
                        $totalIncreaseQuantity += $variance;
                    } elseif ($variance < 0) {
                        $totalDecreaseQuantity += abs($variance);
                    }
                }
            }
        }

        return response()->json([
            'totalAudits' => $audits->count(),
            'itemCount' => $itemCount,
            'countedItemCount' => $countedItemCount,
            'totalVarianceQuantity' => $totalVarianceQuantity,
            'totalIncreaseQuantity' => $totalIncreaseQuantity,
            'totalDecreaseQuantity' => $totalDecreaseQuantity,
            'byStatus' => array_values($byStatus),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = (int) min(max((int) $request->query('limit', self::PAGE_LIMIT), 1), self::MAX_LIMIT);
        $page = max((int) $request->query('page', 1), 1);
        $query = $this->auditQuery($request);
        $total = (clone $query)->count();
        $records = $query->orderByDesc('business_date')->orderByDesc('id')
            ->skip(($page - 1) * $perPage)->limit($perPage)->get();
        $items = $records->map(fn (MirrorRecord $record): array => $this->auditRow($record))->all();

        return response()->json($this->paginated($items, $total, $page, $perPage));
    }

    public function indexItems(Request $request): JsonResponse
    {
        $perPage = (int) min(max((int) $request->query('limit', self::PAGE_LIMIT), 1), self::MAX_LIMIT);
        $page = max((int) $request->query('page', 1), 1);
        $query = $this->itemQuery($request);
        $total = (clone $query)->count();
        $records = $query->orderByDesc('business_date')->orderByDesc('id')
            ->skip(($page - 1) * $perPage)->limit($perPage)->get();
        $items = $records->map(fn (MirrorRecord $record): array => $this->itemRow($record))->all();

        return response()->json($this->paginated($items, $total, $page, $perPage));
    }

    public function show(string $id): JsonResponse
    {
        $record = $this->findAudit($id);
        $payload = is_array($record->payload) ? $record->payload : [];
        $items = $this->itemsOf($record);

        return response()->json(array_merge($this->auditRow($record), [
            'blindMode' => (bool) ($payload['blindMode'] ?? false),
            'doubleCount' => (bool) ($payload['doubleCount'] ?? false),
            'snapshotAt' => $payload['snapshotAt'] ?? null,
            'items' => array_map(fn (array $line): array => $this->itemDetail($line), $items),
        ]));
    }

    public function suggestions(Request $request): JsonResponse
    {
        $warehouseId = trim((string) $request->query('warehouseId', ''));
        $limit = (int) min(max((int) $request->query('limit', 6), 1), 50);
        $query = (new MirrorRecord())->forTable('inventory_check_products')->newQuery();
        $columns = collect(Schema::getColumnListing('inventory_check_products'))->flip();
        if ($warehouseId !== '') {
            $branch = $this->branch($warehouseId);
            if ($branch) {
                if ($columns->has('branch_id')) {
                    $query->where('branch_id', $branch->id);
                } elseif ($columns->has('branch_mongo_id')) {
                    $query->where('branch_mongo_id', $branch->mongo_id);
                } else {
                    $query->where(function ($q) use ($branch) {
                        $q->where('payload->warehouseId', (string) $branch->id)
                          ->orWhere('payload->warehouseId', $branch->mongo_id)
                          ->orWhere('payload->warehouse', $branch->name)
                          ->orWhere('payload->warehouseName', $branch->name);
                    });
                }
            }
        }
        $rows = $query->orderByDesc('business_date')->orderByDesc('id')->limit($limit)->get();
        $items = $rows->map(function (MirrorRecord $record): array {
            $payload = is_array($record->payload) ? $record->payload : [];
            $variance = (float) ($payload['difference'] ?? $record->difference ?? 0);

            return [
                'productId' => (string) ($payload['productId'] ?? $payload['product_id'] ?? $record->product_id ?? ''),
                'productCode' => (string) ($payload['productCode'] ?? $payload['product_code'] ?? $record->product_code ?? ''),
                'productName' => (string) ($payload['productName'] ?? $payload['product_name'] ?? $record->product_name ?? ''),
                'currentStock' => (float) ($payload['stock'] ?? 0),
                'lastVarianceQuantity' => $variance,
                'lastAuditAt' => $payload['createdAt'] ?? optional($record->created_at)->toISOString(),
                'reasons' => $variance !== 0 ? ['Từng chênh lệch'] : [],
            ];
        })->all();

        return response()->json(['items' => $items]);
    }

    public function assignableUsers(Request $request): JsonResponse
    {
        $warehouseId = trim((string) $request->query('warehouseId', ''));
        $query = User::query();
        if ($warehouseId !== '') {
            $branch = $this->branch($warehouseId);
            if ($branch) {
                $query->where(fn ($builder) => $builder->where('branch_id', $branch->id)->orWhereNull('branch_id'));
            }
        }
        $items = $query->orderBy('name')->get()->map(fn (User $user): array => [
            'value' => (string) $user->id,
            'label' => $user->name,
            'code' => $user->email,
        ])->values()->all();

        return response()->json(['items' => $items]);
    }

    public function shelves(): JsonResponse
    {
        return response()->json(['items' => []]);
    }

    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $kind = trim((string) $request->query('kind', $request->route('kind', 'audits')));
        $rows = $kind === 'items'
            ? $this->itemQuery($request)->limit(5000)->get()->map(fn (MirrorRecord $record) => $this->itemRow($record))->all()
            : $this->auditQuery($request)->limit(5000)->get()->map(fn (MirrorRecord $record) => $this->auditRow($record))->all();

        return response()->streamDownload(function () use ($kind, $rows): void {
            $out = fopen('php://output', 'w');
            $headers = $kind === 'items'
                ? ['Mã phiếu', 'Ngày', 'Kho', 'Mã SP', 'Tên SP', 'Mã vạch', 'Tồn hệ thống', 'Thực tế', 'Chênh lệch', 'Người đếm']
                : ['Mã phiếu', 'Kho', 'Loại', 'Trạng thái', 'Ngày tạo', 'Người tạo', 'Số SP', 'Chênh lệch'];
            fputcsv($out, $headers);
            foreach ($rows as $row) {
                if ($kind === 'items') {
                    fputcsv($out, [
                        $row['auditCode'], $row['createdAt'], $row['warehouseName'],
                        $row['productCodeSnapshot'], $row['productNameSnapshot'], $row['barcodeSnapshot'],
                        $row['systemQuantitySnapshot'], $row['physicalQuantity'], $row['varianceQuantity'],
                        $row['countedByName'],
                    ]);
                } else {
                    fputcsv($out, [
                        $row['code'], $row['warehouseName'], $row['auditTypeLabel'],
                        $row['statusLabel'], $row['createdAt'], $row['createdByName'],
                        $row['summary']['itemCount'], $row['summary']['varianceQuantityTotal'],
                    ]);
                }
            }
            fclose($out);
        }, $kind === 'items' ? 'inventory-audit-items.csv' : 'inventory-audits.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function auditQuery(Request $request)
    {
        $query = (new MirrorRecord())->forTable('inventory_checks')->newQuery();
        $columns = collect(Schema::getColumnListing('inventory_checks'))->flip();

        if ($warehouseId = trim((string) $request->query('warehouseId', ''))) {
            $branch = $this->branch($warehouseId);
            if ($branch) {
                if ($columns->has('branch_id')) {
                    $query->where('branch_id', $branch->id);
                } elseif ($columns->has('branch_mongo_id')) {
                    $query->where('branch_mongo_id', $branch->mongo_id);
                } else {
                    $query->where(function ($q) use ($branch) {
                        $q->where('payload->warehouseId', (string) $branch->id)
                          ->orWhere('payload->warehouseId', $branch->mongo_id)
                          ->orWhere('payload->warehouse', $branch->name)
                          ->orWhere('payload->warehouseName', $branch->name);
                    });
                }
            }
        }
        if ($reco = trim((string) $request->query('reconciliationStatus', ''))) {
            $upper = strtoupper($reco);
            if ($upper === 'RECONCILED') {
                $query->where('status', 'RECONCILED');
            } elseif ($upper === 'REVERSED') {
                // reversed may be in payload or treated as not reconciled; skip strict for compat
            } else {
                $query->where(function ($q) { $q->whereNull('status')->orWhere('status', '!=', 'RECONCILED'); });
            }
        }
        if ($keyword = trim((string) $request->query('keyword', ''))) {
            $query->where(fn ($builder) => $builder->where('code', 'like', "%{$keyword}%")->orWhere('name', 'like', "%{$keyword}%"));
        }
        if ($auditType = trim((string) $request->query('auditType', ''))) {
            $label = collect(self::AUDIT_TYPES)->firstWhere('value', $auditType)['label'] ?? null;
            $query->where(function ($builder) use ($auditType, $label) {
                $builder->where('type', $auditType)
                    ->orWhere('type', $label)
                    ->orWhere('payload->auditType', $auditType)
                    ->orWhere('payload->type', $auditType)
                    ->orWhere('payload->auditType', 'FULL_WAREHOUSE'); // legacy compat
            });
        }
        if ($note = trim((string) $request->query('note', ''))) {
            $query->where('note', 'like', "%{$note}%");
        }
        if ($createdFrom = trim((string) $request->query('createdFrom', ''))) {
            $from = $this->parseDate($createdFrom);
            if ($from) {
                $query->where($columns->has('business_date') ? 'business_date' : 'created_at', '>=', $from->startOfDay());
            }
        }
        if ($createdTo = trim((string) $request->query('createdTo', ''))) {
            $to = $this->parseDate($createdTo);
            if ($to) {
                $query->where($columns->has('business_date') ? 'business_date' : 'created_at', '<=', $to->endOfDay());
            }
        }

        if ($reconciledFrom = trim((string) $request->query('reconciledFrom', ''))) {
            $from = $this->parseDate($reconciledFrom);
            if ($from) {
                $iso = $from->toISOString();
                $query->where(function ($q) use ($iso) {
                    $q->where('payload->reconciledAt', '>=', $iso)
                      ->orWhere('payload->reconciled_at', '>=', $iso)
                      ->orWhere('payload->reconciledAt', 'like', $from->toDateString() . '%');
                });
            }
        }
        if ($reconciledTo = trim((string) $request->query('reconciledTo', ''))) {
            $to = $this->parseDate($reconciledTo);
            if ($to) {
                $iso = $to->toISOString();
                $query->where(function ($q) use ($iso) {
                    $q->where('payload->reconciledAt', '<=', $iso)
                      ->orWhere('payload->reconciled_at', '<=', $iso)
                      ->orWhere('payload->reconciledAt', 'like', $to->toDateString() . '%');
                });
            }
        }

        if ($status = trim((string) $request->query('status', ''))) {
            $query->where('status', strtoupper($status));
        }

        return $query;
    }

    private function itemQuery(Request $request)
    {
        $query = (new MirrorRecord())->forTable('inventory_check_products')->newQuery();
        $columns = collect(Schema::getColumnListing('inventory_check_products'))->flip();
        if ($warehouseId = trim((string) $request->query('warehouseId', ''))) {
            $branch = $this->branch($warehouseId);
            if ($branch) {
                if ($columns->has('branch_id')) {
                    $query->where('branch_id', $branch->id);
                } elseif ($columns->has('branch_mongo_id')) {
                    $query->where('branch_mongo_id', $branch->mongo_id);
                } else {
                    $query->where(function ($q) use ($branch) {
                        $q->where('payload->warehouseId', (string) $branch->id)
                          ->orWhere('payload->warehouseId', $branch->mongo_id)
                          ->orWhere('payload->warehouse', $branch->name)
                          ->orWhere('payload->warehouseName', $branch->name);
                    });
                }
            }
        }
        if ($auditId = trim((string) $request->query('auditId', ''))) {
            $audit = $this->findAudit($auditId);
            $prodColumns = collect(Schema::getColumnListing('inventory_check_products'))->flip();
            $branchIdForQuery = $audit->branch_id ?? ($audit->branch_mongo_id ?? null);
            $auditKey = (string) ($audit->mongo_id ?: $audit->id);
            $query->where(function ($builder) use ($audit, $prodColumns, $branchIdForQuery, $auditKey): void {
                // Parent code (legacy single-row) or per-line codes "{code}#{index}" + payload.auditId
                if ($audit->code) {
                    $builder->where('code', $audit->code)
                        ->orWhere('code', 'like', $audit->code.'#%')
                        ->orWhere('payload->auditCode', $audit->code);
                }
                $builder->orWhere('payload->auditId', $auditKey);
                if ($audit->mongo_id) {
                    $builder->orWhere('mongo_id', $audit->mongo_id);
                }
                if (($audit->branch_id || $audit->branch_mongo_id) && $audit->business_date) {
                    $builder->orWhere(function ($legacy) use ($audit, $prodColumns, $branchIdForQuery): void {
                        if ($prodColumns->has('branch_id')) {
                            $legacy->where('branch_id', $audit->branch_id);
                        } elseif ($prodColumns->has('branch_mongo_id') && $audit->branch_mongo_id) {
                            $legacy->where('branch_mongo_id', $audit->branch_mongo_id);
                        } elseif ($branchIdForQuery) {
                            $legacy->where('payload->branchId', $branchIdForQuery)
                                   ->orWhere('payload->warehouseId', $branchIdForQuery);
                        }
                        $legacy->whereDate('business_date', $audit->business_date->toDateString())
                            ->where(fn ($emptyCode) => $emptyCode->whereNull('code')->orWhere('code', ''));
                    });
                }
            });
        }
        if ($productKeyword = trim((string) $request->query('productKeyword', ''))) {
            if ($columns->has('product_code')) {
                $query->where(fn ($builder) => $builder
                    ->where('product_code', 'like', "%{$productKeyword}%")
                    ->orWhere('product_name', 'like', "%{$productKeyword}%")
                    ->orWhere('barcode', 'like', "%{$productKeyword}%"));
            } else {
                $kw = $productKeyword;
                $query->where(function ($builder) use ($kw) {
                    $builder->where('payload->productCode', 'like', "%{$kw}%")
                        ->orWhere('payload->productName', 'like', "%{$kw}%")
                        ->orWhere('payload->product_code', 'like', "%{$kw}%")
                        ->orWhere('payload->product_name', 'like', "%{$kw}%")
                        ->orWhere('payload->barcode', 'like', "%{$kw}%");
                });
            }
        }
        if ($createdFrom = trim((string) $request->query('createdFrom', ''))) {
            $from = $this->parseDate($createdFrom);
            if ($from) {
                $query->where('business_date', '>=', $from->startOfDay());
            }
        }
        if ($createdTo = trim((string) $request->query('createdTo', ''))) {
            $to = $this->parseDate($createdTo);
            if ($to) {
                $query->where('business_date', '<=', $to->endOfDay());
            }
        }
        $varianceType = trim((string) $request->query('varianceType', ''));
        if ($varianceType !== '') {
            if ($columns->has('difference')) {
                $query->where('difference', $varianceType === 'SHORTAGE' ? '<' : ($varianceType === 'EXCESS' ? '>' : '='), 0);
            } else {
                $op = $varianceType === 'SHORTAGE' ? '<' : ($varianceType === 'EXCESS' ? '>' : '=');
                $query->where('payload->difference', $op, 0)
                      ->orWhere('payload->varianceQuantity', $op, 0);
                if ($varianceType === 'BALANCED') {
                    $query->orWhereNull('payload->difference')->orWhere('payload->difference', 0);
                }
            }
        }

        return $query;
    }

    private function findAudit(string $id): MirrorRecord
    {
        $query = (new MirrorRecord())->forTable('inventory_checks')->newQuery();
        $record = ctype_digit($id)
            ? $query->where('id', (int) $id)->orWhere('code', $id)->first()
            : $query->where('mongo_id', $id)->orWhere('code', $id)->first();
        abort_if(!$record, 404, 'Không tìm thấy phiếu kiểm kho.');

        return $record;
    }

    private function itemsOf(MirrorRecord $audit): array
    {
        $payload = is_array($audit->payload) ? $audit->payload : [];
        if (isset($payload['items']) && is_array($payload['items'])) {
            return $payload['items'];
        }
        if (isset($payload['lines']) && is_array($payload['lines'])) {
            return $payload['lines'];
        }

        return $this->auditProductQuery($audit)
            ->get()
            ->map(fn (MirrorRecord $record): array => $this->itemPayloadFromRecord($record))
            ->all();
    }

    private function itemPayloadFromRecord(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];

        return array_merge($payload, [
            'product_id' => $payload['product_id'] ?? $payload['productId'] ?? $record->product_id,
            'product_code' => $payload['product_code'] ?? $payload['productCode'] ?? $record->product_code,
            'product_name' => $payload['product_name'] ?? $payload['productName'] ?? $record->product_name,
            'barcode' => $payload['barcode'] ?? $record->barcode,
            'cost' => $payload['cost'] ?? $record->cost,
            'price' => $payload['price'] ?? $record->price,
            'stock' => $payload['stock'] ?? $record->stock,
            'transferring' => $payload['transferring'] ?? $record->transferring,
            'actualStock' => $payload['actualStock'] ?? $payload['actual_stock'] ?? $record->actual_stock,
            'difference' => $payload['difference'] ?? $record->difference,
            'description' => $payload['description'] ?? $record->description,
            'warehouse' => $payload['warehouse'] ?? $record->warehouse_name,
        ]);
    }

    private function auditProductQuery(MirrorRecord $audit)
    {
        $table = 'inventory_check_products';
        $columns = collect(Schema::getColumnListing($table))->flip();
        $branchIdForQuery = $audit->branch_id ?? ($audit->branch_mongo_id ?? null);
        $auditKey = (string) ($audit->mongo_id ?: $audit->id);

        return (new MirrorRecord())->forTable($table)->newQuery()
            ->where(function ($query) use ($audit, $columns, $branchIdForQuery, $auditKey): void {
                if ($audit->code) {
                    $query->where('code', $audit->code)
                        ->orWhere('code', 'like', $audit->code.'#%')
                        ->orWhere('payload->auditCode', $audit->code);
                }
                $query->orWhere('payload->auditId', $auditKey);
                if ($audit->mongo_id) {
                    $query->orWhere('mongo_id', $audit->mongo_id);
                }
                if ($audit->branch_id && $audit->business_date) {
                    $query->orWhere(function ($legacy) use ($audit, $columns, $branchIdForQuery): void {
                        if ($columns->has('branch_id')) {
                            $legacy->where('branch_id', $audit->branch_id);
                        } elseif ($columns->has('branch_mongo_id') && $audit->branch_mongo_id) {
                            $legacy->where('branch_mongo_id', $audit->branch_mongo_id);
                        } elseif ($branchIdForQuery) {
                            $legacy->where('payload->branchId', $branchIdForQuery)
                                   ->orWhere('payload->warehouseId', $branchIdForQuery);
                        }
                        $legacy->whereDate('business_date', $audit->business_date->toDateString())
                            ->where(fn ($emptyCode) => $emptyCode->whereNull('code')->orWhere('code', ''));
                    });
                }
            });
    }

    private function legacyAuditForItem(MirrorRecord $record): ?MirrorRecord
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $auditId = trim((string) ($payload['auditId'] ?? ''));
        if ($auditId !== '') {
            try {
                return $this->findAudit($auditId);
            } catch (\Throwable) {
                // fall through
            }
        }
        $auditCode = trim((string) ($payload['auditCode'] ?? ''));
        $lineCode = (string) ($record->code ?? '');
        // Per-line codes use "{auditCode}#{index}"
        if (str_contains($lineCode, '#')) {
            $auditCode = $auditCode !== '' ? $auditCode : explode('#', $lineCode, 2)[0];
        }
        $lookupCode = $auditCode !== '' ? $auditCode : $lineCode;
        if ($lookupCode !== '') {
            $direct = (new MirrorRecord())->forTable('inventory_checks')->newQuery()
                ->where('code', $lookupCode)
                ->first();
            if ($direct) {
                return $direct;
            }
        }
        $branchIdForQuery = $record->branch_id ?? ($record->branch_mongo_id ?? null);
        if (!$branchIdForQuery || !$record->business_date) {
            return null;
        }

        $chkColumns = collect(Schema::getColumnListing('inventory_checks'))->flip();
        $q = (new MirrorRecord())->forTable('inventory_checks')->newQuery()
            ->whereDate('business_date', $record->business_date->toDateString())
            ->orderByDesc('id');
        if ($chkColumns->has('branch_id') && $record->branch_id) {
            $q->where('branch_id', $record->branch_id);
        } elseif ($chkColumns->has('branch_mongo_id') && $record->branch_mongo_id) {
            $q->where('branch_mongo_id', $record->branch_mongo_id);
        } else {
            $q->where(function ($qq) use ($branchIdForQuery) {
                $qq->where('payload->branchId', $branchIdForQuery)
                   ->orWhere('payload->warehouseId', $branchIdForQuery);
            });
        }
        return $q->first();
    }

    private function auditStatus(MirrorRecord $record, array $payload): string
    {
        $status = strtoupper((string) ($payload['status'] ?? $record->status ?? 'DRAFT'));
        if ($status === '') {
            return 'DRAFT';
        }

        return $status;
    }

    private function auditRow(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $items = $this->itemsOf($record);
        $status = $this->auditStatus($record, $payload);
        $rawAuditType = (string) ($payload['auditType'] ?? $payload['type'] ?? $record->type ?? 'BY_PRODUCT');
        $auditType = $rawAuditType === 'FULL_WAREHOUSE' ? 'FULL' : $rawAuditType;
        $auditLabel = collect(self::AUDIT_TYPES)->firstWhere('value', $auditType)['label'] ?? (string) ($record->type ?? $auditType);
        $statusLabel = collect(self::STATUSES)->firstWhere('value', $status)['label'] ?? $status;
        $warehouseId = (string) ($payload['warehouseId'] ?? $record->branch_id ?? $record->branch_mongo_id ?? '');
        $warehouseName = (string) ($payload['warehouse'] ?? $payload['warehouseName'] ?? $record->warehouse_name ?? '');
        if (!$warehouseName && $warehouseId) {
            $b = $this->branch($warehouseId);
            if ($b) $warehouseName = $b->name ?? '';
        }
        $linkedIds = $payload['linkedInventoryBillIds'] ?? [];
        $linkedCodes = $payload['linkedInventoryBillCodes'] ?? [];
        $mergedInto = $payload['mergedIntoAuditId'] ?? null;

        $caller = $this->resolveCallerContext(request());
        [$summary, $actions] = $this->summaryAndActions($status, $items, $caller['isAdminOrRoot'], (bool) $mergedInto);

        return [
            '_id' => (string) ($record->mongo_id ?: $record->id),
            'id' => (string) $record->id,
            'code' => (string) ($record->code ?? ''),
            'warehouseId' => $warehouseId,
            'warehouseName' => $warehouseName,
            'auditType' => $auditType,
            'auditTypeLabel' => $auditLabel,
            'status' => $status,
            'statusLabel' => $statusLabel,
            'note' => (string) ($payload['note'] ?? $record->note ?? ''),
            'createdAt' => $payload['createdAt'] ?? optional($record->created_at)->toISOString(),
            'updatedAt' => $payload['updatedAt'] ?? optional($record->updated_at)->toISOString(),
            'snapshotAt' => $payload['snapshotAt'] ?? null,
            'createdByName' => (string) ($payload['createdByName'] ?? $payload['creator'] ?? $record->creator ?? ''),
            'submittedByName' => $payload['submittedByName'] ?? null,
            'submittedAt' => $payload['submittedAt'] ?? null,
            'reconciledByName' => $payload['reconciledByName'] ?? null,
            'reconciledAt' => $payload['reconciledAt'] ?? null,
            'linkedInventoryBillId' => $linkedIds[0] ?? null,
            'linkedInventoryBillIds' => $linkedIds,
            'linkedInventoryBillCodes' => $linkedCodes,
            'mergedIntoAuditId' => $mergedInto,
            'blindMode' => (bool) ($payload['blindMode'] ?? false),
            'doubleCount' => (bool) ($payload['doubleCount'] ?? false),
            'canDelete' => $status === 'DRAFT' && !$mergedInto,
            'availableActions' => $actions,
            'summary' => $summary,
        ];
    }

    private function itemRow(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $physical = $payload['actualStock'] ?? $payload['actual_stock'] ?? $record->actual_stock ?? null;
        $audit = $this->legacyAuditForItem($record);

        $warehouseId = (string) ($payload['warehouseId'] ?? $record->branch_id ?? $record->branch_mongo_id ?? '');
        $warehouseName = (string) ($payload['warehouse'] ?? $payload['warehouseName'] ?? $record->warehouse_name ?? '');
        if (!$warehouseName && $warehouseId) {
            $b = $this->branch($warehouseId);
            if ($b) $warehouseName = $b->name ?? '';
        }

        $rawCode = (string) ($payload['auditCode'] ?? $record->code ?: $audit?->code ?: '');
        if (str_contains($rawCode, '#')) {
            $rawCode = explode('#', $rawCode, 2)[0];
        }

        return [
            '_id' => (string) ($record->mongo_id ?: $record->id),
            'auditId' => (string) ($payload['auditId'] ?? ($audit?->mongo_id ?: $audit?->id ?: '')),
            'auditCode' => $rawCode,
            'warehouseId' => $warehouseId,
            'warehouseName' => $warehouseName,
            'createdAt' => $payload['createdAt'] ?? optional($record->business_date)->toISOString() ?? optional($record->created_at)->toISOString(),
            'productId' => (string) ($payload['productId'] ?? $payload['product_id'] ?? $record->product_id ?? ''),
            'productCodeSnapshot' => (string) ($payload['productCode'] ?? $payload['product_code'] ?? $record->product_code ?? ''),
            'barcodeSnapshot' => (string) ($payload['barcode'] ?? $record->barcode ?? ''),
            'productNameSnapshot' => (string) ($payload['productName'] ?? $payload['product_name'] ?? $record->product_name ?? ''),
            'unitSnapshot' => (string) ($payload['unit'] ?? ''),
            'costPriceSnapshot' => (float) ($payload['cost'] ?? $record->cost ?? 0),
            'salePriceSnapshot' => (float) ($payload['price'] ?? $record->price ?? 0),
            'systemQuantitySnapshot' => (float) ($payload['stock'] ?? $payload['systemQuantitySnapshot'] ?? $record->stock ?? 0),
            'inTransitQuantitySnapshot' => (float) ($payload['transferring'] ?? $payload['inTransitQuantitySnapshot'] ?? 0),
            'physicalQuantity' => $physical === null || $physical === '' ? null : (float) $physical,
            'varianceQuantity' => (float) ($payload['difference'] ?? $payload['varianceQuantity'] ?? $record->difference ?? 0),
            'note' => (string) ($payload['description'] ?? $payload['note'] ?? ''),
            'location' => $payload['location'] ?? null,
            'varianceReasonLabel' => $this->varianceReasonLabel($payload['varianceReason'] ?? null),
            'assignedToName' => $payload['assignedToName'] ?? null,
            'countedByName' => $payload['countedByName'] ?? $payload['creator'] ?? null,
            'countedAt' => $payload['countedAt'] ?? null,
        ];
    }

    private function itemDetail(array $line): array
    {
        $physical = $line['physicalQuantity'] ?? $line['actualStock'] ?? $line['actual_stock'] ?? null;

        return [
            'productId' => (string) ($line['productId'] ?? $line['product_id'] ?? ''),
            'productCodeSnapshot' => (string) ($line['productCodeSnapshot'] ?? $line['productCode'] ?? $line['product_code'] ?? ''),
            'barcodeSnapshot' => (string) ($line['barcodeSnapshot'] ?? $line['barcode'] ?? ''),
            'productNameSnapshot' => (string) ($line['productNameSnapshot'] ?? $line['productName'] ?? $line['product_name'] ?? ''),
            'unitSnapshot' => (string) ($line['unitSnapshot'] ?? $line['unit'] ?? ''),
            'costPriceSnapshot' => (float) ($line['costPriceSnapshot'] ?? $line['cost'] ?? $line['cost'] ?? 0),
            'salePriceSnapshot' => (float) ($line['salePriceSnapshot'] ?? $line['price'] ?? $line['salePriceSnapshot'] ?? 0),
            'systemQuantitySnapshot' => (float) ($line['systemQuantitySnapshot'] ?? $line['stock'] ?? $line['systemQuantitySnapshot'] ?? 0),
            'inTransitQuantitySnapshot' => (float) ($line['inTransitQuantitySnapshot'] ?? $line['transferring'] ?? $line['inTransitQuantitySnapshot'] ?? 0),
            'physicalQuantity' => $physical === null || $physical === '' ? null : (float) $physical,
            'physicalQuantity2' => $line['physicalQuantity2'] ?? null,
            'varianceQuantity' => (float) ($line['difference'] ?? $line['varianceQuantity'] ?? 0),
            'location' => $line['location'] ?? null,
            'varianceReason' => $line['varianceReason'] ?? null,
            'varianceReasonLabel' => $this->varianceReasonLabel($line['varianceReason'] ?? null),
            'assignedToId' => $line['assignedToId'] ?? null,
            'assignedToName' => $line['assignedToName'] ?? null,
            'countedByName' => $line['countedByName'] ?? null,
            'countedByName2' => $line['countedByName2'] ?? null,
            'note' => (string) ($line['note'] ?? $line['description'] ?? ''),
        ];
    }

    /**
     * Resolve caller from local-laravel-token-{userId}. No hard-coded ADMIN.
     * Unauthenticated: role GUEST (do not pretend ADMIN).
     *
     * @return array{user: ?User, role: string, isRootOwner: bool, isAdminOrRoot: bool, localBranchIds: array<int>}
     */
    private function resolveCallerContext(Request $request): array
    {
        $authHeader = (string) $request->header('Authorization', '');
        $user = null;
        if (preg_match('/local-laravel-token-(\d+)/', $authHeader, $matches)) {
            $user = User::find((int) $matches[1]);
        }

        if (!$user) {
            return [
                'user' => null,
                'role' => 'GUEST',
                'isRootOwner' => false,
                'isAdminOrRoot' => false,
                'localBranchIds' => [],
            ];
        }

        $isRootOwner = (bool) $user->is_root_owner;
        $roleRaw = strtoupper((string) ($user->role ?: 'EMPLOYEE'));
        $isAdminOrRoot = $isRootOwner || $roleRaw === 'ADMIN';
        $role = $isAdminOrRoot ? 'ADMIN' : ($roleRaw !== '' ? $roleRaw : 'EMPLOYEE');

        $localBranchIds = [];
        if ($user->default_warehouse_id) {
            $localBranchIds[] = (int) $user->default_warehouse_id;
        }
        if ($user->branch_id) {
            $localBranchIds[] = (int) $user->branch_id;
        }
        if (Schema::hasTable('user_warehouse_assignments')) {
            $assigned = DB::table('user_warehouse_assignments')
                ->where('user_id', $user->id)
                ->pluck('branch_id')
                ->map(fn ($v) => (int) $v)
                ->all();
            $localBranchIds = array_merge($localBranchIds, $assigned);
        }
        $localBranchIds = array_values(array_unique(array_filter($localBranchIds)));

        return [
            'user' => $user,
            'role' => $role,
            'isRootOwner' => $isRootOwner,
            'isAdminOrRoot' => $isAdminOrRoot,
            'localBranchIds' => $localBranchIds,
        ];
    }

    private function summaryAndActions(string $status, array $items, bool $isAdminOrRoot = false, bool $mergedInto = false): array
    {
        $summary = [
            'itemCount' => count($items),
            'countedItemCount' => 0,
            'systemQuantityTotal' => 0,
            'inTransitQuantityTotal' => 0,
            'physicalQuantityTotal' => 0,
            'varianceQuantityTotal' => 0,
            'excessItemCount' => 0,
            'shortageItemCount' => 0,
            'zeroVarianceItemCount' => 0,
            'totalIncreaseQuantity' => 0,
            'totalDecreaseQuantity' => 0,
        ];
        foreach ($items as $line) {
            $system = (float) ($line['systemQuantitySnapshot'] ?? $line['system_quantity'] ?? $line['stock'] ?? 0);
            $transit = (float) ($line['inTransitQuantitySnapshot'] ?? $line['transferring'] ?? 0);
            $physical = $line['physicalQuantity'] ?? $line['actualStock'] ?? $line['actual_stock'] ?? null;
            $variance = (float) ($line['varianceQuantity'] ?? $line['difference'] ?? 0);
            $summary['systemQuantityTotal'] += $system;
            $summary['inTransitQuantityTotal'] += $transit;
            if ($physical !== null && $physical !== '') {
                $summary['countedItemCount']++;
                $summary['physicalQuantityTotal'] += (float) $physical;
                $summary['varianceQuantityTotal'] += $variance;
                if ($variance > 0) {
                    $summary['excessItemCount']++;
                    $summary['totalIncreaseQuantity'] += $variance;
                } elseif ($variance < 0) {
                    $summary['shortageItemCount']++;
                    $summary['totalDecreaseQuantity'] += abs($variance);
                } else {
                    $summary['zeroVarianceItemCount']++;
                }
            }
        }

        // Merged source audits: no mutating actions.
        if ($mergedInto) {
            return [$summary, []];
        }

        $actions = [];
        // DRAFT / COUNTING: submit + cancel; COUNTING also resnapshot.
        if (in_array($status, ['DRAFT', 'COUNTING'], true)) {
            $actions[] = ['action' => 'submit', 'label' => 'Nộp kiểm'];
            $actions[] = ['action' => 'cancel', 'label' => 'Hủy phiếu', 'needsReason' => true, 'danger' => true];
        }
        if ($status === 'COUNTING') {
            $actions[] = ['action' => 'resnapshot', 'label' => 'Chụp lại snapshot'];
        }
        // SUBMITTED: cancel + reconcile (admin/root only for reconcile).
        if ($status === 'SUBMITTED') {
            $actions[] = ['action' => 'cancel', 'label' => 'Hủy phiếu', 'needsReason' => true, 'danger' => true];
            if ($isAdminOrRoot) {
                $actions[] = ['action' => 'reconcile', 'label' => 'Bù trừ kiểm kho'];
            }
        }
        // RECONCILED: reverse only for admin/root.
        if ($status === 'RECONCILED' && $isAdminOrRoot) {
            $actions[] = ['action' => 'reverse-reconcile', 'label' => 'Đảo bù trừ', 'needsReason' => true, 'danger' => true];
        }
        if ($status === 'DRAFT') {
            $actions[] = ['action' => 'delete', 'label' => 'Xóa nháp', 'danger' => true];
        }

        return [$summary, $actions];
    }

    private function varianceReasonLabel(?string $value): ?string
    {
        if (!$value) {
            return null;
        }

        return collect(self::VARIANCE_REASONS)->firstWhere('value', $value)['label'] ?? $value;
    }

    private function branch(mixed $id): ?Branch
    {
        if (!$id) {
            return null;
        }

        return Branch::query()->where('id', $id)->orWhere('mongo_id', $id)->orWhere('name', $id)->orWhere('code', $id)->first();
    }

    private function parseDate(string $value)
    {
        try {
            return \Illuminate\Support\Carbon::parse($value);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function paginated(array $items, int $total, int $page, int $perPage): array
    {
        return [
            'items' => $items,
            'data' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $perPage,
            'per_page' => $perPage,
            'current_page' => $page,
            'last_page' => (int) ceil($total / max($perPage, 1)),
            'from' => $total ? ($page - 1) * $perPage + 1 : null,
            'to' => min($page * $perPage, $total) ?: null,
        ];
    }
}

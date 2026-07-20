<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\MirrorRecord;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Read-only report: chuyển kho chưa hoàn tất.
 * Pending statuses (canonical): DRAFT, IN_TRANSIT, RETURN_IN_PROGRESS.
 */
class InventoryPendingTransfersReportService
{
    public const TIMEZONE = 'Asia/Ho_Chi_Minh';

    public const PENDING_STATUSES = ['DRAFT', 'IN_TRANSIT', 'RETURN_IN_PROGRESS'];

    public const STATUS_LABELS = [
        'DRAFT' => 'Chờ xác nhận xuất',
        'IN_TRANSIT' => 'Đang chuyển',
        'RETURN_IN_PROGRESS' => 'Chờ nhận lại hàng trả',
    ];

    public const PER_PAGE_OPTIONS = [20, 50, 100];

    public function options(): array
    {
        $warehouses = Branch::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'mongo_id', 'name', 'code'])
            ->map(fn (Branch $b): array => [
                'value' => (string) ($b->mongo_id ?: $b->id),
                'label' => (string) $b->name,
                'code' => $b->code,
            ])
            ->values()
            ->all();

        return [
            'warehouses' => $warehouses,
            'statuses' => collect(self::STATUS_LABELS)
                ->map(fn (string $label, string $value): array => ['value' => $value, 'label' => $label])
                ->values()
                ->all(),
            'pendingStatuses' => self::PENDING_STATUSES,
            'perPageOptions' => self::PER_PAGE_OPTIONS,
            'timezone' => self::TIMEZONE,
            'capabilities' => [
                'openTransferLink' => true,
                'readOnly' => true,
            ],
        ];
    }

    public function report(array $query): array
    {
        $filters = $this->normalizeFilters($query);
        $rows = $this->buildRows($filters);
        $summary = $this->buildSummary($rows);
        $byStatus = $this->buildStatusBreakdown($rows);
        $aging = $this->buildAging($rows);

        $sorted = $rows->sortBy(function (array $row) use ($filters) {
            $value = $row[$filters['sortBy']] ?? null;
            if (is_numeric($value)) {
                return (float) $value;
            }

            return mb_strtolower((string) $value);
        }, SORT_REGULAR, $filters['sortDir'] === 'desc')->values();

        $total = $sorted->count();
        $page = $filters['page'];
        $perPage = $filters['perPage'];
        $offset = ($page - 1) * $perPage;
        $pageRows = $sorted->slice($offset, $perPage)->values()->all();

        return [
            'filters' => $filters,
            'summary' => $summary,
            'breakdowns' => [
                'byStatus' => $byStatus,
                'aging' => $aging,
            ],
            'table' => [
                'data' => $pageRows,
                'totals' => [
                    'totalQty' => $summary['totalQty'],
                    'lineCount' => $summary['totalPending'],
                ],
                'pagination' => [
                    'page' => $page,
                    'perPage' => $perPage,
                    'total' => $total,
                    'totalPages' => max((int) ceil($total / max($perPage, 1)), 1),
                ],
            ],
            'meta' => [
                'generatedAt' => Carbon::now(self::TIMEZONE)->toIso8601String(),
                'timezone' => self::TIMEZONE,
                'pendingStatuses' => self::PENDING_STATUSES,
                'capabilities' => [
                    'openTransferLink' => true,
                    'readOnly' => true,
                ],
            ],
        ];
    }

    private function normalizeFilters(array $query): array
    {
        $fromDate = trim((string) ($query['fromDate'] ?? $query['from'] ?? ''));
        $toDate = trim((string) ($query['toDate'] ?? $query['to'] ?? ''));
        if ($fromDate !== '' && $toDate !== '') {
            if ($fromDate > $toDate) {
                throw ValidationException::withMessages([
                    'fromDate' => ['Từ ngày không được sau Đến ngày.'],
                ]);
            }
        }

        $status = strtoupper(trim((string) ($query['status'] ?? '')));
        if ($status !== '' && !in_array($status, self::PENDING_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => ['Trạng thái không thuộc nhóm chờ xác nhận.'],
            ]);
        }

        $sortBy = trim((string) ($query['sortBy'] ?? 'waitingDays'));
        if (!in_array($sortBy, ['code', 'createdAt', 'waitingDays', 'totalQty', 'status', 'sourceWarehouseName', 'destinationWarehouseName'], true)) {
            $sortBy = 'waitingDays';
        }
        $sortDir = strtolower(trim((string) ($query['sortDir'] ?? 'desc'))) === 'asc' ? 'asc' : 'desc';
        $page = max((int) ($query['page'] ?? 1), 1);
        $perPage = min(max((int) ($query['perPage'] ?? $query['limit'] ?? 20), 1), 100);
        $rawMinWait = $query['minWaitingDays'] ?? null;
        $minWaitingDays = ($rawMinWait !== null && $rawMinWait !== '')
            ? max((int) $rawMinWait, 0)
            : null;

        return [
            'q' => trim((string) ($query['q'] ?? $query['code'] ?? '')),
            'sourceWarehouseId' => trim((string) ($query['sourceWarehouseId'] ?? '')),
            'destinationWarehouseId' => trim((string) ($query['destinationWarehouseId'] ?? '')),
            'status' => $status,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'minWaitingDays' => $minWaitingDays,
            'page' => $page,
            'perPage' => $perPage,
            'sortBy' => $sortBy,
            'sortDir' => $sortDir,
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function buildRows(array $filters): Collection
    {
        $query = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery();

        // Canonical pending only — never filter by Vietnamese label.
        if ($filters['status'] !== '') {
            $query->whereRaw('UPPER(status) = ?', [$filters['status']]);
        } else {
            $query->whereIn(\Illuminate\Support\Facades\DB::raw('UPPER(status)'), self::PENDING_STATUSES);
        }

        if ($filters['q'] !== '') {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q): void {
                $builder->where('code', 'like', "%{$q}%")
                    ->orWhere('mongo_id', $q)
                    ->orWhere('name', 'like', "%{$q}%");
            });
        }

        if ($filters['sourceWarehouseId'] !== '') {
            $keys = $this->warehouseKeys($filters['sourceWarehouseId']);
            $query->where(function ($builder) use ($keys): void {
                foreach ($keys as $key) {
                    $builder->orWhere('from_branch_mongo_id', $key)->orWhere('from_branch_id', $key);
                }
            });
        }
        if ($filters['destinationWarehouseId'] !== '') {
            $keys = $this->warehouseKeys($filters['destinationWarehouseId']);
            $query->where(function ($builder) use ($keys): void {
                foreach ($keys as $key) {
                    $builder->orWhere('to_branch_mongo_id', $key)->orWhere('to_branch_id', $key);
                }
            });
        }

        if ($filters['fromDate'] !== '') {
            try {
                $from = Carbon::parse($filters['fromDate'], self::TIMEZONE)->startOfDay();
                $query->where('business_date', '>=', $from);
            } catch (\Throwable) {
            }
        }
        if ($filters['toDate'] !== '') {
            try {
                $to = Carbon::parse($filters['toDate'], self::TIMEZONE)->endOfDay();
                $query->where('business_date', '<=', $to);
            } catch (\Throwable) {
            }
        }

        $now = Carbon::now(self::TIMEZONE);
        $rows = $query->orderByDesc('business_date')->orderByDesc('id')->get()
            ->map(function (MirrorRecord $record) use ($now): array {
                $payload = is_array($record->payload) ? $record->payload : [];
                $status = strtoupper(trim((string) ($record->status ?? $payload['status'] ?? '')));
                $created = $record->business_date ?? $record->created_at;
                try {
                    $createdAt = $created ? Carbon::parse($created, self::TIMEZONE) : null;
                } catch (\Throwable) {
                    $createdAt = null;
                }
                $waitingDays = 0;
                if ($createdAt) {
                    $waitingDays = max(0, (int) $createdAt->diffInDays($now));
                }

                $fromId = $payload['sourceWarehouseId'] ?? $record->from_branch_mongo_id ?? null;
                $toId = $payload['destinationWarehouseId'] ?? $record->to_branch_mongo_id ?? null;
                $fromName = $payload['sourceWarehouseName']
                    ?? $record->source_warehouse_name
                    ?? $this->branchName($fromId);
                $toName = $payload['destinationWarehouseName']
                    ?? $record->destination_warehouse_name
                    ?? $this->branchName($toId);

                $lines = is_array($payload['lines'] ?? null) ? $payload['lines'] : [];
                $totalQty = 0.0;
                foreach ($lines as $line) {
                    if (!is_array($line)) {
                        continue;
                    }
                    $totalQty += (float) ($line['receivedQuantity']
                        ?? $line['dispatchedQuantity']
                        ?? $line['approvedQuantity']
                        ?? $line['requestedQuantity']
                        ?? 0);
                }
                if ($totalQty <= 0) {
                    $totalQty = (float) ($payload['qty'] ?? $record->qty ?? 0);
                }

                $code = (string) ($payload['code'] ?? $record->code ?? $record->mongo_id);

                return [
                    'id' => (string) $record->mongo_id,
                    'code' => $code,
                    'createdAt' => $createdAt ? $createdAt->toIso8601String() : null,
                    'sourceWarehouseId' => $fromId !== null ? (string) $fromId : null,
                    'sourceWarehouseName' => $fromName,
                    'destinationWarehouseId' => $toId !== null ? (string) $toId : null,
                    'destinationWarehouseName' => $toName,
                    'itemCount' => count($lines),
                    'totalQty' => $totalQty,
                    'status' => $status,
                    'statusLabel' => self::STATUS_LABELS[$status] ?? $status,
                    'waitingDays' => $waitingDays,
                    'createdByName' => $record->creator ?? ($payload['creator'] ?? null),
                    'detailPath' => '/warehouse/transfers/'.$record->mongo_id,
                ];
            });

        if ($filters['minWaitingDays'] !== null) {
            $min = (int) $filters['minWaitingDays'];
            $rows = $rows->filter(fn (array $row): bool => (int) $row['waitingDays'] >= $min)->values();
        }

        return $rows->values();
    }

    /** @return list<string> */
    private function warehouseKeys(string $id): array
    {
        $branch = Branch::query()
            ->where('mongo_id', $id)
            ->orWhere('id', $id)
            ->first();
        $keys = array_filter([
            $id,
            $branch?->mongo_id ? (string) $branch->mongo_id : null,
            $branch ? (string) $branch->id : null,
        ]);

        return array_values(array_unique($keys));
    }

    private function branchName(mixed $id): ?string
    {
        if ($id === null || $id === '') {
            return null;
        }
        $branch = Branch::query()
            ->where('mongo_id', (string) $id)
            ->orWhere('id', $id)
            ->first();

        return $branch?->name;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, int|float>
     */
    private function buildSummary(Collection $rows): array
    {
        return [
            'totalPending' => $rows->count(),
            // Canonical mapping: DRAFT = chờ nguồn; IN_TRANSIT = chờ đích / đang chuyển; RETURN_IN_PROGRESS = chờ nhận lại.
            'waitingSource' => $rows->where('status', 'DRAFT')->count(),
            'inTransit' => $rows->where('status', 'IN_TRANSIT')->count(),
            'waitingDestination' => $rows->where('status', 'IN_TRANSIT')->count(),
            'returnInProgress' => $rows->where('status', 'RETURN_IN_PROGRESS')->count(),
            'totalQty' => (float) $rows->sum(fn (array $r) => (float) $r['totalQty']),
            'maxWaitingDays' => (int) ($rows->max('waitingDays') ?? 0),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function buildStatusBreakdown(Collection $rows): array
    {
        $out = [];
        foreach (self::PENDING_STATUSES as $status) {
            $subset = $rows->where('status', $status);
            if ($subset->isEmpty()) {
                continue;
            }
            $out[] = [
                'status' => $status,
                'label' => self::STATUS_LABELS[$status],
                'count' => $subset->count(),
                'totalQty' => (float) $subset->sum(fn (array $r) => (float) $r['totalQty']),
            ];
        }

        return $out;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function buildAging(Collection $rows): array
    {
        $buckets = [
            ['key' => '0_1', 'label' => '0–1 ngày', 'min' => 0, 'max' => 1, 'count' => 0],
            ['key' => '2_3', 'label' => '2–3 ngày', 'min' => 2, 'max' => 3, 'count' => 0],
            ['key' => '4_7', 'label' => '4–7 ngày', 'min' => 4, 'max' => 7, 'count' => 0],
            ['key' => 'over_7', 'label' => 'Trên 7 ngày', 'min' => 8, 'max' => null, 'count' => 0],
        ];
        foreach ($rows as $row) {
            $days = max(0, (int) ($row['waitingDays'] ?? 0));
            foreach ($buckets as &$bucket) {
                $max = $bucket['max'];
                if ($days >= $bucket['min'] && ($max === null || $days <= $max)) {
                    $bucket['count']++;
                    break;
                }
            }
            unset($bucket);
        }

        return $buckets;
    }
}

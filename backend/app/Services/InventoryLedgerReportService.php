<?php

namespace App\Services;

use App\Models\InventoryStockMovement;
use App\Models\ProductBranchStock;
use Illuminate\Support\Carbon;

class InventoryLedgerReportService
{
    public function reconcile(string $fromDate, string $toDate, ?int $branchId = null): array
    {
        $from = Carbon::parse($fromDate)->startOfDay();
        $to = Carbon::parse($toDate)->endOfDay();
        $scope = ProductBranchStock::query()->with(['product:id,code,name,cost', 'branch:id,name']);
        if ($branchId) $scope->where('branch_id', $branchId);

        $rows = $scope->get()->map(function (ProductBranchStock $stock) use ($from, $to): array {
            $base = InventoryStockMovement::query()
                ->where('product_id', $stock->product_id)->where('branch_id', $stock->branch_id);
            $openingMovement = (clone $base)->where('occurred_at', '<', $from)->latest('occurred_at')->latest('id')->first();
            $period = (clone $base)->whereBetween('occurred_at', [$from, $to])->orderBy('occurred_at')->orderBy('id')->get();
            $closingMovement = (clone $base)->where('occurred_at', '<=', $to)->latest('occurred_at')->latest('id')->first();
            $opening = $openingMovement ? (float) $openingMovement->quantity_after : ($period->first() ? (float) $period->first()->quantity_before : null);
            $closing = $closingMovement ? (float) $closingMovement->quantity_after : $opening;
            $in = (float) $period->where('quantity_delta', '>', 0)->sum('quantity_delta');
            $out = abs((float) $period->where('quantity_delta', '<', 0)->sum('quantity_delta'));
            $expected = $opening === null ? null : $opening + $in - $out;
            $variance = $expected === null || $closing === null ? null : $closing - $expected;
            $hasAnchor = (clone $base)->where('movement_type', 'OPENING_BALANCE')->where('occurred_at', '<=', $to)->exists();

            return [
                'productId' => $stock->product_id, 'productCode' => $stock->product?->code, 'productName' => $stock->product?->name,
                'branchId' => $stock->branch_id, 'branchName' => $stock->branch?->name,
                'openingQty' => $opening, 'qtyIn' => $in, 'qtyOut' => $out, 'closingQty' => $closing,
                'expectedClosingQty' => $expected, 'varianceQty' => $variance,
                'currentQty' => (float) $stock->qty, 'unitCost' => (float) ($stock->product?->cost ?? 0),
                'isReconciled' => $hasAnchor && $variance !== null && abs($variance) < 0.0001,
                'coverage' => $hasAnchor ? 'VERIFIED_FROM_ANCHOR' : 'INCOMPLETE_HISTORY',
            ];
        })->values();

        return [
            'rows' => $rows,
            'summary' => [
                'totalRows' => $rows->count(),
                'reconciledRows' => $rows->where('isReconciled', true)->count(),
                'incompleteRows' => $rows->where('coverage', 'INCOMPLETE_HISTORY')->count(),
                'varianceRows' => $rows->filter(fn ($row) => $row['varianceQty'] !== null && abs($row['varianceQty']) >= 0.0001)->count(),
            ],
            'meta' => ['fromDate' => $from->toDateString(), 'toDate' => $to->toDateString(), 'readOnly' => true],
        ];
    }
}

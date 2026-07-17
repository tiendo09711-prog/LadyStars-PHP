<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Services\InventoryLedgerReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryLedgerReportController extends Controller
{
    public function __invoke(Request $request, InventoryLedgerReportService $service): JsonResponse
    {
        $data = $request->validate(['fromDate' => ['required', 'date'], 'toDate' => ['required', 'date', 'after_or_equal:fromDate'], 'branchId' => ['nullable', 'string', 'max:100']]);
        $branchId = null;
        if (! empty($data['branchId'])) {
            $raw = $data['branchId'];
            $branchId = Branch::query()->where(function ($query) use ($raw): void {
                if (ctype_digit($raw)) $query->where('id', (int) $raw);
                $query->orWhere('mongo_id', $raw)->orWhere('code', $raw);
            })->value('id');
        }
        return response()->json($service->reconcile($data['fromDate'], $data['toDate'], $branchId ? (int) $branchId : null));
    }
}

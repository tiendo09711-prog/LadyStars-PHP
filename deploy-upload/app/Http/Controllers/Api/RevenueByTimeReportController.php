<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RevenueByTimeReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only API for "Báo cáo doanh thu theo thời gian".
 * No writes, no schema changes.
 */
class RevenueByTimeReportController extends Controller
{
    public function __construct(
        private readonly RevenueByTimeReportService $service,
    ) {
    }

    public function options(): JsonResponse
    {
        return response()->json($this->service->options());
    }

    public function index(Request $request): JsonResponse
    {
        $payload = $this->service->report($request->query());

        return response()->json($payload);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RevenueByStaffReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only API for "Báo cáo doanh thu theo nhân viên".
 * No writes, no schema changes.
 */
class RevenueByStaffReportController extends Controller
{
    public function __construct(
        private readonly RevenueByStaffReportService $service,
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

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RevenueByProductReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only API for "Báo cáo doanh thu theo sản phẩm".
 * No writes, no schema changes.
 */
class RevenueByProductReportController extends Controller
{
    public function __construct(
        private readonly RevenueByProductReportService $service,
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

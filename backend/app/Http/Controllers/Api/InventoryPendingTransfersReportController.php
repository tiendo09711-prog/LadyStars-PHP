<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryPendingTransfersReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class InventoryPendingTransfersReportController extends Controller
{
    public function __construct(
        private readonly InventoryPendingTransfersReportService $service,
    ) {
    }

    public function options(): JsonResponse
    {
        return response()->json($this->service->options());
    }

    public function index(Request $request): JsonResponse
    {
        try {
            return response()->json($this->service->report($request->query()));
        } catch (ValidationException $e) {
            return response()->json([
                'ok' => false,
                'message' => collect($e->errors())->flatten()->first() ?: 'Bộ lọc không hợp lệ.',
                'errors' => $e->errors(),
            ], 422);
        }
    }
}

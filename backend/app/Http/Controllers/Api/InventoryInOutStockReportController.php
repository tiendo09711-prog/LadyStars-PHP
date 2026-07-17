<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryInOutStockReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Read-only API for "Báo cáo kho hàng › Xuất nhập tồn".
 */
class InventoryInOutStockReportController extends Controller
{
    public function __construct(
        private readonly InventoryInOutStockReportService $service,
    ) {
    }

    public function options(): JsonResponse
    {
        return response()->json($this->service->options());
    }

    public function index(Request $request): JsonResponse
    {
        try {
            $payload = $this->service->report($request->query());
        } catch (ValidationException $e) {
            return response()->json([
                'ok' => false,
                'message' => collect($e->errors())->flatten()->first() ?: 'Bộ lọc không hợp lệ.',
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json($payload);
    }

    public function export(Request $request): StreamedResponse|JsonResponse
    {
        try {
            $export = $this->service->exportRows($request->query());
        } catch (ValidationException $e) {
            return response()->json([
                'ok' => false,
                'message' => collect($e->errors())->flatten()->first() ?: 'Bộ lọc không hợp lệ.',
                'errors' => $e->errors(),
            ], 422);
        }

        $rows = $export['rows'];
        if ($rows === []) {
            return response()->json([
                'ok' => false,
                'message' => 'Không có dữ liệu để xuất.',
            ], 422);
        }

        $from = $export['filters']['fromDate'] ?? 'from';
        $to = $export['filters']['toDate'] ?? 'to';
        $filename = "xuat-nhap-ton-{$from}_{$to}.csv";

        return response()->streamDownload(function () use ($rows): void {
            $out = fopen('php://output', 'w');
            // UTF-8 BOM for Excel Vietnamese
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [
                'Thời gian',
                'Mã chứng từ',
                'Loại',
                'Kho',
                'Mã SP',
                'Tên SP',
                'Nhập',
                'Xuất',
                'Giá trị nhập',
                'Giá trị xuất',
                'Người tạo',
            ], ';');
            foreach ($rows as $row) {
                fputcsv($out, [
                    $row['date'] ?? '',
                    $row['billCode'] ?? '',
                    $row['typeLabel'] ?? ($row['type'] ?? ''),
                    $row['warehouseName'] ?? '',
                    $row['productCode'] ?? '',
                    $row['productName'] ?? '',
                    $row['qtyIn'] ?? 0,
                    $row['qtyOut'] ?? 0,
                    $row['valueIn'] ?? 0,
                    $row['valueOut'] ?? 0,
                    $row['createdByName'] ?? '',
                ], ';');
            }
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}

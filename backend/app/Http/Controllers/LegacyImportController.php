<?php

namespace App\Http\Controllers;

use App\Services\LegacyImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LegacyImportController extends Controller
{
    /**
     * Hiển thị trang import legacy.
     * Chỉ admin (role=ADMIN hoặc is_root_owner).
     */
    public function index()
    {
        $this->authorizeAdmin();

        return view('admin.legacy-import', [
            'title' => 'Import Dữ Liệu Legacy (Excel)',
        ]);
    }

    /**
     * Xử lý upload + chạy import.
     */
    public function import(Request $request)
    {
        $this->authorizeAdmin();

        $request->validate([
            'files' => 'required|array|min:1',
            'files.*' => 'file|mimes:xlsx,xls|max:102400', // max ~100MB per file
        ], [
            'files.*.mimes' => 'Chỉ chấp nhận file .xlsx hoặc .xls',
            'files.*.max' => 'File quá lớn (tối đa 100MB mỗi file)',
        ]);

        // Lưu tạm các file
        $uploadedMap = [];
        $tempDir = 'legacy-import/' . date('Ymd_His') . '_' . Str::random(6);

        // Directory creation is now handled per-file with mkdir for Windows compatibility
        // (Storage::makeDirectory can sometimes have path issues on Windows)

        $expectedPatterns = [
            'categories' => ['danh-muc', 'danhmuc'],
            'products' => ['san-pham-san-pham', 'san-pham-san-pham'],
            'stock' => ['ton-kho'],
            'customers' => ['danh-sach-khach-hang'],
            'sales' => ['ban-le'],
            'returns' => ['hoa-don-tra-hang'],
            'cares' => ['phieu-cham-soc', 'danh-sach-phieu-cham-soc'],
            'inv_vouchers' => ['xuat-nhap-kho-phieu-xuat-nhap-kho', 'xuat-nhap-kho-phieu'],
            'inv_items' => ['xuat-nhap-kho-san-pham-xuat-nhap-kho'],
            'product_logs' => ['san-pham-lich-su-sua-xoa'],
        ];

        foreach ($request->file('files') as $file) {
            $originalName = $file->getClientOriginalName();

            // Use slug for robust matching (removes accents, lowercases, replaces spaces with -)
            $slugName = Str::slug(pathinfo($originalName, PATHINFO_FILENAME));

            $matchedKey = null;
            $bestMatchLength = 0;
            foreach ($expectedPatterns as $key => $patterns) {
                foreach ($patterns as $pat) {
                    $slugPat = Str::slug($pat);
                    if (str_contains($slugName, $slugPat) && strlen($slugPat) > $bestMatchLength) {
                        $matchedKey = $key;
                        $bestMatchLength = strlen($slugPat);
                    }
                }
            }

            if (!$matchedKey) {
                $matchedKey = 'unknown_' . $slugName;
            }

            // Use safe ASCII filename
            $safeName = $slugName . '.' . pathinfo($originalName, PATHINFO_EXTENSION);

            // Build absolute directory using real path + DIRECTORY_SEPARATOR
            $baseDir = storage_path('app' . DIRECTORY_SEPARATOR . $tempDir);
            if (!is_dir($baseDir)) {
                mkdir($baseDir, 0777, true);
            }

            $destination = $baseDir . DIRECTORY_SEPARATOR . $safeName;

            // Direct copy from PHP's uploaded temp file (most reliable on Windows)
            if (!@copy($file->getRealPath(), $destination)) {
                $err = error_get_last();
                $msg = $err ? $err['message'] : 'unknown copy error';
                return back()->withErrors([
                    'files' => 'Không thể lưu file "' . $originalName . '": ' . $msg
                ])->withInput();
            }

            if (!isset($uploadedMap[$matchedKey])) {
                $uploadedMap[$matchedKey] = $destination;
            }
        }

        // Kiểm tra đủ 10 file chính
        $required = ['categories','products','stock','customers','sales','returns','cares','inv_vouchers','inv_items','product_logs'];
        $missing = [];
        foreach ($required as $k) {
            if (empty($uploadedMap[$k])) {
                $missing[] = $k;
            }
        }

        if (!empty($missing)) {
            // Build helpful debug info using slug matching
            $debug = "Các file đã upload và mapping:\n";
            foreach ($request->file('files') as $f) {
                $name = $f->getClientOriginalName();
                $slugName = Str::slug(pathinfo($name, PATHINFO_FILENAME));
                $matched = 'không khớp';
                $bestLen = 0;
                foreach ($expectedPatterns as $key => $pats) {
                    foreach ($pats as $pat) {
                        $slugPat = Str::slug($pat);
                        if (str_contains($slugName, $slugPat) && strlen($slugPat) > $bestLen) {
                            $matched = $key;
                            $bestLen = strlen($slugPat);
                        }
                    }
                }
                $debug .= "- $name → $matched\n";
            }

            return back()->withErrors([
                'files' => 'Thiếu file: ' . implode(', ', $missing) . 
                           ". Vui lòng giữ nguyên tên file gốc và upload đúng 10 file.\n\n" . 
                           "Mapping hiện tại:\n" . $debug . 
                           "\nLưu ý: Một số file có tên chứa từ 'Sản phẩm' nên cần pattern cụ thể."
            ])->withInput();
        }

        // Chạy import (luôn truncate + import thật)
        try {
            $service = app(LegacyImportService::class);
            $result = $service->run($uploadedMap, [
                'dry_run' => false,
                'truncate_only' => false,
                'limit' => null,
            ]);

            // Lưu kết quả vào session để hiển thị trang result
            session()->flash('import_result', $result);

            return redirect()->route('legacy-import.result');
        } catch (\Throwable $e) {
            Log::error('Legacy import web failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return back()->withErrors(['import' => 'Lỗi khi import: ' . $e->getMessage()])->withInput();
        }
    }

    public function result()
    {
        $this->authorizeAdmin();

        $result = session('import_result');

        if (!$result) {
            return redirect()->route('legacy-import.index')->with('info', 'Không có kết quả import. Vui lòng thực hiện lại.');
        }

        return view('admin.legacy-import-result', [
            'result' => $result,
        ]);
    }

    /**
     * Tải file báo cáo.
     */
    public function downloadReport(Request $request)
    {
        $this->authorizeAdmin();

        $filename = $request->query('path');

        // Primary: Reports are written directly to storage/logs/ by the service
        $path = storage_path('logs/' . $filename);
        if (file_exists($path)) {
            return response()->download($path);
        }

        // Fallback 1: storage/app/logs/
        $path = storage_path('app/logs/' . $filename);
        if (file_exists($path)) {
            return response()->download($path);
        }

        // Fallback 2: using Storage facade (in case someone put them under storage/app)
        $candidates = [
            'logs/' . $filename,
            $filename,
        ];

        foreach ($candidates as $cand) {
            if (Storage::exists($cand)) {
                return Storage::download($cand);
            }
        }

        abort(404, 'File báo cáo không tồn tại hoặc đã bị xóa.');
    }

    private function authorizeAdmin(): void
    {
        // Development convenience: allow full access on local environment
        // (no web login required). This matches the project's API-token style auth.
        if (config('app.env') === 'local') {
            return;
        }

        // Production / stricter environments: require login + admin role
        if (!Auth::check()) {
            abort(401, 'Vui lòng đăng nhập.');
        }

        $user = Auth::user();
        if (!($user->role === 'ADMIN' || $user->is_root_owner)) {
            abort(403, 'Chỉ tài khoản Admin mới được sử dụng trang này.');
        }
    }
}

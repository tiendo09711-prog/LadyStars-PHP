<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Kết quả Import Legacy</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 py-8">
    <div class="max-w-4xl mx-auto px-4">
        <div class="bg-white shadow rounded p-8">
            <h1 class="text-2xl font-bold mb-1">Kết quả Import Dữ Liệu Legacy</h1>

            @php
                $result = $result ?? session('import_result', []);
                $success = $result['success'] ?? false;
            @endphp

            @if($success)
                <div class="bg-green-100 border border-green-300 text-green-800 p-4 rounded mb-6">
                    ✅ Import thành công!
                </div>
            @else
                <div class="bg-red-100 border border-red-300 text-red-800 p-4 rounded mb-6">
                    ❌ Import thất bại hoặc có lỗi: {{ $result['message'] ?? 'Không rõ lỗi' }}
                    <div class="mt-2 text-sm text-red-700">
                        Đã sửa cơ chế lưu file dùng mkdir + copy trực tiếp (tương thích Windows tốt hơn).<br>
                        Vui lòng <strong>restart</strong> `php artisan serve` rồi thử upload lại.
                    </div>
                </div>
            @endif

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="bg-gray-50 p-4 rounded">
                    <div class="font-semibold mb-2">Thống kê đã import</div>
                    <pre class="text-sm overflow-auto bg-white p-2 rounded border">{{ json_encode($result['inserted'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) }}</pre>
                </div>

                <div class="bg-gray-50 p-4 rounded">
                    <div class="font-semibold mb-2">Tổng quan</div>
                    <ul class="text-sm space-y-1">
                        <li>Orphans: <strong>{{ $result['orphans_count'] ?? 0 }}</strong></li>
                        <li>Warnings: <strong>{{ $result['warnings'] ?? 0 }}</strong></li>
                        <li>Phases: {{ implode(', ', array_keys($result['stats']['phases'] ?? [])) }}</li>
                    </ul>
                </div>
            </div>

            @if(!empty($result['report_path']))
                <div class="mb-4">
                    <a href="{{ route('legacy-import.download', ['path' => basename($result['report_path'])]) }}" 
                       class="inline-block px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                        Tải Report (MD)
                    </a>
                </div>
            @endif

            @if(!empty($result['orphans_csv']))
                <div class="mb-6">
                    <a href="{{ route('legacy-import.download', ['path' => basename($result['orphans_csv'])]) }}" 
                       class="inline-block px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                        Tải Orphans CSV
                    </a>
                    <span class="text-xs text-gray-500 ml-2">(Danh sách các record không map được)</span>
                </div>
            @endif

            <div class="flex gap-3">
                <a href="{{ route('legacy-import.index') }}" 
                   class="px-5 py-2 border rounded hover:bg-gray-100">Quay lại trang Import</a>
                <a href="/admin/legacy-import" class="px-5 py-2 text-blue-600 hover:underline">Thực hiện import lại</a>
            </div>
        </div>

        <div class="mt-4 text-xs text-gray-500">
            Dữ liệu đã được import theo file Excel bạn cung cấp. Sử dụng trang này bất cứ khi nào cần reset + import lại.
        </div>

        @if(config('app.env') === 'local')
        <div class="mt-2 text-[10px] text-blue-500">Dev mode active (local env bypass)</div>
        @endif
    </div>
</body>
</html>
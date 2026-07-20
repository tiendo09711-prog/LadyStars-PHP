<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $title ?? 'Import Dữ Liệu Legacy' }}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; }
    </style>
</head>
<body class="bg-gray-100">
    <div class="max-w-4xl mx-auto py-10 px-4">
        <div class="bg-white shadow rounded-lg p-8">
            <h1 class="text-3xl font-bold text-red-700 mb-2">Import Dữ Liệu Legacy (Excel)</h1>
            <p class="text-gray-600 mb-6">Trang này dùng để xóa toàn bộ dữ liệu cũ và import lại dữ liệu từ 11 file Excel legacy. <strong>Chỉ dành cho Admin.</strong></p>

            @if(session('errors'))
                <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    @foreach($errors->all() as $error)
                        <div>{{ $error }}</div>
                    @endforeach
                </div>
            @endif

            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                <div class="font-semibold text-yellow-800">⚠️ CẢNH BÁO QUAN TRỌNG</div>
                <ul class="list-disc ml-5 text-sm text-yellow-700 mt-1">
                    <li>Hành động này sẽ <strong>XÓA TOÀN BỘ dữ liệu</strong> (trừ tài khoản admin@gmail.com).</li>
                    <li>Chỉ sử dụng khi bạn đã có bản backup database.</li>
                    <li>Trang này được giữ lại để sử dụng nhiều lần khi cần.</li>
                </ul>
            </div>

            @if(config('app.env') === 'local')
            <div class="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded mb-4 text-sm">
                <strong>Dev mode:</strong> Trang này đang cho phép truy cập dễ dàng vì APP_ENV=local (không cần đăng nhập web).
            </div>
            @endif

            <div class="text-xs text-gray-500 mb-4">
                Server phải đang chạy ở port 8000. Nếu báo lỗi 404/500, chạy lệnh: <code>php artisan route:clear</code> trong thư mục <code>backend</code>.
            </div>

            <form action="{{ route('legacy-import.run') }}" method="POST" enctype="multipart/form-data" id="importForm">
                @csrf

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Chọn 11 file Excel (cùng lúc)
                    </label>
                    <input type="file" name="files[]" multiple accept=".xlsx,.xls"
                           class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                           required id="fileInput">
                    <p class="text-xs text-gray-500 mt-1">Hỗ trợ .xlsx, .xls. <strong>Giữ nguyên tên file gốc</strong> để hệ thống tự nhận diện.</p>
                    <p class="text-xs text-gray-500">Các file cần: Danh mục, Sản phẩm - Sản phẩm, Tồn kho, Danh sách khách hàng, Bán lẻ, Hóa đơn trả hàng, Danh sách phiếu chăm sóc, Xuất nhập kho - Phiếu..., Xuất nhập kho - Sản phẩm..., Sản phẩm - Lịch sử sửa xóa, Đơn chuyển kho</p>
                </div>

                <!-- Danh sách file đã chọn -->
                <div id="fileList" class="mb-6 hidden">
                    <div class="text-sm font-medium mb-1">Files đã chọn:</div>
                    <ul id="fileListUl" class="text-sm bg-gray-50 border rounded p-3 max-h-40 overflow-auto"></ul>
                </div>

                <div class="flex items-center gap-4">
                    <button type="button"
                            onclick="showConfirmModal()"
                            class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow text-lg">
                        XÓA TOÀN BỘ DỮ LIỆU CŨ + IMPORT DỮ LIỆU MỚI
                    </button>

                    <a href="{{ route('legacy-import.index') }}" class="text-gray-600 hover:underline">Hủy</a>
                </div>
            </form>
        </div>

        <div class="mt-6 text-xs text-gray-500">
            Sau khi import xong, bạn sẽ được chuyển đến trang kết quả với thống kê chi tiết.
        </div>
    </div>

    <!-- Modal xác nhận -->
    <div id="confirmModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold text-red-700 mb-3">Xác nhận hành động</h3>
            <p class="mb-4 text-gray-700">Bạn có chắc chắn muốn <strong>XÓA TOÀN BỘ dữ liệu cũ</strong> và import dữ liệu mới từ các file Excel đã chọn không?</p>
            <p class="mb-4 text-sm text-red-600 font-medium">Hành động này KHÔNG THỂ HOÀN TÁC.</p>

            <div class="flex justify-end gap-3">
                <button onclick="hideConfirmModal()" class="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100">Hủy</button>
                <button onclick="submitImportForm()" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">XÁC NHẬN &amp; THỰC HIỆN</button>
            </div>
        </div>
    </div>

    <script>
        const fileInput = document.getElementById('fileInput');
        const fileList = document.getElementById('fileList');
        const fileListUl = document.getElementById('fileListUl');
        let selectedFiles = [];

        fileInput.addEventListener('change', function() {
            selectedFiles = Array.from(this.files);
            renderFileList();
        });

        function renderFileList() {
            fileListUl.innerHTML = '';
            if (selectedFiles.length === 0) {
                fileList.classList.add('hidden');
                return;
            }
            fileList.classList.remove('hidden');
            selectedFiles.forEach((f, i) => {
                const li = document.createElement('li');
                li.className = 'flex justify-between py-1 border-b last:border-b-0';
                li.innerHTML = `
                    <span>${f.name} <span class="text-gray-400">(${(f.size/1024/1024).toFixed(1)} MB)</span></span>
                    <button type="button" onclick="removeFile(${i})" class="text-red-500 hover:text-red-700">×</button>
                `;
                fileListUl.appendChild(li);
            });
        }

        function removeFile(index) {
            selectedFiles.splice(index, 1);
            // Cập nhật input (khó reset trực tiếp nên rebuild)
            const dt = new DataTransfer();
            selectedFiles.forEach(f => dt.items.add(f));
            fileInput.files = dt.files;
            renderFileList();
        }

        function showConfirmModal() {
            if (selectedFiles.length < 1) {
                alert('Vui lòng chọn ít nhất các file Excel cần import.');
                return;
            }
            document.getElementById('confirmModal').classList.remove('hidden');
            document.getElementById('confirmModal').classList.add('flex');
        }

        function hideConfirmModal() {
            const modal = document.getElementById('confirmModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function submitImportForm() {
            hideConfirmModal();
            // Hiển thị loading
            const form = document.getElementById('importForm');
            const btns = form.querySelectorAll('button');
            btns.forEach(b => b.disabled = true);

            const loading = document.createElement('div');
            loading.className = 'mt-4 p-3 bg-blue-50 text-blue-700 rounded';
            loading.textContent = 'Đang xử lý import... Vui lòng đợi (có thể mất vài phút với file lớn).';
            form.appendChild(loading);

            form.submit();
        }

        // Tailwind script
        function initTailwind() {
            // already via CDN
        }
        initTailwind();
    </script>
</body>
</html>

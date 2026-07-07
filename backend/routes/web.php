<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\LegacyImportController;

Route::get('/', function () {
    return view('welcome');
});

// Legacy Import Web UI - Admin only (basic protection)
// Note: We do NOT use 'auth' middleware here because:
// - The main app uses API token auth, not web sessions.
// - Protection is handled inside the controller (allows in local env, checks role if logged in).
Route::get('/admin/legacy-import', [LegacyImportController::class, 'index'])->name('legacy-import.index');
Route::post('/admin/legacy-import', [LegacyImportController::class, 'import'])->name('legacy-import.run');
Route::get('/admin/legacy-import/result', [LegacyImportController::class, 'result'])->name('legacy-import.result');

// Download reports
Route::get('/admin/legacy-import/download', [LegacyImportController::class, 'downloadReport'])->name('legacy-import.download');

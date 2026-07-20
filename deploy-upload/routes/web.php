<?php

use App\Http\Controllers\LegacyImportController;
use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

// Legacy Import Web UI - Admin only (basic protection)
// Note: We do NOT use 'auth' middleware here because:
// - The main app uses API token auth, not web sessions.
// - Protection is handled inside the controller (allows in local env, checks role if logged in).
Route::get('/admin/legacy-import', [LegacyImportController::class, 'index'])->name('legacy-import.index');
Route::post('/admin/legacy-import', [LegacyImportController::class, 'import'])->name('legacy-import.run');
Route::get('/admin/legacy-import/result', [LegacyImportController::class, 'result'])->name('legacy-import.result');
Route::get('/admin/legacy-import/download', [LegacyImportController::class, 'downloadReport'])->name('legacy-import.download');

// React SPA (files live in public/index.html + public/assets).
// Real static files (js/css) are served by Apache before PHP when they exist on disk.
// /api/* is registered separately in routes/api.php.
Route::get('/', SpaController::class)->name('spa.home');
Route::get('/{any}', SpaController::class)->where('any', '.*')->name('spa');

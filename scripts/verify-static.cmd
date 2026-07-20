@echo off
setlocal EnableExtensions

echo ===== CLIENT TYPECHECK =====
call npm.cmd exec -w client -- tsc --noEmit
if errorlevel 1 exit /b 1

echo ===== CLIENT BUILD =====
call npm.cmd run build -w client
if errorlevel 1 exit /b 1

echo ===== LARAVEL TESTS =====
cd backend
REM Run core API, Settings and Staff regression tests on isolated SQLite.
call php artisan test --filter="CategoryCrudApi|Example|LocalWriteApi|ReadOnlyApi|SettingsApi|StaffManagement|WriteFlowApi|WarehouseTransferFlow|DashboardOverview"
if errorlevel 1 exit /b 1
cd ..

echo ===== DIFF CHECK =====
git diff --check
if errorlevel 1 exit /b 1

echo.
echo VERIFY_STATIC_PASS
exit /b 0

@echo off
setlocal EnableExtensions

echo ===== CLIENT TYPECHECK =====
call npm.cmd exec -w client -- tsc --noEmit
if errorlevel 1 exit /b 1

echo ===== CLIENT BUILD =====
call npm.cmd run build -w client
if errorlevel 1 exit /b 1

echo ===== SERVER BUILD =====
call npm.cmd run build -w server
if errorlevel 1 exit /b 1

echo ===== DIFF CHECK =====
git diff --check
if errorlevel 1 exit /b 1

echo.
echo VERIFY_STATIC_PASS
exit /b 0

@echo off
REM Create / reset local admin after full import (import SQL has 0 users by design).
REM Optional env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
setlocal
set "ROOT=%~dp0.."
if "%ADMIN_EMAIL%"=="" set "ADMIN_EMAIL=admin@gmail.com"
if "%ADMIN_PASSWORD%"=="" set "ADMIN_PASSWORD=123456"
if "%ADMIN_NAME%"=="" set "ADMIN_NAME=Admin"

echo Creating/updating local admin: %ADMIN_EMAIL%
php "%ROOT%\scripts\create-local-admin.php"
if errorlevel 1 (
  echo FAILED
  exit /b 1
)
echo Done. Login with that email/password on the app.
exit /b 0

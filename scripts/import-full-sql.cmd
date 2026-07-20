@echo off
REM Reliable import for artifacts/ladystars-full-import.sql (HeidiSQL often crashes on this size).
setlocal
set "ROOT=%~dp0.."
set "SQL=%ROOT%\artifacts\ladystars-full-import.sql"
set "MYSQL=C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe"

if not exist "%SQL%" (
  echo Missing SQL file: %SQL%
  exit /b 1
)
if not exist "%MYSQL%" (
  echo mysql.exe not found at %MYSQL%
  echo Edit this script if your Laragon MySQL path differs.
  exit /b 1
)

echo Importing into ladystars_php via mysql CLI...
echo File: %SQL%
echo This may take several minutes. Do not close this window.
echo.

"%MYSQL%" -h 127.0.0.1 -P 3306 -u root --default-character-set=utf8mb4 --max_allowed_packet=512M ladystars_php < "%SQL%"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo IMPORT FAILED with exit code %ERR%
  exit /b %ERR%
)

echo.
echo IMPORT OK
echo.
echo NOTE: import SQL TRUNCATES users and does NOT create admin (security).
echo After import, create login account:
echo   scripts\create-local-admin.cmd
echo Default: admin@gmail.com / 123456  (override ADMIN_EMAIL / ADMIN_PASSWORD env)
exit /b 0

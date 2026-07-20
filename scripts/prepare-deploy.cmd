@echo off
setlocal EnableExtensions
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-deploy.ps1"
exit /b %ERRORLEVEL%

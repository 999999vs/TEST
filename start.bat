@echo off
title Garage Pro - May chu noi bo
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai tai: https://nodejs.org
  pause
  exit /b 1
)
node server.js
pause

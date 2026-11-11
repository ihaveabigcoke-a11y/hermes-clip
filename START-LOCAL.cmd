@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/en/download first.
  pause
  exit /b 1
)
node "%~dp0desktop\setup-local.mjs"
if errorlevel 1 (
  echo.
  echo Product Lab Local could not start. Read the error above.
  pause
)

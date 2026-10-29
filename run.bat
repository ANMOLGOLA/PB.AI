@echo off
cd /d "%~dp0"
echo ========================================================
echo   Starting Where U Elevate - Sentinel Exam Platform
echo ========================================================

echo [1/2] Checking backend service on port 8000...
curl -s http://127.0.0.1:8000/health >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting FastAPI AI Proctoring backend...
    start /b python -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000
    timeout /t 3 /nobreak >nul
) else (
    echo Backend service is already running.
)

echo [2/2] Launching Secure Desktop Browser (Electron)...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0apps\desktop"

echo Application launched successfully.

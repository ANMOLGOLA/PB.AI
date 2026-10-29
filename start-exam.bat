@echo off
setlocal enabledelayedexpansion
title Where U Elevate - Sentinel Exam Client
cls
echo ======================================================================
echo          WHERE U ELEVATE - SENTINEL EXAM SECURE CLIENT
echo ======================================================================
echo.
set DEFAULT_SERVER=http://127.0.0.1:8000
echo Default Assessment Server: %DEFAULT_SERVER%
echo.
echo Press [ENTER] to connect to %DEFAULT_SERVER%
echo or enter a custom server address below:
set /p SERVER_INPUT="Server URL [%DEFAULT_SERVER%]: "
if "%SERVER_INPUT%"=="" set SERVER_INPUT=%DEFAULT_SERVER%

echo.
echo ----------------------------------------------------------------------
echo Connecting to: %SERVER_INPUT%
echo ----------------------------------------------------------------------
set VITE_API_URL=%SERVER_INPUT%

echo Launching Secure Exam Browser...
if exist "frontend\dist\main\index.js" (
    npx electron frontend
) else if exist "frontend" (
    npx electron frontend
) else if exist "apps\desktop" (
    npx electron apps/desktop
) else if exist "dist\main\index.js" (
    npx electron .
) else (
    echo [ERROR] Sentinel Exam files not detected in current directory.
    echo Please make sure this file is placed inside the Sentinel Exam root folder.
    pause
)

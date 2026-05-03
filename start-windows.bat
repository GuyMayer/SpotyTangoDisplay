@echo off
title SpotyTangoDisplay Relay
echo.
echo Starting SpotyTangoDisplay...
echo.

:: Check Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo.
    echo Download it free from https://nodejs.org  ^(LTS version^)
    echo Install it, then double-click this file again.
    echo.
    pause
    exit /b 1
)

:: Start relay in this window, then open browser after 2s
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3456/"
node relay.js

:: If relay exits (e.g. Ctrl+C), pause so window doesn't vanish instantly
echo.
echo Relay stopped. Press any key to close.
pause >nul

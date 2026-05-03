@echo off
title SpotyTangoDisplay Relay
:: Always run from the folder containing this script
cd /d "%~dp0"
echo.
echo Starting SpotyTangoDisplay...
echo.

:: Check Node.js is installed
where node >nul 2>&1
if not errorlevel 1 goto :start_relay

echo Node.js not found. Attempting to install automatically...
echo.

:: Try winget (built into Windows 10 1809+ and Windows 11)
where winget >nul 2>&1
if errorlevel 1 goto :no_winget

echo Installing Node.js LTS via Windows Package Manager...
echo This may take a minute. Please wait.
echo.
winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :install_failed

echo.
echo Node.js installed successfully!
echo Please double-click this file again to start the relay.
echo.
pause
exit /b 0

:no_winget
echo Windows Package Manager ^(winget^) is not available on this PC.
echo.
echo Opening the Node.js download page in your browser...
start https://nodejs.org/en/download
echo Install Node.js ^(LTS version^), then double-click this file again.
echo.
pause
exit /b 1

:install_failed
echo.
echo Automatic install failed. Please install Node.js manually:
echo   https://nodejs.org  ^(LTS version^)
echo Then double-click this file again.
echo.
pause
exit /b 1

:start_relay

:: Launch tray app in a new detached window, then exit this one
start "SpotyTangoDisplayTray" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0relay-tray.ps1"
exit
pause >nul

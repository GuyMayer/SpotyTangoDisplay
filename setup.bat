@echo off
title SpotyTangoDisplay Setup
cd /d "%~dp0"

echo.
echo  SpotyTangoDisplay - DJ Display Setup
echo  =====================================
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if not errorlevel 1 goto :check_project

echo Node.js not found.
echo.

:: Try winget (Windows 10 1809+ / Windows 11)
where winget >nul 2>&1
if errorlevel 1 goto :manual_node

echo Installing Node.js LTS via winget...
winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :manual_node

echo.
echo Node.js installed. Please restart this setup.
echo.
pause
exit /b 0

:manual_node
echo Opening the Node.js download page...
start https://nodejs.org/en/download
echo.
echo Install Node.js (LTS version), then run this setup again.
echo.
pause
exit /b 1

:check_project
:: If relay.js exists in current folder, we're already in the project
if exist "relay.js" goto :start_relay

:: Otherwise download the latest release
echo Downloading SpotyTangoDisplay...
echo.
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/GuyMayer/SpotyTangoDisplay/archive/refs/heads/main.zip' -OutFile '%TEMP%\SpotyTangoDisplay.zip'"
if errorlevel 1 (
  echo Download failed. Check your internet connection.
  pause
  exit /b 1
)

echo Extracting...
powershell -NoProfile -Command "Expand-Archive -Path '%TEMP%\SpotyTangoDisplay.zip' -DestinationPath '%TEMP%\SpotyTangoDisplay' -Force"

:: Move to a permanent location
echo Installing to %%USERPROFILE%%\SpotyTangoDisplay...
if exist "%USERPROFILE%\SpotyTangoDisplay" rmdir /s /q "%USERPROFILE%\SpotyTangoDisplay"
move /Y "%TEMP%\SpotyTangoDisplay\SpotyTangoDisplay-main" "%USERPROFILE%\SpotyTangoDisplay" >nul 2>&1
cd /d "%USERPROFILE%\SpotyTangoDisplay"

:: Clean up temp
del /q "%TEMP%\SpotyTangoDisplay.zip" >nul 2>&1
rmdir /s /q "%TEMP%\SpotyTangoDisplay" >nul 2>&1

echo Done. Starting relay...
echo.

:start_relay
:: Start relay and open browser
start "SpotyTangoDisplay" /min cmd /c "node relay.js"

:: Wait for relay to start
echo Waiting for relay to start...
timeout /t 2 /nobreak >nul

:: Open the control panel
start http://127.0.0.1:3456

echo.
echo  SpotyTangoDisplay is running!
echo  Control panel: http://127.0.0.1:3456
echo  DJ laptop IP:  see relay console window for display URL
echo.
echo  Press any key to open display screen on this PC (for testing)...
pause >nul
start http://127.0.0.1:3456/display.html

echo.
echo  Setup complete. The relay runs in a minimised window.
echo  Close the relay window to stop.
echo.
pause

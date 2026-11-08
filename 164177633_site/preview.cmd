@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================================
echo  Local preview server
echo    App : http://localhost:8123/
echo    Demo: http://localhost:8123/_cc-demo.html
echo    LAN : same URLs with this PC IP (printed below) - for phone
echo  Server runs in the minimized window; close it to stop.
echo ================================================================
echo.
if /I "%~1"=="lan" goto run
start "" /min node _serve.cjs 8123 site 0.0.0.0
timeout /t 2 >nul
start "" http://localhost:8123/
start "" http://localhost:8123/_cc-demo.html
echo Browsers opened. If it says "cannot connect", refresh after a second.
pause
exit /b 0

:run
node _serve.cjs 8123 site 0.0.0.0
pause

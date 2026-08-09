@echo off
echo ========================================
echo  Gaming Kiosk - Windows Setup
echo ========================================

:: Set kiosk as Windows shell (replaces explorer.exe)
:: This makes the kiosk launch on boot instead of desktop
echo.
echo [1/3] Configuring Windows Shell...
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d "C:\GamingKiosk\gaming-kiosk.exe" /f

:: Disable Windows key and other shortcuts
echo [2/3] Disabling system shortcuts...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v NoWinKeys /t REG_DWORD /d 1 /f

:: Add to startup
echo [3/3] Adding to startup...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v GamingKiosk /t REG_SZ /d "C:\GamingKiosk\gaming-kiosk.exe" /f

echo.
echo Done! Restart Windows to apply kiosk mode.
echo To exit kiosk: hold Y button on PXN CB1 for 3 seconds to open admin panel.
pause

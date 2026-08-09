@echo off
echo ========================================
echo  Gaming Kiosk - Windows Setup
echo ========================================

:: Set kiosk as Windows shell (replaces explorer.exe)
:: This makes the kiosk launch on boot instead of desktop
echo.
echo [1/4] Configuring Windows Shell...
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d "C:\GamingKiosk\gaming-kiosk.exe" /f

:: Disable Windows key and other shortcuts
echo [2/4] Disabling system shortcuts...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v NoWinKeys /t REG_DWORD /d 1 /f

:: Add to startup
echo [3/4] Adding to startup...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v GamingKiosk /t REG_SZ /d "C:\GamingKiosk\gaming-kiosk.exe" /f

:: STAY_IN_CAR=0 makes acs.exe show a "getting into the car" prompt that
:: needs a click to dismiss before driving — no mouse on the kiosk, so this
:: has to be 1. One-time edit of AC's own install-wide config, not something
:: race.ini (regenerated per session) can set.
echo [4/4] Configuring Assetto Corsa to skip the get-in-car prompt...
powershell -Command "(Get-Content 'D:\SteamLibrary\steamapps\common\assettocorsa\system\cfg\pitstop.ini') -replace 'STAY_IN_CAR=0', 'STAY_IN_CAR=1' | Set-Content 'D:\SteamLibrary\steamapps\common\assettocorsa\system\cfg\pitstop.ini'"

echo.
echo Done! Restart Windows to apply kiosk mode.
echo To exit kiosk: hold Y button on PXN CB1 for 3 seconds to open admin panel.
pause

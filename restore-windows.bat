@echo off
echo Restoring Windows shell to explorer.exe...
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d "explorer.exe" /f
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v NoWinKeys /f
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v GamingKiosk /f
echo Done! Restart Windows to restore normal desktop.
pause

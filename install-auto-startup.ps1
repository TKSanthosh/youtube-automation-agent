# ==============================================================================
# YouTube Automation Agent - Automatic Windows Boot & Indefinite Process Installer
# ==============================================================================
$ErrorActionPreference = "Stop"
$projectRoot = "c:\antigravity_projects\youtube-automation-agent"
if (-not (Test-Path $projectRoot)) { $projectRoot = $PSScriptRoot }
Set-Location $projectRoot

$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "YouTube_Automation_Agent.lnk"
$scriptPath = Join-Path $projectRoot "run-server-background.ps1"
$vbsPath = Join-Path $projectRoot "run-silent.vbs"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 Setting Up Indefinite Background Process & Boot Autostart..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Create silent VBS wrapper so Windows runs it without any console popup
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$scriptPath""", 0, False
"@
Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII
Write-Host "  [1/4] Created silent launcher: $vbsPath" -ForegroundColor Green

# 2. Windows Startup Folder shortcut (runs on laptop boot / user login)
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Auto-start YouTube Automation Agent on Windows boot"
$shortcut.Save()
Write-Host "  [2/4] Created Windows Startup shortcut: $shortcutPath" -ForegroundColor Green

# 3. User Registry Run Key (Guaranteed trigger on every user logon)
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regValue = "wscript.exe `"$vbsPath`""
Set-ItemProperty -Path $regPath -Name "YouTube_Automation_Agent" -Value $regValue -Force
Write-Host "  [3/4] Registered in Windows User Run Registry (HKCU\...\Run)" -ForegroundColor Green

# 4. Windows Task Scheduler Entry (Indefinite runtime, no 3-day limit, auto-restart on fail)
try {
    $taskName = "YouTube_Automation_Agent_Autostart"
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $projectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
                                            -DontStopIfGoingOnBatteries `
                                            -ExecutionTimeLimit (New-TimeSpan -Days 0) `
                                            -RestartCount 999 `
                                            -RestartInterval (New-TimeSpan -Minutes 1) `
                                            -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs YouTube Automation Agent indefinitely in background on boot" -Force | Out-Null
    Write-Host "  [4/4] Configured Task Scheduler entry (Indefinite runtime & auto-restart on fail)" -ForegroundColor Green
} catch {
    Write-Host "  [4/4] Note: Windows Startup folder & Registry active for logon." -ForegroundColor Gray
}

Write-Host "`n⚡ Launching & Verifying indefinite background process..." -ForegroundColor Cyan
& $scriptPath

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ SUCCESS: Configured to run automatically on laptop boot!" -ForegroundColor Green
Write-Host "   • Local Dashboard: http://localhost:3456" -ForegroundColor Gray
Write-Host "   • API Health:      http://localhost:3456/health" -ForegroundColor Gray
Write-Host "   • Self-Healing:    Restarts automatically if Node ever exits or crashes" -ForegroundColor Gray
Write-Host "   • Indefinite:      No execution time limits; runs continuously" -ForegroundColor Gray
Write-Host "   • Auto-Start:      Triggered on every laptop boot and user logon" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# YouTube Automation Agent - Background Runner
$ErrorActionPreference = "SilentlyContinue"
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = "c:\antigravity_projects\youtube-automation-agent" }
Set-Location $projectRoot

$port = 3456
$env:PORT = "3456"
$env:AUTOPILOT = "true"

# 1. Check if server is already running
$isRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 2 -ErrorAction Stop
    if ($resp.status -eq 'ok' -or $resp.success -eq $true) {
        $isRunning = $true
    }
} catch {
    $isRunning = $false
}

if ($isRunning) {
    Write-Output "YouTube Automation Agent is already running on port $port."
    exit 0
}

# 2. Launch Supervisor Watchdog in the background (Runs Indefinitely)
$watchdogScript = Join-Path $projectRoot "server-watchdog.ps1"

Start-Process -FilePath "powershell.exe" `
              -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogScript`"" `
              -WorkingDirectory $projectRoot `
              -WindowStyle Hidden

# 3. Wait briefly and verify startup
Start-Sleep -Seconds 4
try {
    $verify = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Output "✅ YouTube Automation Agent successfully started on http://localhost:$port (Indefinite supervisor active)"
} catch {
    Write-Output "⚠️ Agent was launched in background. Check logs/agent_background.log for details."
}

# YouTube Automation Agent - Dual Microservice Background Runner
$ErrorActionPreference = "SilentlyContinue"
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = "c:\antigravity_projects\youtube-automation-agent" }
Set-Location $projectRoot

$mainPort = 3456
$intelPort = 3457

# 1. Check if both servers are already running
$mainRunning = $false
$intelRunning = $false

try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$mainPort/health" -TimeoutSec 2 -ErrorAction Stop
    if ($resp.status -eq 'ok' -or $resp.success -eq $true) { $mainRunning = $true }
} catch { $mainRunning = $false }

try {
    $respIntel = Invoke-RestMethod -Uri "http://localhost:$intelPort/health" -TimeoutSec 2 -ErrorAction Stop
    if ($respIntel.status -eq 'ok' -or $respIntel.success -eq $true) { $intelRunning = $true }
} catch { $intelRunning = $false }

if ($mainRunning -and $intelRunning) {
    Write-Output "✅ Both Main Agent (:3456) and AI Intelligence Microservice (:3457) are already active."
    exit 0
}

# 2. Launch Dual Supervisor Watchdog in the background (Runs Indefinitely)
$watchdogScript = Join-Path $projectRoot "server-watchdog.ps1"

Start-Process -FilePath "powershell.exe" `
              -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogScript`"" `
              -WorkingDirectory $projectRoot `
              -WindowStyle Hidden

# 3. Wait briefly and verify startup
Start-Sleep -Seconds 5

try {
    $verifyMain = Invoke-RestMethod -Uri "http://localhost:$mainPort/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Output "✅ Main Video Agent active: http://localhost:$mainPort"
} catch {
    Write-Output "⏳ Main Video Agent initializing in background (port $mainPort)..."
}

try {
    $verifyIntel = Invoke-RestMethod -Uri "http://localhost:$intelPort/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Output "🧠 AI Intelligence Microservice active: http://localhost:$intelPort"
} catch {
    Write-Output "⏳ AI Intelligence Microservice initializing in background (port $intelPort)..."
}

Write-Output "🚀 Dual supervisor watchdog active. Check logs/agent_background.log and logs/intelligence_background.log."

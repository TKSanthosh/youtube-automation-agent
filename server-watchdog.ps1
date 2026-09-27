# ==============================================================================
# YouTube Automation Agent - Dual Microservice Process Supervisor / Watchdog
# Supervises:
#  1. Main YouTube Video Creation Agent (Port 3456, index.js)
#  2. AI Trend & Engagement Intelligence Microservice (Port 3457, services/intelligence-service.js)
# ==============================================================================
$projectRoot = "c:\antigravity_projects\youtube-automation-agent"
if (-not (Test-Path $projectRoot)) { $projectRoot = $PSScriptRoot }
Set-Location $projectRoot

$env:PORT = "3456"
$env:INTEL_PORT = "3457"
$env:AUTOPILOT = "true"

$logsDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$mainLog = Join-Path $logsDir "agent_background.log"
$mainErr = Join-Path $logsDir "agent_background_err.log"
$intelLog = Join-Path $logsDir "intelligence_background.log"
$intelErr = Join-Path $logsDir "intelligence_background_err.log"
$stopSignal = Join-Path $projectRoot ".stop_signal"

if (Test-Path $stopSignal) {
    Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
}

# Resolve node binary
$nodePath = "node"
if (Test-Path "C:\Users\Santhosh\nodejs-bin\node.exe") {
    $nodePath = "C:\Users\Santhosh\nodejs-bin\node.exe"
}

$procMain = $null
$procIntel = $null

function Start-MainAgent {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $mainLog -Value "[$ts] Supervisor: Launching Main Video Automation Agent (Port 3456)..."
    return Start-Process -FilePath $nodePath `
                         -ArgumentList @("index.js") `
                         -WorkingDirectory $projectRoot `
                         -RedirectStandardOutput $mainLog `
                         -RedirectStandardError $mainErr `
                         -WindowStyle Hidden `
                         -PassThru
}

function Start-IntelService {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $intelLog -Value "[$ts] Supervisor: Launching AI Trend & Engagement Microservice (Port 3457)..."
    return Start-Process -FilePath $nodePath `
                         -ArgumentList @("services/intelligence-service.js") `
                         -WorkingDirectory $projectRoot `
                         -RedirectStandardOutput $intelLog `
                         -RedirectStandardError $intelErr `
                         -WindowStyle Hidden `
                         -PassThru
}

# Initial startup of both services
$procMain = Start-MainAgent
$procIntel = Start-IntelService

while ($true) {
    # Check stop signal
    if (Test-Path $stopSignal) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $mainLog -Value "[$ts] Stop signal detected. Terminating all microservices."
        Add-Content -Path $intelLog -Value "[$ts] Stop signal detected. Terminating all microservices."
        
        if ($procMain -and -not $procMain.HasExited) { Stop-Process -Id $procMain.Id -Force -ErrorAction SilentlyContinue }
        if ($procIntel -and -not $procIntel.HasExited) { Stop-Process -Id $procIntel.Id -Force -ErrorAction SilentlyContinue }
        Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
        break
    }

    # Monitor Main Agent
    if (-not $procMain -or $procMain.HasExited) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $mainLog -Value "[$ts] WARNING: Main Agent exited. Self-healing restart in 3s..."
        Start-Sleep -Seconds 3
        $procMain = Start-MainAgent
    }

    # Monitor Intelligence Service
    if (-not $procIntel -or $procIntel.HasExited) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $intelLog -Value "[$ts] WARNING: Intelligence Microservice exited. Self-healing restart in 3s..."
        Start-Sleep -Seconds 3
        $procIntel = Start-IntelService
    }

    Start-Sleep -Seconds 4
}

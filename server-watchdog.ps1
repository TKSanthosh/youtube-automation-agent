# ==============================================================================
# YouTube Automation Agent - Indefinite Process Supervisor / Watchdog
# ==============================================================================
$projectRoot = "c:\antigravity_projects\youtube-automation-agent"
if (-not (Test-Path $projectRoot)) { $projectRoot = $PSScriptRoot }
Set-Location $projectRoot

$port = 3456
$env:PORT = "3456"
$env:AUTOPILOT = "true"

$logsDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$logFile = Join-Path $logsDir "agent_background.log"
$errLogFile = Join-Path $logsDir "agent_background_err.log"
$stopSignal = Join-Path $projectRoot ".stop_signal"

if (Test-Path $stopSignal) {
    Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
}

# Resolve node path
$nodePath = "node"
if (Test-Path "C:\Users\Santhosh\nodejs-bin\node.exe") {
    $nodePath = "C:\Users\Santhosh\nodejs-bin\node.exe"
}

while ($true) {
    if (Test-Path $stopSignal) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $logFile -Value "[$ts] Stop signal detected. Exiting watchdog supervisor."
        Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
        break
    }

    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $logFile -Value "[$ts] Supervisor: Launching YouTube Automation Agent process..."

    $nodeArgs = @("index.js")
    $proc = Start-Process -FilePath $nodePath `
                          -ArgumentList $nodeArgs `
                          -WorkingDirectory $projectRoot `
                          -RedirectStandardOutput $logFile `
                          -RedirectStandardError $errLogFile `
                          -WindowStyle Hidden `
                          -PassThru

    if ($proc) {
        $proc.WaitForExit()
    }

    if (Test-Path $stopSignal) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $logFile -Value "[$ts] Stop signal detected after node exit. Exiting watchdog supervisor."
        Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
        break
    }

    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $logFile -Value "[$ts] WARNING: Node process exited. Respawning indefinitely in 3 seconds..."
    Start-Sleep -Seconds 3
}

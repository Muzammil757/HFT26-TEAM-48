# ShadowGuard AI - one-command demo launcher (Windows PowerShell).
#
#   powershell -ExecutionPolicy Bypass -File .\start_demo.ps1
#   powershell -ExecutionPolicy Bypass -File .\start_demo.ps1 -NoCollector
#   powershell -ExecutionPolicy Bypass -File .\start_demo.ps1 -NoRelay
#
# Frees ports 8000/5173/11435, regenerates demo data with recent timestamps, resets the
# database, starts the backend and the frontend in their own windows (they keep
# running after this script ends), loads scenarios 01-04, 06 and 07, starts the
# Local LLM Guard relay (llm_relay.py) in a third window, and restores demo_data/
# so the repo stays clean. Scenario 05 is played live by demo_agent.py.

param(
    [switch]$NoCollector,  # start the backend with COLLECTOR_ENABLED=0
    [switch]$NoRelay       # don't start the Local LLM Guard relay on 11435
)

# "Continue", not "Stop": Windows PowerShell 5.1 turns any stderr output of a native
# program (python warnings, git/npm progress) into a terminating error. Exit codes
# are checked explicitly instead.
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$ApiUrl = "http://127.0.0.1:8000"
$AppUrl = "http://127.0.0.1:5173"
$RelayPort = 11435

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Stop-Port($port) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) { Write-Host "    port $port is free"; return }
    foreach ($procId in $owners) {
        $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "    stopped $name (PID $procId) on port $port"
    }
}

# Close the backend/frontend windows of earlier runs (and the servers inside them),
# so relaunching never piles up idle PowerShell windows.
function Close-DemoWindows {
    $windows = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match "WindowTitle='ShadowGuard (backend|frontend|relay)'" }
    foreach ($w in $windows) {
        cmd /c "taskkill /T /F /PID $($w.ProcessId) >nul 2>&1"
    }
    if ($windows) { Write-Host "    closed $(@($windows).Count) old ShadowGuard window(s)" }
}

function Wait-Url($url, $seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

# Use backend\venv only if it has every backend dependency; otherwise system Python.
$Python = "python"
$VenvPython = Join-Path $Backend "venv\Scripts\python.exe"
if (Test-Path $VenvPython) {
    cmd /c "`"$VenvPython`" -c `"import fastapi, uvicorn, psutil, openai, requests`" >nul 2>&1"
    if ($LASTEXITCODE -eq 0) { $Python = $VenvPython }
}

Step "Freeing ports 8000, 5173 and $RelayPort"
Close-DemoWindows
Stop-Port 8000
Stop-Port 5173
Stop-Port $RelayPort
Start-Sleep -Seconds 1

Step "Regenerating demo data and resetting the database (python: $Python)"
Push-Location $Backend
try {
    & $Python demo_reset.py --fresh
    if ($LASTEXITCODE -ne 0) { throw "demo_reset.py failed" }
} finally { Pop-Location }

Step "Starting the backend in its own window"
$collector = if ($NoCollector) { "`$env:COLLECTOR_ENABLED='0'; " } else { "" }
$backendCmd = "`$Host.UI.RawUI.WindowTitle='ShadowGuard backend'; Set-Location '$Backend'; $collector& '$Python' main.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd | Out-Null
if (-not (Wait-Url "$ApiUrl/api/health" 60)) { throw "Backend did not answer on $ApiUrl within 60 s (see its window)" }
Write-Host "    backend is up"

Step "Loading demo scenarios 01 02 03 04 06 07"
Push-Location $Backend
try {
    $files = "01", "02", "03", "04", "06", "07" | ForEach-Object {
        (Get-ChildItem (Join-Path $Root "demo_data") -Filter "$($_)_*.jsonl").FullName
    }
    & $Python load_demo.py @files
    if ($LASTEXITCODE -ne 0) { throw "load_demo.py failed" }
} finally { Pop-Location }

if (-not $NoRelay) {
    Step "Starting the Local LLM Guard relay in its own window"
    $relayCmd = "`$Host.UI.RawUI.WindowTitle='ShadowGuard relay'; Set-Location '$Backend'; & '$Python' llm_relay.py"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $relayCmd | Out-Null
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Get-NetTCPConnection -LocalPort $RelayPort -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
    }
    if (Get-NetTCPConnection -LocalPort $RelayPort -State Listen -ErrorAction SilentlyContinue) { Write-Host "    relay is up" }
    else { Write-Host "    relay did not start (see its window)" -ForegroundColor Yellow }
}

Step "Restoring demo_data/ (regenerated files are not committed)"
Push-Location $Root
cmd /c "git checkout -- demo_data >nul 2>&1"
if ($LASTEXITCODE -eq 0) { Write-Host "    demo_data restored" } else { Write-Host "    (git not available; demo_data left as generated)" }
Pop-Location

Step "Starting the frontend in its own window"
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    Push-Location $Frontend
    try { npm install } finally { Pop-Location }
}
$frontendCmd = "`$Host.UI.RawUI.WindowTitle='ShadowGuard frontend'; Set-Location '$Frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null
if (-not (Wait-Url $AppUrl 60)) { throw "Frontend did not answer on $AppUrl within 60 s (see its window)" }

$health = Invoke-RestMethod "$ApiUrl/api/health"
Step "Ready"
Write-Host "    Dashboard : $AppUrl" -ForegroundColor Green
Write-Host "    API       : $ApiUrl  (docs: $ApiUrl/docs)" -ForegroundColor Green
Write-Host "    Analyzer  : $($health.analyzer)"
Write-Host "    Collector : $(if ($NoCollector) { 'off' } else { 'on' })"
if ($NoRelay) { Write-Host "    LLM relay : off" }
else { Write-Host "    LLM relay : http://127.0.0.1:$RelayPort  (opt in: `$env:OLLAMA_HOST='127.0.0.1:$RelayPort')" -ForegroundColor Green }
Write-Host "`n    Live demo : cd backend; $Python demo_agent.py"
if (-not $NoRelay) { Write-Host "    Relay demo: cd backend; $Python relay_demo.py" }
Write-Host "    Stop all  : powershell -ExecutionPolicy Bypass -File .\stop_demo.ps1"

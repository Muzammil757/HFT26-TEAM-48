# ShadowGuard AI - stop the demo servers (frees ports 8000, 5173 and 11435) and close
# the backend/frontend/relay windows that start_demo.ps1 opened.
#
#   powershell -ExecutionPolicy Bypass -File .\stop_demo.ps1

$windows = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match "WindowTitle='ShadowGuard (backend|frontend|relay)'" }
foreach ($w in $windows) {
    cmd /c "taskkill /T /F /PID $($w.ProcessId) >nul 2>&1"
}
if ($windows) { Write-Host "closed $(@($windows).Count) ShadowGuard window(s)" }

foreach ($port in 8000, 5173, 11435) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) { Write-Host "port $port is free"; continue }
    foreach ($procId in $owners) {
        $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "stopped $name (PID $procId) on port $port"
    }
}

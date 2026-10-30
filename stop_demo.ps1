# ShadowGuard AI - stop the demo servers (frees ports 8000 and 5173).
#
#   powershell -ExecutionPolicy Bypass -File .\stop_demo.ps1

foreach ($port in 8000, 5173) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) { Write-Host "port $port is free"; continue }
    foreach ($procId in $owners) {
        $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "stopped $name (PID $procId) on port $port"
    }
}

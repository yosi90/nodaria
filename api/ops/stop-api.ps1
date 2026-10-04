# Para el vigilante y la API (no desinstala la tarea; vuelve a arrancar con el equipo).
param([int]$Port = 5003)
$ErrorActionPreference = 'Stop'

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -match 'nodaria\\api\\ops\\run-api\.ps1' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
        Write-Host "Vigilante parado (PID $($_.ProcessId))."
    }

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    Stop-Process -Id $listener.OwningProcess -Force
    Write-Host "API parada (PID $($listener.OwningProcess))."
}

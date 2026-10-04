# Reinicia la API para cargar un build nuevo. Uso tras desplegar: npm run build; .\ops\restart-api.ps1
# La API corre en la sesión de la tarea programada y no se puede parar desde otra sesión,
# así que se le pide por archivo: la API lo detecta, se cierra y el vigilante la vuelve a
# arrancar con el código nuevo.
param([int]$Port = 5003, [int]$TimeoutSeconds = 60)
$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $apiRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$before = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $before) {
    Write-Host "No hay nada escuchando en el puerto $Port. ¿Está el vigilante en marcha? (ops\status.ps1)"
    exit 1
}

New-Item -ItemType File -Force -Path (Join-Path $logDir 'restart.request') | Out-Null
Write-Host "Reinicio solicitado a la API (PID $($before.OwningProcess))..."

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $now = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($now -and $now.OwningProcess -ne $before.OwningProcess) {
        Write-Host "API reiniciada (PID $($now.OwningProcess))."
        exit 0
    }
}
Write-Host "La API no se ha reiniciado en $TimeoutSeconds s. Revisa logs\supervisor.log y logs\stderr.log."
exit 1

# Instalación de producción que requiere administrador. Ejecutar una vez desde
# PowerShell como administrador:  & "C:\Users\Yosi\Desktop\nodaria\api\ops\install-autostart.ps1"
#  - Tarea "Nodaria API": vigilante de la API al iniciar Windows (identidad del usuario, S4U).
#  - Tarea "Nodaria DB Backup": copia diaria de la base a las 04:40.
#  - Permiso de escritura de SQL Server en la carpeta de copias.
#  - Reinicio del servicio Cloudflared para cargar nodaria-api.yosiftware.es del config.yml.
param(
    [string]$UserName = "$env:USERDOMAIN\Yosi",
    [string]$BackupDir = 'C:\Users\Yosi\nodaria-backups\db',
    [switch]$SkipCloudflaredRestart
)
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecuta este instalador desde PowerShell como administrador.'
}

$opsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiRoot = Split-Path -Parent $opsRoot
$powershell = Join-Path $PSHOME 'powershell.exe'
$principal = New-ScheduledTaskPrincipal -UserId $UserName -LogonType S4U -RunLevel Limited

# 1. Vigilante de la API. Sin límite de duración: el vigilante no termina nunca.
$apiAction = New-ScheduledTaskAction -Execute $powershell -WorkingDirectory $apiRoot `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$opsRoot\run-api.ps1`""
$apiTrigger = New-ScheduledTaskTrigger -AtStartup
$apiTrigger.Delay = 'PT45S'
$apiSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'Nodaria API' -Force -InputObject (New-ScheduledTask -Action $apiAction `
    -Trigger $apiTrigger -Principal $principal -Settings $apiSettings `
    -Description 'API de Nodaria (puerto 5003) con reinicio automático. Logs en api\logs.') | Out-Null
Write-Host 'Tarea instalada: Nodaria API (inicio de Windows + 45 s)'

# 2. Copia diaria de la base.
$backupAction = New-ScheduledTaskAction -Execute $powershell -WorkingDirectory $apiRoot `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$opsRoot\backup-db.ps1`" -BackupDir `"$BackupDir`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At '04:40'
$backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'Nodaria DB Backup' -Force -InputObject (New-ScheduledTask -Action $backupAction `
    -Trigger $backupTrigger -Principal $principal -Settings $backupSettings `
    -Description 'Copia de seguridad diaria de la base Nodaria (30 días).') | Out-Null
Write-Host 'Tarea instalada: Nodaria DB Backup (cada día a las 04:40)'

# 3. SQL Server escribe el .bak con su propia cuenta de servicio.
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
icacls $BackupDir /grant 'NT SERVICE\MSSQL$SQLEXPRESS:(OI)(CI)M' | Out-Null
Write-Host "Permiso de SQL Server concedido en $BackupDir"

# 4. Pasa el vigilante, si lo había arrancado a mano, a la tarea programada.
& (Join-Path $opsRoot 'stop-api.ps1')
Start-ScheduledTask -TaskName 'Nodaria API'
Write-Host 'Tarea Nodaria API iniciada.'

# 5. Cloudflared solo lee config.yml al arrancar.
if (-not $SkipCloudflaredRestart) {
    Restart-Service -Name Cloudflared
    Write-Host 'Servicio Cloudflared reiniciado (nodaria-api.yosiftware.es activo).'
}

Write-Host 'Comprueba el estado con ops\status.ps1.'

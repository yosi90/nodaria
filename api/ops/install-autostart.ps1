# Instalación de producción que requiere administrador. Ejecutar una vez desde
# PowerShell como administrador:  & "C:\Users\Yosi\Desktop\nodaria\api\ops\install-autostart.ps1"
#  - Tarea "Nodaria API": vigilante de la API al iniciar Windows (2 minutos después, kit 1.81).
#    Si la tarea ya existe, no se toca su usuario: en producción corre con la cuenta de servicio
#    svc-nodaria-pro, que gestiona la plataforma (ecosistema-kit/SERVIDOR.md, punto 3).
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
# Al iniciar Windows, SQL Server tarda en aceptar conexiones: la API arranca sin la base y se
# recupera sola, y este retraso es solo una red de seguridad (al menos 2 minutos).
$apiTrigger = New-ScheduledTaskTrigger -AtStartup
$apiTrigger.Delay = 'PT2M'
$apiSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$existing = Get-ScheduledTask -TaskName 'Nodaria API' -ErrorAction SilentlyContinue
$fresh = -not $existing
if ($fresh) {
    Register-ScheduledTask -TaskName 'Nodaria API' -InputObject (New-ScheduledTask -Action $apiAction `
        -Trigger $apiTrigger -Principal $principal -Settings $apiSettings `
        -Description 'API de Nodaria (puerto 5003) con reinicio automático. Logs en api\logs.') | Out-Null
    Write-Host 'Tarea instalada: Nodaria API (inicio de Windows + 2 min)'
} elseif (($existing.Principal.UserId -split '\\')[-1] -ne ($UserName -split '\\')[-1]) {
    # Corre con otra cuenta (la de servicio): cambiarla pediría su contraseña, que pone la
    # herramienta de la plataforma. No se toca; solo se avisa si le falta el retraso.
    Write-Host "Tarea Nodaria API: ya existe con la cuenta $($existing.Principal.UserId); no se toca."
    $startup = $existing.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' }
    $delay = if ($startup -and $startup.Delay) { [Xml.XmlConvert]::ToTimeSpan($startup.Delay) } else { [TimeSpan]::Zero }
    if ($delay -lt [TimeSpan]::FromMinutes(2)) {
        Write-Warning "Su retraso al iniciar Windows es $delay. Pídelo a la plataforma (ops\cuentas-de-servicio.ps1)."
    }
} else {
    # Con el mismo usuario: se cambian la acción, el disparador y los ajustes, nunca el usuario.
    Set-ScheduledTask -TaskName 'Nodaria API' -Action $apiAction -Trigger $apiTrigger -Settings $apiSettings | Out-Null
    Write-Host 'Tarea actualizada: Nodaria API (inicio de Windows + 2 min), con su usuario de siempre.'
}

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

# 4. Solo en una instalación nueva: pasa el vigilante, si lo había arrancado a mano, a la tarea.
if ($fresh) {
    & (Join-Path $opsRoot 'stop-api.ps1')
    Start-ScheduledTask -TaskName 'Nodaria API'
    Write-Host 'Tarea Nodaria API iniciada.'
}

# 5. Cloudflared solo lee config.yml al arrancar.
if (-not $SkipCloudflaredRestart) {
    Restart-Service -Name Cloudflared
    Write-Host 'Servicio Cloudflared reiniciado (nodaria-api.yosiftware.es activo).'
}

Write-Host 'Comprueba el estado con ops\status.ps1.'

# Estado de producción: tareas, proceso, salud local y pública, última copia.
param([int]$Port = 5003, [string]$PublicUrl = 'https://nodaria-api.yosiftware.es', [string]$BackupDir = 'C:\Users\Yosi\nodaria-backups\db')

foreach ($name in 'Nodaria API', 'Nodaria DB Backup') {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($task) {
        $info = $task | Get-ScheduledTaskInfo
        Write-Host ("Tarea {0}: {1} (última ejecución {2}, resultado {3})" -f $name, $task.State, $info.LastRunTime, $info.LastTaskResult)
    } else {
        Write-Host "Tarea ${name}: no instalada (ops\install-autostart.ps1 como administrador)"
    }
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { Write-Host "Puerto ${Port}: PID $($listener.OwningProcess)" } else { Write-Host "Puerto ${Port}: nadie escuchando" }

foreach ($url in "http://127.0.0.1:$Port/api/health", "$PublicUrl/api/health") {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
        Write-Host "$url -> $($response.StatusCode) $($response.Content)"
    } catch {
        Write-Host "$url -> ERROR $($_.Exception.Message)"
    }
}

$lastBackup = Get-ChildItem $BackupDir -Filter 'Nodaria-*.bak' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($lastBackup) { Write-Host "Última copia: $($lastBackup.Name) ($($lastBackup.LastWriteTime))" } else { Write-Host 'Última copia: ninguna' }

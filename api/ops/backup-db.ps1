# Copia de seguridad completa de la base Nodaria. La lanza a diario la tarea
# "Nodaria DB Backup". La cuenta del servicio de SQL Server necesita permiso de
# escritura en la carpeta (install-autostart.ps1 lo concede).
param(
    [string]$BackupDir = 'C:\Users\Yosi\nodaria-backups\db',
    [int]$KeepDays = 30,
    [string]$Server = 'localhost\SQLEXPRESS',
    [string]$Database = 'Nodaria'
)
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$log = Join-Path $BackupDir 'backup.log'
$file = Join-Path $BackupDir ('{0}-{1}.bak' -f $Database, (Get-Date -Format 'yyyyMMdd-HHmm'))

try {
    # -C: el certificado de SQL Express es autofirmado. -b: código de salida si falla.
    $output = sqlcmd -S $Server -E -C -b -Q "BACKUP DATABASE [$Database] TO DISK = N'$file' WITH INIT, CHECKSUM" 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output -join ' ') }

    $old = Get-ChildItem -LiteralPath $BackupDir -Filter "$Database-*.bak" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) }
    $old | Remove-Item -Force
    "[$([DateTime]::Now.ToString('s'))] OK $file ($([Math]::Round((Get-Item $file).Length / 1KB)) KB); borradas $(@($old).Count) antiguas." |
        Out-File -LiteralPath $log -Append -Encoding utf8
} catch {
    "[$([DateTime]::Now.ToString('s'))] ERROR $($_.Exception.Message)" | Out-File -LiteralPath $log -Append -Encoding utf8
    throw
}

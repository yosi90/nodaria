# Vigilante de la API de Nodaria: arranca dist/server.js y lo reinicia si se cae.
# Lo lanza la tarea programada "Nodaria API" al iniciar Windows (ver install-autostart.ps1).
$ErrorActionPreference = 'Stop'

$apiRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $apiRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$supervisorLog = Join-Path $logDir 'supervisor.log'

function Write-Log([string]$message) {
    "[$([DateTime]::Now.ToString('s'))] $message" | Out-File -LiteralPath $supervisorLog -Append -Encoding utf8
}

if ((Test-Path -LiteralPath $supervisorLog) -and (Get-Item -LiteralPath $supervisorLog).Length -gt 5MB) {
    Move-Item -LiteralPath $supervisorLog -Destination "$supervisorLog.1" -Force
}

# Un solo vigilante a la vez, aunque haya otro en otra sesión de Windows.
try {
    $lock = [IO.File]::Open((Join-Path $logDir 'supervisor.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
} catch {
    Write-Log 'Ya hay un vigilante en marcha; salgo.'
    exit 0
}

$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$node = (Get-Command node -ErrorAction Stop).Source
$serverJs = Join-Path $apiRoot 'dist\server.js'
# Las variables del proceso tienen prioridad sobre .env.
$env:NODE_ENV = 'production'
$env:LOG_DIR = $logDir

$delay = 5
while ($true) {
    if (-not (Test-Path -LiteralPath $serverJs)) {
        Write-Log "No existe $serverJs. Ejecuta 'npm run build' en api/."
        Start-Sleep -Seconds 60
        continue
    }

    $started = Get-Date
    Write-Log 'Arrancando la API.'
    $process = Start-Process -FilePath $node -ArgumentList '--env-file-if-exists=.env', 'dist/server.js' `
        -WorkingDirectory $apiRoot -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $logDir 'stdout.log') `
        -RedirectStandardError (Join-Path $logDir 'stderr.log')
    $null = $process.Handle  # Sin esto ExitCode puede quedar vacío.
    $process.WaitForExit()
    Write-Log "La API terminó con código $($process.ExitCode)."

    # Reinicio con espera creciente si cae nada más arrancar (p. ej. SQL aún no está listo).
    if (((Get-Date) - $started).TotalMinutes -gt 5) { $delay = 5 } else { $delay = [Math]::Min($delay * 2, 300) }
    Write-Log "Reinicio en $delay s."
    Start-Sleep -Seconds $delay
}

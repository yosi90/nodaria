# Vigilante de la API de Nodaria: arranca dist/server.js y lo reinicia si se cae.
# Lo lanza la tarea programada "Nodaria API" al iniciar Windows (ver install-autostart.ps1).
param([int]$Port = 5003)
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

# Lo que lanza el vigilante muere con él (ecosistema-kit/SERVIDOR.md, punto 2): el propio vigilante
# entra en un job object con KILL_ON_JOB_CLOSE y la API, que lanza después, lo hereda. Al parar la
# tarea (o caer el vigilante) se cierra el único handle del job y Windows termina la API.
try {
    Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NodariaJob {
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int cls, ref ExtendedLimits info, int size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    static IntPtr handle;
    public static void Enter() {
        handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero) throw new Exception("CreateJobObject: " + Marshal.GetLastWin32Error());
        var info = new ExtendedLimits();
        info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (!SetInformationJobObject(handle, 9, ref info, Marshal.SizeOf(typeof(ExtendedLimits))))
            throw new Exception("SetInformationJobObject: " + Marshal.GetLastWin32Error());
        if (!AssignProcessToJobObject(handle, GetCurrentProcess()))
            throw new Exception("AssignProcessToJobObject: " + Marshal.GetLastWin32Error());
    }
}
'@
    [NodariaJob]::Enter()
    Write-Log 'Vigilante en su job object: la API se cierra con él.'
} catch {
    Write-Log "No se ha podido crear el job object ($($_.Exception.Message)); la API no se cerrará sola con el vigilante."
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

    # Una API de este vigilante que se quedó huérfana (de antes de usar el job object) tendría el puerto:
    # se cierra si es nuestra; si es otra cosa, se espera sin tocarla.
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($owner -and $owner.Name -eq 'node.exe' -and $owner.CommandLine -match 'dist[\\/]server\.js') {
            Write-Log "El puerto $Port lo tiene una API anterior (PID $($owner.ProcessId)); la cierro."
            Stop-Process -Id $owner.ProcessId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        } else {
            Write-Log "El puerto $Port lo tiene otro proceso (PID $($listener.OwningProcess)); espero 30 s."
            Start-Sleep -Seconds 30
            continue
        }
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

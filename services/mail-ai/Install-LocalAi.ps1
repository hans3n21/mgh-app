# Richtet die lokale KI auf diesem Rechner ein bzw. haelt sie aktuell.
# Wird von update.bat aufgerufen; laesst sich auch einzeln starten:
#   powershell -ExecutionPolicy Bypass -File services\mail-ai\Install-LocalAi.ps1
#
# 1. Analysedienst (Python, GLiNER): nur wenn noch nicht eingerichtet oder
#    requirements/Startskript geaendert. Erster Lauf laedt ~3 GB.
# 2. Ollama: bei Bedarf per winget installieren (mit Rueckfrage), auf "nur lokal,
#    keine Cloud" stellen, Modell aus local-ai.json laden (erster Lauf ~10 GB).
# Fehlt etwas oder schlaegt etwas fehl, gibt es einen Hinweis; die App laeuft
# dann weiter wie bisher (nur Regeln). Exit-Code 1 nur als Hinweis fuer update.bat.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$problems = @()

function Say([string]$Text) { Write-Host "   $Text" }
function Invoke-Native([scriptblock]$Command) {
    # PowerShell 5.1 behandelt stderr-Zeilen als Fehler; nur der Exit-Code zaehlt.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command 2>&1 | ForEach-Object {
            $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
            # Fortschrittsanzeigen (Steuerzeichen) nicht ins Update-Fenster schreiben.
            $line = ($line -replace '\x1b\[[0-9;?]*[A-Za-z]', '').Trim()
            if ($line -and $line -notmatch '^pulling |^verifying|^writing manifest') { Say $line }
        }
    } finally { $ErrorActionPreference = $previous }
    return $LASTEXITCODE
}

$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-ai.json') -Raw | ConvertFrom-Json

# --- 1. Analysedienst -------------------------------------------------------
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    Say 'Python fehlt. Fuer die Personenerkennung einmalig Python 3.12 oder neuer installieren:'
    Say '  winget install -e --id Python.Python.3.13   (danach update.bat erneut starten)'
    $problems += 'Python fehlt'
} else {
    $stampFile = Join-Path $PSScriptRoot 'data\installed.sha256'
    $wanted = ((Get-FileHash requirements.txt -Algorithm SHA256).Hash + (Get-FileHash Start-MailAi.ps1 -Algorithm SHA256).Hash)
    $installed = if (Test-Path -LiteralPath $stampFile) { (Get-Content -LiteralPath $stampFile -Raw).Trim() } else { '' }
    $ready = (Test-Path '.venv\Scripts\python.exe') -and (Test-Path 'data\models\pii')
    if ($ready -and $installed -eq $wanted) {
        Say 'Analysedienst ist aktuell.'
    } else {
        # Laufenden Dienst beenden, sonst sind Dateien der Python-Umgebung gesperrt.
        Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like "*$PSScriptRoot*" } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
        Say 'Analysedienst wird eingerichtet (erster Lauf laedt ca. 3 GB, das dauert) ...'
        try {
            & (Join-Path $PSScriptRoot 'Start-MailAi.ps1') -Install -InstallOnly
            New-Item -ItemType Directory -Path 'data' -Force | Out-Null
            Set-Content -LiteralPath $stampFile -Value $wanted -Encoding ascii
            Say 'Analysedienst eingerichtet.'
        } catch {
            Say "Einrichtung des Analysedienstes fehlgeschlagen: $($_.Exception.Message)"
            $problems += 'Analysedienst'
        }
    }
}

# --- 2. Ollama ----------------------------------------------------------------
$ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $ollama)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Say 'Ollama ist nicht installiert und wird jetzt per winget installiert (bitte Rueckfragen bestaetigen) ...'
        Invoke-Native { winget install -e --id Ollama.Ollama } | Out-Null
    }
    if (-not (Test-Path -LiteralPath $ollama)) {
        Say 'Ollama fehlt. Einmalig installieren (https://ollama.com/download), dann update.bat erneut starten.'
        $problems += 'Ollama fehlt'
    }
}
if (Test-Path -LiteralPath $ollama) {
    # Nur lokal: keine Cloud-Modelle, nicht im Netzwerk erreichbar.
    $changed = $false
    foreach ($setting in @(@('OLLAMA_NO_CLOUD', '1'), @('OLLAMA_HOST', '127.0.0.1:11434'))) {
        if ([Environment]::GetEnvironmentVariable($setting[0], 'User') -ne $setting[1]) {
            [Environment]::SetEnvironmentVariable($setting[0], $setting[1], 'User')
            $changed = $true
        }
        Set-Item -Path "Env:$($setting[0])" -Value $setting[1]
    }
    if ($changed -or -not (Get-Process -Name 'ollama' -ErrorAction SilentlyContinue)) {
        Get-Process -Name 'ollama app', 'ollama' -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
        $app = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe'
        if (Test-Path -LiteralPath $app) { Start-Process -FilePath $app } else { Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden }
        Start-Sleep -Seconds 8
        Say 'Ollama laeuft nur lokal, ohne Cloud-Funktion.'
    }
    # Modell je Rechner: mit wenig Arbeitsspeicher die kleinere Variante, sonst lagert
    # der Rechner aus, waehrend alle mit der App arbeiten. Die App liest die Wahl aus
    # data\ollama-model.txt (Vorrang vor der gemeinsamen Einstellung in der Datenbank).
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    $model = if ($ramGB -lt $config.smallBelowGB) { $config.ollamaModelSmall } else { $config.ollamaModel }
    New-Item -ItemType Directory -Path 'data' -Force | Out-Null
    Set-Content -LiteralPath 'data\ollama-model.txt' -Value $model -Encoding ascii
    Say "$ramGB GB Arbeitsspeicher: Sprachmodell $model."
    # Der Virenscanner haelt fertig geladene Dateien manchmal kurz fest; dann erneut versuchen.
    Say "Sprachmodell $model wird bereitgestellt (erster Lauf laedt mehrere GB) ..."
    $ok = $false
    for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
        Invoke-Native { & $ollama pull $model } | Out-Null
        # Exakter Name: "gemma4:e4b" darf nicht auf "gemma4:e4b-it-qat" passen.
        $ok = $null -ne (& $ollama list 2>$null | Select-String -Pattern ('^' + [regex]::Escape($model) + '\s'))
        if (-not $ok) { Start-Sleep -Seconds 5 }
    }
    if ($ok) { Say "Sprachmodell $model ist bereit." } else { Say "Sprachmodell $model konnte nicht geladen werden."; $problems += 'Sprachmodell' }
}

if ($problems.Count) {
    Say ("Lokale KI unvollstaendig: " + ($problems -join ', ') + '. Die App laeuft trotzdem (dann nur Regeln).')
    exit 1
}
Say 'Lokale KI ist bereit. Sie startet ab jetzt mit der App (start-mgh-app-production.bat).'
exit 0

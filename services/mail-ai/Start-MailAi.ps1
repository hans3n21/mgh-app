param(
    [string]$PythonExe = 'py',
    [int]$Port = 8766,
    [int]$Threads = 2,
    [switch]$Install,
    [switch]$NoFields
)
# Lokaler Analysedienst fuer Mails. Nur -Install braucht Internet (Pakete und
# Modellgewichte); danach laeuft alles offline auf diesem Rechner.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Windows PowerShell 5.1 wertet jede stderr-Zeile eines Programms (etwa harmlose
# Warnungen von pip oder Hugging Face) als Fehler und bricht unter 'Stop' ab.
# Fuer externe Programme deshalb nur den Exit-Code pruefen.
function Invoke-Native([scriptblock]$Command, [string]$Failure) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw $Failure }
}
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$dataPath = Join-Path $PSScriptRoot 'data'
$models = Join-Path $dataPath 'models'

if ($Install) {
    if (!(Test-Path -LiteralPath $python)) {
        Invoke-Native { & $PythonExe -3 -m venv .venv } 'Python 3.12 oder neuer installieren (py-Launcher) oder -PythonExe angeben.'
    }
    Invoke-Native { & $python -m pip install --upgrade pip } 'pip konnte nicht aktualisiert werden.'
    Invoke-Native { & $python -m pip install --index-url https://download.pytorch.org/whl/cpu 'torch==2.14.0' } 'CPU-PyTorch konnte nicht installiert werden.'
    Invoke-Native { & $python -m pip install -r requirements.txt } 'Pakete konnten nicht installiert werden.'
    # Feste Modellstaende (Commit-Kennungen), in normale Ordner statt in den
    # Symlink-Cache: Windows-Konten ohne Symlink-Recht scheitern sonst.
    $download = @"
from huggingface_hub import snapshot_download
for repo, rev, target in [
    ('fastino/gliner2-privacy-filter-PII-multi', '1cb4166094dc58fa8d836429f060d6c95f62b495', 'pii'),
    ('fastino/gliner2.5-multi-v1', '2ca71aafb3446d9014e1c55c7ff51c9bc7209c47', 'fields'),
]:
    print(snapshot_download(repo, revision=rev, local_dir=r'$models\\' + target))
"@
    $env:HF_HUB_DISABLE_TELEMETRY = '1'
    Invoke-Native { & $python -c $download } 'Modelle konnten nicht geladen werden.'
}

if (!(Test-Path -LiteralPath $python)) { throw 'Zuerst mit -Install einrichten.' }
if (!(Test-Path -LiteralPath (Join-Path $models 'pii'))) { throw 'Modelle fehlen. Mit -Install einrichten.' }

New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$tokenPath = Join-Path $dataPath 'access-token.txt'
if (!(Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [System.IO.File]::WriteAllText($tokenPath, [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant())
}

$env:MAIL_AI_TOKEN_FILE = $tokenPath
$env:MAIL_AI_DATA = $dataPath
$env:MAIL_AI_HOST = '127.0.0.1'
$env:MAIL_AI_PORT = [string]$Port
$env:MAIL_AI_THREADS = [string]$Threads
$env:MAIL_AI_FIELDS = if ($NoFields) { '0' } else { '1' }
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
Write-Host "Zugriffsschluessel fuer die MGH-Einstellungen: $tokenPath"
Write-Host "Dienst: http://127.0.0.1:$Port  (Strg+C beendet)"
Invoke-Native { & $python server.py } 'Mail-Analysedienst wurde mit einem Fehler beendet.'

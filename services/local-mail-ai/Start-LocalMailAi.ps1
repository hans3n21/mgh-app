param(
    [string]$PythonExe = 'python',
    [string]$ListenAddress = '127.0.0.1',
    [int]$Port = 8765,
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimePython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if ($Install) {
    if (!(Test-Path -LiteralPath $runtimePython)) {
        & $PythonExe -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 installieren oder -PythonExe mit dem vollständigen Pfad angeben.' }
    }
    & $runtimePython -m pip install --index-url https://download.pytorch.org/whl/cpu 'torch==2.14.0'
    if ($LASTEXITCODE -ne 0) { throw 'CPU-PyTorch konnte nicht installiert werden.' }
    & $runtimePython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Laya konnte nicht installiert werden.' }
}
if (!(Test-Path -LiteralPath $runtimePython)) { throw 'Zuerst dieses Skript mit -Install starten.' }
$dataPath = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$tokenPath = Join-Path $dataPath 'access-token.txt'
if (!(Test-Path -LiteralPath $tokenPath)) {
    $randomBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    $accessToken = [BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
    [System.IO.File]::WriteAllText($tokenPath, $accessToken)
}
$env:MGH_AI_TOKEN_FILE = $tokenPath
$env:MGH_AI_DATA = $dataPath
$env:HF_HOME = Join-Path $dataPath 'huggingface'
$env:MGH_AI_HOST = $ListenAddress
$env:MGH_AI_PORT = [string]$Port
$env:MGH_AI_THREADS = '2'
Write-Host "Zugriffsschluessel fuer die MGH-Einstellungen: $tokenPath"
Write-Host 'Mit Strg+C beenden. Beim ersten Start wird das Modell heruntergeladen.'
& $runtimePython server.py
if ($LASTEXITCODE -ne 0) { throw 'Lokaler KI-Dienst wurde mit einem Fehler beendet.' }

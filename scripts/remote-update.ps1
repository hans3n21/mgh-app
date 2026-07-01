# Remote-Update-Script für deinen Entwickler-PC
# Aktualisiert die App auf dem NAS und baut sie neu

param(
    [Parameter(Mandatory=$true)]
    [string]$NasPath  # Beispiel: "\\MGH-NAS\MGH App" oder "X:\MGH App"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MGH App - Remote Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Prüfe ob NAS-Pfad erreichbar ist
if (-not (Test-Path $NasPath)) {
    Write-Host "FEHLER: NAS-Pfad nicht erreichbar: $NasPath" -ForegroundColor Red
    Write-Host "Bitte prüfe:" -ForegroundColor Yellow
    Write-Host "  - Ist das NAS erreichbar?" -ForegroundColor White
    Write-Host "  - Ist der Pfad korrekt?" -ForegroundColor White
    Write-Host "  - Hast du Schreibrechte?" -ForegroundColor White
    exit 1
}

Write-Host "NAS-Pfad: $NasPath" -ForegroundColor Green
Write-Host ""

# 1. Kopiere aktuelle Dateien zum NAS (außer node_modules, .next, etc.)
Write-Host "1. Kopiere Dateien zum NAS..." -ForegroundColor Yellow

$excludeDirs = @(
    "node_modules",
    ".next",
    ".git",
    "logs",
    "uploads"
)

$excludeFiles = @(
    ".env",
    ".env.local",
    "*.log"
)

# Robocopy für effizientes Kopieren
$robocopyArgs = @(
    $PSScriptRoot + "\..",  # Quellverzeichnis (Projekt-Root)
    $NasPath,               # Zielverzeichnis
    "/E",                   # Alle Unterverzeichnisse
    "/XD", $excludeDirs,    # Ausgeschlossene Verzeichnisse
    "/XF", $excludeFiles,   # Ausgeschlossene Dateien
    "/R:3",                 # 3 Wiederholungen bei Fehlern
    "/W:5",                 # 5 Sekunden Wartezeit
    "/NP",                  # Kein Fortschritt
    "/NFL",                 # Keine Dateiliste
    "/NDL"                  # Keine Verzeichnisliste
)

$robocopyResult = & robocopy @robocopyArgs 2>&1
$robocopyExitCode = $LASTEXITCODE

# Robocopy gibt Exit-Codes 0-7 für Erfolg zurück
if ($robocopyExitCode -ge 8) {
    Write-Host "FEHLER beim Kopieren der Dateien!" -ForegroundColor Red
    exit 1
}

Write-Host "Dateien erfolgreich kopiert!" -ForegroundColor Green
Write-Host ""

# 2. Installiere Dependencies auf dem NAS
Write-Host "2. Installiere Dependencies auf dem NAS..." -ForegroundColor Yellow
Push-Location $NasPath
try {
    & npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install fehlgeschlagen"
    }
    Write-Host "Dependencies installiert!" -ForegroundColor Green
} catch {
    Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host ""

# 3. Baue die App
Write-Host "3. Baue die App..." -ForegroundColor Yellow
Push-Location $NasPath
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build fehlgeschlagen"
    }
    Write-Host "Build erfolgreich!" -ForegroundColor Green
} catch {
    Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Update erfolgreich abgeschlossen!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Die App ist aktualisiert und bereit." -ForegroundColor Cyan
Write-Host "Auf dem Chef-PC die App neu starten (Task Scheduler)." -ForegroundColor Yellow
Write-Host ""

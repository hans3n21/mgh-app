@echo off
REM Build-Script für ARM64 Docker Image (Windows)
REM Erstellt ein Cross-Build für linux/arm64 Architektur

echo ============================================
echo MGH App - ARM64 Docker Build (Windows)
echo ============================================
echo.

REM Prüfe ob Docker verfügbar ist
docker --version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Docker ist nicht installiert oder nicht im PATH!
    exit /b 1
)

echo [1/4] Aktiviere Docker Buildx...
docker buildx version >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Docker Buildx ist nicht verfügbar!
    echo Bitte Docker Desktop aktualisieren oder Buildx manuell installieren.
    exit /b 1
)

REM Erstelle Buildx Builder falls nicht vorhanden
echo [2/4] Erstelle/Prüfe ARM64 Builder...
docker buildx create --name arm64-builder --driver docker-container --platform linux/arm64 --use 2>nul
if errorlevel 1 (
    echo Builder existiert bereits oder konnte nicht erstellt werden. Versuche zu verwenden...
    docker buildx use arm64-builder 2>nul
)

REM Starte Builder
docker buildx inspect --bootstrap >nul 2>&1

echo [3/4] Baue Docker Image für linux/arm64...
docker buildx build ^
    --platform linux/arm64 ^
    --file deploy/Dockerfile.arm64 ^
    --tag mgh-app:arm64 ^
    --load ^
    .

if errorlevel 1 (
    echo FEHLER: Build fehlgeschlagen!
    exit /b 1
)

echo [4/4] Exportiere Image als TAR...
docker save -o deploy\mgh-app-arm64.tar mgh-app:arm64

if errorlevel 1 (
    echo FEHLER: Export fehlgeschlagen!
    exit /b 1
)

echo.
echo ============================================
echo Build erfolgreich abgeschlossen!
echo ============================================
echo Image: mgh-app:arm64
echo Export: deploy\mgh-app-arm64.tar
echo.
echo Zum Laden auf QNAP:
echo   docker load -i deploy\mgh-app-arm64.tar
echo.





#!/bin/bash
# Build-Script für ARM64 Docker Image (Linux/Mac)
# Erstellt ein Cross-Build für linux/arm64 Architektur

set -e

echo "============================================"
echo "MGH App - ARM64 Docker Build (Linux/Mac)"
echo "============================================"
echo ""

# Prüfe ob Docker verfügbar ist
if ! command -v docker &> /dev/null; then
    echo "FEHLER: Docker ist nicht installiert oder nicht im PATH!"
    exit 1
fi

echo "[1/4] Aktiviere Docker Buildx..."
if ! docker buildx version &> /dev/null; then
    echo "FEHLER: Docker Buildx ist nicht verfügbar!"
    echo "Bitte Docker aktualisieren oder Buildx manuell installieren."
    exit 1
fi

# Erstelle Buildx Builder falls nicht vorhanden
echo "[2/4] Erstelle/Prüfe ARM64 Builder..."
if ! docker buildx inspect arm64-builder &> /dev/null; then
    docker buildx create --name arm64-builder --driver docker-container --platform linux/arm64 --use
else
    docker buildx use arm64-builder
fi

# Starte Builder
docker buildx inspect --bootstrap &> /dev/null

echo "[3/4] Baue Docker Image für linux/arm64..."
docker buildx build \
    --platform linux/arm64 \
    --file deploy/Dockerfile.arm64 \
    --tag mgh-app:arm64 \
    --load \
    .

if [ $? -ne 0 ]; then
    echo "FEHLER: Build fehlgeschlagen!"
    exit 1
fi

echo "[4/4] Exportiere Image als TAR..."
docker save -o deploy/mgh-app-arm64.tar mgh-app:arm64

if [ $? -ne 0 ]; then
    echo "FEHLER: Export fehlgeschlagen!"
    exit 1
fi

echo ""
echo "============================================"
echo "Build erfolgreich abgeschlossen!"
echo "============================================"
echo "Image: mgh-app:arm64"
echo "Export: deploy/mgh-app-arm64.tar"
echo ""
echo "Zum Laden auf QNAP:"
echo "  docker load -i deploy/mgh-app-arm64.tar"
echo ""





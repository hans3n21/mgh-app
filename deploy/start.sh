#!/bin/bash
# Start-Script für MGH App auf QNAP NAS
# Führt alle notwendigen Schritte aus

set -e

echo "🚀 Starte MGH App Deployment..."
echo ""

# Prüfe ob .env.production existiert
if [ ! -f .env.production ]; then
    echo "⚠️  Warnung: .env.production nicht gefunden!"
    echo "   Erstelle eine Kopie von .env.production.example"
    echo "   und passe die Werte an."
    exit 1
fi

# Lade Environment-Variablen
export $(cat .env.production | grep -v '^#' | xargs)

# Prüfe Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker ist nicht installiert!"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose ist nicht installiert!"
    exit 1
fi

# Baue Container
echo "🔨 Baue Docker Container..."
docker-compose build

# Starte Container
echo "▶️  Starte Container..."
docker-compose up -d

# Warte auf Container
echo "⏳ Warte auf Container..."
sleep 5

# Zeige Status
echo ""
echo "📊 Container-Status:"
docker-compose ps

echo ""
echo "✅ Deployment abgeschlossen!"
echo ""
echo "📝 Nützliche Befehle:"
echo "   Logs anzeigen:    docker-compose logs -f"
echo "   Container stoppen: docker-compose down"
echo "   Container neustarten: docker-compose restart"
echo ""
echo "🌐 App erreichbar unter: http://192.168.178.100:3010"










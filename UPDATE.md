# Update-Anleitung für QNAP Docker Deployment

## Schnelles Update (ohne Datenbank-Änderungen)

1. Neuen Code pullen:
   ```bash
   cd /share/Container/mgh-app
   git pull origin main
   ```

2. Container neu bauen und starten:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

3. Logs prüfen:
   ```bash
   docker-compose logs -f
   ```

## Update mit Datenbank-Migration

1. Code pullen:
   ```bash
   git pull origin main
   ```

2. Backup der Datenbank erstellen:
   ```bash
   cp data/production.db data/production.db.backup-$(date +%Y%m%d-%H%M%S)
   ```

3. Container neu bauen:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

4. Migrations werden automatisch beim Start ausgeführt (siehe Dockerfile CMD)

5. Logs prüfen:
   ```bash
   docker-compose logs -f
   ```

## Rollback bei Problemen

Falls etwas schiefgeht:

```bash
docker-compose down
cp data/production.db.backup-TIMESTAMP data/production.db
git checkout main~1
docker-compose build --no-cache
docker-compose up -d
```

## Wichtige Hinweise

- **Volumes bleiben erhalten**: `data/` und `uploads/` werden NICHT gelöscht
- **Migrations sind sicher**: Prisma führt nur neue Migrations aus
- **Zero Downtime**: Nutze `docker-compose up -d --no-deps --build mgh-app` für Rolling Update

@echo off
REM MGH App - Production Start Script
REM Startet die App im Netzwerk-Modus (von allen Rechnern erreichbar)

REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"

REM Setze Umgebungsvariablen
set NODE_ENV=production
set PORT=3000

REM Starte die App im Netzwerk-Modus
call npm run start:network

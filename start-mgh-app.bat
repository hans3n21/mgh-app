@echo off
REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"

REM Siehe start-mgh-app-production.bat: laesst Node den Windows-Zertifikats-
REM speicher lesen, sonst scheitert der Mailabruf hinter einem mitlesenden
REM Virenscanner an SELF_SIGNED_CERT_IN_CHAIN.
node --use-system-ca -e "" >nul 2>&1
if not errorlevel 1 set NODE_OPTIONS=--use-system-ca

REM Gemeinsame Dateiwurzel fuer Uploads auf dem NAS - siehe
REM start-mgh-app-production.bat fuer die Begruendung.
if not defined FILES_ROOT set "FILES_ROOT=\\MGH-NAS\Daten\MGH-App-Daten"

REM Lokaler Analysedienst, falls eingerichtet (siehe start-mgh-app-production.bat).
if exist "services\mail-ai\.venv\Scripts\python.exe" (
    start "MGH Mail-Analyse" /min powershell -NoProfile -ExecutionPolicy Bypass -File "services\mail-ai\Start-MailAi.ps1"
)

REM Starte die Next.js App im Dev-Modus
call npm run dev
pause






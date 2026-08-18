@echo off
REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"

REM Siehe start-mgh-app-production.bat: laesst Node den Windows-Zertifikats-
REM speicher lesen, sonst scheitert der Mailabruf hinter einem mitlesenden
REM Virenscanner an SELF_SIGNED_CERT_IN_CHAIN.
node --use-system-ca -e "" >nul 2>&1
if not errorlevel 1 set NODE_OPTIONS=--use-system-ca

REM Starte die Next.js App im Dev-Modus
call npm run dev
pause






@echo off
REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"
REM Starte die Next.js App im Dev-Modus
call npm run dev
pause






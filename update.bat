@echo off
setlocal
REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"

echo ========================================
echo MGH App - Update
echo ========================================
echo.
echo WICHTIG: Falls gerade ein Fenster mit "npm run dev" laeuft,
echo bitte vorher schliessen - sonst kann "Datenbank-Client aktualisieren"
echo fehlschlagen (Datei ist dann noch gesperrt).
echo.
pause
echo.

echo 1. Hole Aenderungen von GitHub...
call git fetch origin
if errorlevel 1 goto :error

call git checkout codex/safety-stabilization
if errorlevel 1 goto :error

call git pull --ff-only origin codex/safety-stabilization
if errorlevel 1 (
    echo.
    echo FEHLER: git pull fehlgeschlagen. Vermutlich gibt es lokale
    echo Aenderungen oder Commits, die dem Update im Weg stehen.
    echo Bitte "git status" pruefen, bevor du es erneut versuchst.
    goto :error
)
echo Aenderungen geholt.
echo.

echo 2. Installiere Abhaengigkeiten...
call npm install --ignore-scripts
if errorlevel 1 goto :error
echo.

echo 3. Aktualisiere Datenbank-Client...
call npx prisma generate
if errorlevel 1 (
    echo.
    echo HINWEIS: Datenbank-Client konnte nicht aktualisiert werden ^(oft weil
    echo ein laufender "npm run dev" die Datei noch gesperrt haelt^). Falls sich
    echo das Datenbank-Schema nicht geaendert hat, ist das unproblematisch.
    echo Sonst: Dev-Server schliessen und dieses Script erneut ausfuehren.
    echo.
)

echo 4. Aktualisiere Datenbank-Schema...
call npx prisma migrate deploy
if errorlevel 1 goto :error
echo.

echo ========================================
echo Update erfolgreich abgeschlossen!
echo ========================================
echo.
echo Bitte den Dev-Server neu starten (start-mgh-app.bat),
echo falls er gerade laeuft.
echo.
pause
exit /b 0

:error
echo.
echo Update abgebrochen wegen eines Fehlers.
echo.
pause
exit /b 1

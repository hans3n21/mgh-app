@echo off
setlocal
REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"

echo ========================================
echo MGH App - Update
echo ========================================
echo.
echo WICHTIG: Falls die App gerade laeuft (start-mgh-app.bat oder
echo start-mgh-app-production.bat), bitte das Fenster vorher schliessen.
echo Sonst schlaegt "Datenbank-Client aktualisieren" fehl (Datei gesperrt)
echo und der Neubau kommt der laufenden App in die Quere.
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

REM Neubau. Wird nur vom Produktionsstart (start-mgh-app-production.bat ->
REM "next start") tatsaechlich gebraucht: der serviert fertig gebauten Code aus
REM dem Ordner .next und wuerde ohne diesen Schritt nach dem Update weiterhin
REM den ALTEN Stand ausliefern - ohne Fehler, ohne Meldung, es aendert sich
REM einfach nichts. Der Dev-Start (start-mgh-app.bat -> "next dev") baut selbst
REM und ignoriert das Ergebnis; dort kostet es nur die knappe Minute.
REM Bewusst immer bauen, statt die Startart zu erraten: eine Minute ist
REM billiger als ein Update, das scheinbar nichts bewirkt hat.
echo 5. Baue die App neu (dauert etwa eine Minute)...
call npm run build
if errorlevel 1 (
    echo.
    echo FEHLER: Der Neubau ist fehlgeschlagen. Die App laeuft weiterhin mit
    echo dem vorherigen Stand. Bitte die Meldungen oben pruefen.
    goto :error
)
echo.

echo ========================================
echo Update erfolgreich abgeschlossen!
echo ========================================
echo.
echo Die App muss jetzt NEU GESTARTET werden - sonst laeuft im Speicher
echo weiterhin die alte Version. Dazu dieselbe Datei starten wie sonst
echo auch (start-mgh-app-production.bat bzw. start-mgh-app.bat).
echo.
pause
exit /b 0

:error
echo.
echo Update abgebrochen wegen eines Fehlers.
echo.
pause
exit /b 1

@echo off
setlocal

REM ---------------------------------------------------------------------------
REM Selbstkopie - MUSS als Erstes passieren.
REM
REM Windows liest eine laufende Batch-Datei Zeile fuer Zeile von der Platte
REM nach, gemerkt wird dabei nur die Byte-Position. Aktualisiert sich die Datei
REM mittendrin - und genau das tut dieses Skript beim "git pull", wenn es sich
REM selbst mit ausliefert - liest cmd.exe an der alten Position in der neuen
REM Datei weiter und landet mitten in irgendeiner Zeile. Am 18.08.2026 kamen so
REM Meldungen wie 'Der Befehl "codex" ... konnte nicht gefunden werden' und ein
REM Update, das mit erfundenen Fehlern abbrach, obwohl alles geklappt hatte.
REM
REM Loesung: Das Skript kopiert sich beim Start ins Temp-Verzeichnis und
REM arbeitet von dort. Die Kopie bleibt unangetastet, egal was der Pull mit der
REM Originaldatei macht. Der erste Parameter merkt sich, dass wir schon die
REM Kopie sind, der zweite traegt das Projektverzeichnis herueber.
REM ---------------------------------------------------------------------------
if not "%~1"=="--aus-kopie" (
    copy /y "%~f0" "%TEMP%\mgh-update-kopie.bat" >nul
    if errorlevel 1 (
        echo FEHLER: Konnte das Update-Skript nicht ins Temp-Verzeichnis kopieren.
        pause
        exit /b 1
    )
    call "%TEMP%\mgh-update-kopie.bat" --aus-kopie "%~dp0"
    exit /b %errorlevel%
)

REM Ab hier laufen wir aus der Kopie; %~2 ist das Projektverzeichnis.
cd /d "%~2"
if errorlevel 1 (
    echo FEHLER: Projektverzeichnis %~2 nicht gefunden.
    pause
    exit /b 1
)

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

REM package-lock.json wird von "npm install" umgeschrieben und stand deshalb
REM jedem Update im Weg. Die Datei ist erzeugt, keine Handarbeit - der naechste
REM npm-Lauf schreibt sie ohnehin neu. Nur diese eine Datei, nichts sonst.
call git checkout -- package-lock.json 2>nul

call git checkout main
if errorlevel 1 goto :error

call git pull --ff-only origin main
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

REM Der Datenbank-Client MUSS erfolgreich neu erzeugt werden. Frueher lief das
REM Update hier bei einem Fehler mit einem blossen Hinweis weiter - mit fatalem
REM Ausgang, sobald sich das Schema geaendert hatte: die App startete zwar,
REM stuerzte aber beim ersten Lesen mit "Value '...' not found in enum" ab,
REM weil der alte Client die neuen Werte nicht kennt. Am 18.08.2026 genau so
REM passiert. Lieber hier abbrechen und die App schliessen lassen.
echo 3. Aktualisiere Datenbank-Client...
call npx prisma generate
if errorlevel 1 (
    echo.
    echo FEHLER: Datenbank-Client konnte nicht aktualisiert werden. Meist haelt
    echo eine noch laufende App die Datei gesperrt.
    echo.
    echo   1. ALLE Fenster von start-mgh-app.bat / start-mgh-app-production.bat
    echo      schliessen ^(auch minimierte^).
    echo   2. Dieses Update erneut ausfuehren.
    echo.
    echo Ohne diesen Schritt startet die App zwar, kann aber Auftraege nicht
    echo mehr lesen.
    goto :error
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

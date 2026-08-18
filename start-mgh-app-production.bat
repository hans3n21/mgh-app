@echo off
REM MGH App - Production Start Script
REM Startet die App im Netzwerk-Modus (von allen Rechnern erreichbar)

REM Wechsle in das Verzeichnis, in dem diese Batch-Datei liegt
cd /d "%~dp0"

REM Setze Umgebungsvariablen
set NODE_ENV=production
set PORT=3000

REM Node den Windows-Zertifikatsspeicher lesen lassen. Ohne das scheitert auf
REM Rechnern mit mitlesendem Virenscanner/Proxy jede IMAP-Verbindung mit
REM SELF_SIGNED_CERT_IN_CHAIN: Node bringt eine eigene Zertifikatsliste mit und
REM kennt das Wurzelzertifikat des Scanners nicht, das unter Windows laengst
REM installiert ist. Die Pruefung bleibt aktiv - im Gegensatz zu
REM IMAP_TLS_REJECT_UNAUTHORIZED=false, das sie ganz abschaltet.
REM Erst testen, dann setzen: aeltere Node-Versionen kennen die Option nicht
REM und wuerden den Start mit "bad option" abbrechen.
node --use-system-ca -e "" >nul 2>&1
if not errorlevel 1 (
    set NODE_OPTIONS=--use-system-ca
) else (
    echo HINWEIS: Diese Node-Version kennt --use-system-ca noch nicht.
    echo Bei Zertifikatsfehlern im Mailabruf hilft ein Node-Update ^(ab 22.15^).
)

REM Starte die App im Netzwerk-Modus
call npm run start:network

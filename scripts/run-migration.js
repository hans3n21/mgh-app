/**
 * Haupt-Migrations-Script
 * Führt alle Schritte der Migration automatisch aus
 */

const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('🚀 Starte vollständige Migration von SQLite zu PostgreSQL\n');
console.log('='.repeat(60));

// Schritt 1: Verbindung testen
console.log('\n📋 Schritt 1: PostgreSQL-Verbindung testen...');
try {
  execSync('node scripts/test-postgres-connection.js', { stdio: 'inherit' });
  console.log('✅ Verbindung erfolgreich!\n');
} catch (error) {
  console.error('\n❌ FEHLER: PostgreSQL-Verbindung fehlgeschlagen!');
  console.error('Bitte stelle sicher, dass:');
  console.error('  - PostgreSQL-Server läuft');
  console.error('  - IP-Adresse und Port korrekt sind');
  console.error('  - Firewall die Verbindung erlaubt');
  console.error('  - Benutzerdaten korrekt sind\n');
  process.exit(1);
}

// Schritt 2: Prisma db push
console.log('📋 Schritt 2: Datenbankstruktur in PostgreSQL erstellen...');
try {
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
  console.log('✅ Datenbankstruktur erstellt!\n');
} catch (error) {
  console.error('\n❌ FEHLER: Datenbankstruktur konnte nicht erstellt werden!');
  process.exit(1);
}

// Schritt 3: Migration ausführen
console.log('📋 Schritt 3: Daten migrieren...');
try {
  execSync('node scripts/migrateToPostgres.js', { stdio: 'inherit' });
  console.log('✅ Daten migriert!\n');
} catch (error) {
  console.error('\n❌ FEHLER: Migration fehlgeschlagen!');
  process.exit(1);
}

// Schritt 4: Prisma generate
console.log('📋 Schritt 4: Prisma Client generieren...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma Client generiert!\n');
} catch (error) {
  console.error('\n❌ FEHLER: Prisma Client konnte nicht generiert werden!');
  process.exit(1);
}

// Schritt 5: Prisma Studio öffnen
console.log('📋 Schritt 5: Prisma Studio öffnen...');
console.log('ℹ️  Prisma Studio wird im Browser geöffnet.');
console.log('ℹ️  Du kannst es mit Ctrl+C schließen.\n');

try {
  execSync('npx prisma studio', { stdio: 'inherit' });
} catch (error) {
  // Prisma Studio wird normalerweise mit Ctrl+C beendet
  console.log('\n✅ Migration abgeschlossen!');
}
















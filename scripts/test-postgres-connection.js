/**
 * Test-Script für PostgreSQL-Verbindung
 */

const { Client } = require('pg');
require('dotenv').config();

const POSTGRES_URL = process.env.DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('❌ FEHLER: DATABASE_URL nicht in .env gefunden!');
  process.exit(1);
}

console.log('🔌 Teste PostgreSQL-Verbindung...');
console.log(`📡 Verbindung: ${POSTGRES_URL.replace(/:[^:@]+@/, ':****@')}\n`);

const client = new Client({
  connectionString: POSTGRES_URL,
});

client.connect()
  .then(() => {
    console.log('✅ Verbindung erfolgreich!');
    return client.query('SELECT version()');
  })
  .then((result) => {
    console.log(`📊 PostgreSQL Version: ${result.rows[0].version}\n`);
    return client.end();
  })
  .then(() => {
    console.log('✅ Test abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verbindungsfehler:', error.message);
    console.error('\n💡 Mögliche Ursachen:');
    console.error('   - PostgreSQL-Server läuft nicht');
    console.error('   - Falsche IP-Adresse oder Port');
    console.error('   - Firewall blockiert die Verbindung');
    console.error('   - Falsche Benutzerdaten');
    process.exit(1);
  });
















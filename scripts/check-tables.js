/**
 * Prüft welche Tabellen in PostgreSQL existieren
 */

const { Client } = require('pg');
require('dotenv').config();

const POSTGRES_URL = process.env.DATABASE_URL;
const client = new Client({
  connectionString: POSTGRES_URL,
});

async function checkTables() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Tabellen in PostgreSQL:');
    console.log('─'.repeat(40));
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log(`\nGesamt: ${result.rows.length} Tabellen`);
    
    await client.end();
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

checkTables();
















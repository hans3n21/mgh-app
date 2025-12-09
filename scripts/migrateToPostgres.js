/**
 * Migration Script: SQLite zu PostgreSQL
 * 
 * Dieses Script migriert alle Daten von der SQLite-Datenbank (dev_local.db)
 * zur PostgreSQL-Datenbank, die in der neuen .env konfiguriert ist.
 */

const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Konfiguration
const SQLITE_DB_PATH = path.join(__dirname, '..', 'prisma', 'dev_local.db');
const POSTGRES_URL = process.env.DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('❌ FEHLER: DATABASE_URL nicht in .env gefunden!');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_DB_PATH)) {
  console.error(`❌ FEHLER: SQLite-Datenbank nicht gefunden: ${SQLITE_DB_PATH}`);
  process.exit(1);
}

// PostgreSQL Client
const pgClient = new Client({
  connectionString: POSTGRES_URL,
});

// SQLite Database
let sqliteDb;

// Statistik
const stats = {
  migrated: {},
  skipped: {},
  errors: {},
};

/**
 * Analysiert das Prisma Schema und gibt die Tabellen in der richtigen Reihenfolge zurück
 * (basierend auf Foreign-Key-Abhängigkeiten)
 */
function getTableOrder() {
  // Reihenfolge basierend auf Foreign-Key-Abhängigkeiten
  // Tabellen ohne Abhängigkeiten zuerst, dann abhängige Tabellen
  return [
    // Basis-Tabellen (keine Foreign Keys)
    'User',
    'Customer',
    'PriceItem',
    'ReplyTemplate',
    'Feedback',
    
    // Tabellen mit Foreign Keys zu User/Customer
    'Order',
    'Account',
    'Session',
    'VerificationToken',
    'ProcurementItem',
    
    // Tabellen mit Foreign Keys zu Order
    'OrderSpecKV',
    'OrderImage',
    'Message',
    'OrderItem',
    'OrderExtra',
    'Mail',
    'Datasheet',
    
    // Tabellen mit Foreign Keys zu Mail
    'Attachment',
  ];
}

/**
 * Konvertiert SQLite-Datentypen zu PostgreSQL-kompatiblen Werten
 */
function convertValue(value, columnType) {
  if (value === null || value === undefined) {
    return null;
  }

  // JSON-Felder
  if (columnType === 'Json' || columnType === 'json') {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  // Boolean
  if (columnType === 'Boolean' || columnType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true' || value === true) return true;
    if (value === 0 || value === '0' || value === 'false' || value === false) return false;
    return null;
  }

  // DateTime
  if (columnType === 'DateTime' || columnType === 'datetime') {
    if (value instanceof Date) return value.toISOString();
    
    // Konvertiere zu Zahl, falls möglich (für Unix-Timestamps)
    let numValue = null;
    if (typeof value === 'string') {
      // Prüfe ob String eine reine Zahl ist (Unix-Timestamp)
      if (/^\d+$/.test(value.trim())) {
        numValue = parseInt(value, 10);
      } else {
        // Versuche als ISO-String zu parsen
        const dateValue = new Date(value);
        if (!isNaN(dateValue.getTime())) {
          return dateValue.toISOString();
        }
        // Fallback: String zurückgeben
        return value;
      }
    } else if (typeof value === 'number') {
      numValue = value;
    }
    
    // Verarbeite Unix-Timestamp
    if (numValue !== null && !isNaN(numValue)) {
      // Unix-Timestamp in Millisekunden (nach 2001-09-09)
      if (numValue > 1000000000000) {
        const date = new Date(numValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      // Unix-Timestamp in Sekunden (nach 2001-09-09)
      else if (numValue > 1000000000) {
        const date = new Date(numValue * 1000);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
    
    return null;
  }

  // Int
  if (columnType === 'Int' || columnType === 'integer') {
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  }

  // String - bleibt String
  return String(value);
}

/**
 * Holt alle Spalten einer Tabelle aus SQLite
 */
function getTableColumns(tableName) {
  // Order ist ein reserviertes Wort, daher in Anführungszeichen
  const sqliteTableName = tableName === 'Order' ? `"${tableName}"` : tableName;
  const columns = sqliteDb
    .prepare(`PRAGMA table_info(${sqliteTableName})`)
    .all();
  
  return columns.map(col => ({
    name: col.name,
    type: col.type,
    notnull: col.notnull === 1,
    dflt_value: col.dflt_value,
    pk: col.pk === 1,
  }));
}

/**
 * Migriert eine einzelne Tabelle
 */
async function migrateTable(tableName) {
  console.log(`\n📦 Migriere Tabelle: ${tableName}`);
  
  try {
    // Order ist ein reserviertes Wort, daher in Anführungszeichen für SQLite
    const sqliteTableName = tableName === 'Order' ? `"${tableName}"` : tableName;
    
    // Prüfe ob Tabelle in SQLite existiert
    const tableExists = sqliteDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName);
    
    if (!tableExists) {
      console.log(`   ⚠️  Tabelle ${tableName} existiert nicht in SQLite, überspringe...`);
      stats.skipped[tableName] = { reason: 'Tabelle existiert nicht in SQLite', count: 0 };
      return;
    }

    // Prüfe ob Tabelle in PostgreSQL existiert (Prisma verwendet gemischte Groß-/Kleinschreibung)
    // Hole alle Tabellennamen aus PostgreSQL (pg_tables zeigt exakte Namen)
    const allTables = await pgClient.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    const pgTableNames = allTables.rows.map(r => r.tablename);
    
    // Finde die richtige Variante (case-insensitive)
    const pgTableNameMatch = pgTableNames.find(
      name => name.toLowerCase() === tableName.toLowerCase()
    );
    
    if (!pgTableNameMatch) {
      console.log(`   ⚠️  Tabelle ${tableName} existiert nicht in PostgreSQL, überspringe...`);
      stats.skipped[tableName] = { reason: 'Tabelle existiert nicht in PostgreSQL', count: 0 };
      return;
    }
    
    // Verwende den exakten Tabellennamen aus PostgreSQL
    const pgTableName = pgTableNameMatch;

    // Hole alle Zeilen aus SQLite
    const rows = sqliteDb.prepare(`SELECT * FROM ${sqliteTableName}`).all();
    
    if (rows.length === 0) {
      console.log(`   ℹ️  Tabelle ${tableName} ist leer, überspringe...`);
      stats.migrated[tableName] = { inserted: 0, skipped: 0 };
      return;
    }

    // Hole Spalten-Informationen
    const columns = getTableColumns(tableName);
    const columnNames = columns.map(c => c.name);
    
    // Hole PostgreSQL-Spaltennamen (können sich von SQLite unterscheiden)
    // Verwende pg_attribute für exakte Spaltennamen
    const pgColumns = await pgClient.query(`
      SELECT a.attname AS column_name
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
      AND c.relname = $1
      AND a.attnum > 0
      AND NOT a.attisdropped
      ORDER BY a.attnum
    `, [pgTableName]);
    
    const pgColumnNames = pgColumns.rows.map(r => r.column_name);
    
    // Filtere Spalten, die in beiden Datenbanken existieren
    const commonColumns = columnNames.filter(col => pgColumnNames.includes(col));
    
    if (commonColumns.length === 0) {
      console.log(`   ⚠️  Keine gemeinsamen Spalten gefunden, überspringe...`);
      stats.skipped[tableName] = { reason: 'Keine gemeinsamen Spalten', count: 0 };
      return;
    }
    
    // Ermittle Primary Key Spalten
    const primaryKeyColumns = await pgClient.query(`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      JOIN pg_class c ON i.indrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
      AND c.relname = $1
      AND i.indisprimary
    `, [pgTableName]);
    
    const pkColumnNames = primaryKeyColumns.rows.map(r => r.attname);
    const commonPkColumns = pkColumnNames.filter(col => commonColumns.includes(col));
    
    // Erstelle INSERT-Statement mit ON CONFLICT
    const placeholders = commonColumns.map((_, i) => `$${i + 1}`).join(', ');
    let insertQuery;
    
    if (commonPkColumns.length > 0) {
      // Verwende Primary Key für ON CONFLICT
      insertQuery = `
        INSERT INTO "${pgTableName}" (${commonColumns.map(c => `"${c}"`).join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (${commonPkColumns.map(c => `"${c}"`).join(', ')}) DO NOTHING
      `;
    } else {
      // Fallback: ON CONFLICT DO NOTHING ohne spezifische Spalten
      // (funktioniert nur wenn ein Primary Key existiert)
      insertQuery = `
        INSERT INTO "${pgTableName}" (${commonColumns.map(c => `"${c}"`).join(', ')})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;
    }

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    // Migriere Zeile für Zeile
    for (const row of rows) {
      try {
        const values = commonColumns.map(colName => {
          const column = columns.find(c => c.name === colName);
          const value = row[colName];
          
          // Erkenne DateTime-Spalten anhand des Namens (createdAt, updatedAt, date, timestamp, etc.)
          const isDateTimeColumn = /(createdAt|updatedAt|date|timestamp|expires|neededBy|resolvedAt|archivedAt)$/i.test(colName);
          const columnType = isDateTimeColumn ? 'DateTime' : (column?.type || 'String');
          
          return convertValue(value, columnType);
        });

        const result = await pgClient.query(insertQuery, values);
        
        // ON CONFLICT DO NOTHING gibt keine rowCount zurück, wenn ein Konflikt auftritt
        // Wir müssen prüfen, ob der Eintrag bereits existiert
        if (result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        if (!stats.errors[tableName]) {
          stats.errors[tableName] = [];
        }
        stats.errors[tableName].push({
          row: row,
          error: error.message,
        });
        
        // Überspringe ungültige Datensätze
        console.log(`   ⚠️  Fehler bei Zeile (übersprungen): ${error.message.substring(0, 100)}`);
      }
    }

    stats.migrated[tableName] = { inserted, skipped, errors };
    console.log(`   ✅ ${inserted} Datensätze eingefügt, ${skipped} übersprungen (Konflikte), ${errors} Fehler`);

  } catch (error) {
    console.error(`   ❌ Fehler bei Migration von ${tableName}:`, error.message);
    stats.errors[tableName] = [{ error: error.message }];
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Starte Migration von SQLite zu PostgreSQL\n');
  console.log(`📂 SQLite-Datenbank: ${SQLITE_DB_PATH}`);
  console.log(`🗄️  PostgreSQL: ${POSTGRES_URL.replace(/:[^:@]+@/, ':****@')}\n`);

  try {
    // Öffne SQLite-Datenbank
    console.log('📖 Öffne SQLite-Datenbank...');
    sqliteDb = new Database(SQLITE_DB_PATH, { readonly: true });
    console.log('✅ SQLite-Datenbank geöffnet\n');

    // Verbinde mit PostgreSQL
    console.log('🔌 Verbinde mit PostgreSQL...');
    await pgClient.connect();
    console.log('✅ Verbindung zu PostgreSQL hergestellt\n');

    // Aktiviere Foreign Key Constraints temporär (für bessere Fehlerbehandlung)
    await pgClient.query('SET session_replication_role = replica;');

    // Migriere Tabellen in der richtigen Reihenfolge
    const tableOrder = getTableOrder();
    console.log(`📋 Migriere ${tableOrder.length} Tabellen...\n`);

    for (const tableName of tableOrder) {
      await migrateTable(tableName);
    }

    // Setze Foreign Key Constraints wieder zurück
    await pgClient.query('SET session_replication_role = DEFAULT;');

    // Zusammenfassung
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATIONS-ZUSAMMENFASSUNG');
    console.log('='.repeat(60) + '\n');

    console.log('✅ ERFOLGREICH MIGRIERT:');
    console.log('─'.repeat(60));
    for (const [table, data] of Object.entries(stats.migrated)) {
      console.log(`  ${table.padEnd(25)} | Eingefügt: ${String(data.inserted).padStart(5)} | Übersprungen: ${String(data.skipped).padStart(5)} | Fehler: ${String(data.errors || 0).padStart(5)}`);
    }

    if (Object.keys(stats.skipped).length > 0) {
      console.log('\n⚠️  ÜBERSPRUNGEN:');
      console.log('─'.repeat(60));
      for (const [table, data] of Object.entries(stats.skipped)) {
        console.log(`  ${table.padEnd(25)} | Grund: ${data.reason}`);
      }
    }

    if (Object.keys(stats.errors).length > 0) {
      console.log('\n❌ FEHLER:');
      console.log('─'.repeat(60));
      for (const [table, errors] of Object.entries(stats.errors)) {
        if (Array.isArray(errors) && errors.length > 0) {
          console.log(`  ${table}: ${errors.length} Fehler`);
          errors.slice(0, 3).forEach((err, idx) => {
            console.log(`    ${idx + 1}. ${err.error?.substring(0, 80) || 'Unbekannter Fehler'}`);
          });
          if (errors.length > 3) {
            console.log(`    ... und ${errors.length - 3} weitere Fehler`);
          }
        }
      }
    }

    const totalInserted = Object.values(stats.migrated).reduce((sum, d) => sum + d.inserted, 0);
    const totalSkipped = Object.values(stats.migrated).reduce((sum, d) => sum + d.skipped, 0);
    const totalErrors = Object.values(stats.migrated).reduce((sum, d) => sum + (d.errors || 0), 0);

    console.log('\n' + '='.repeat(60));
    console.log(`📈 GESAMT: ${totalInserted} eingefügt | ${totalSkipped} übersprungen | ${totalErrors} Fehler`);
    console.log('='.repeat(60) + '\n');

    if (totalInserted > 0) {
      console.log('✅ Migration erfolgreich abgeschlossen!\n');
    } else {
      console.log('⚠️  Keine Daten migriert. Bitte prüfe die Logs.\n');
    }

  } catch (error) {
    console.error('\n❌ KRITISCHER FEHLER:', error);
    process.exit(1);
  } finally {
    // Schließe Verbindungen
    if (sqliteDb) {
      sqliteDb.close();
    }
    if (pgClient) {
      await pgClient.end();
    }
  }
}

// Führe Migration aus
main().catch(error => {
  console.error('❌ Unbehandelter Fehler:', error);
  process.exit(1);
});


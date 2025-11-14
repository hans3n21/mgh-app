#!/usr/bin/env node
/**
 * Prisma Migration Script
 * Führt npx prisma db push gegen NAS-PostgreSQL aus
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starte Prisma Migration...\n');
console.log(`📡 DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);

try {
  // Prisma db push (erstellt/aktualisiert Schema)
  console.log('📋 Führe prisma db push aus...');
  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });
  console.log('✅ Migration erfolgreich!\n');

  // Prisma Client generieren (falls noch nicht geschehen)
  console.log('📦 Generiere Prisma Client...');
  execSync('npx prisma generate', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
  });
  console.log('✅ Prisma Client generiert!\n');

  console.log('🎉 Migration abgeschlossen!');
} catch (error) {
  console.error('❌ Migrationsfehler:', error.message);
  console.error('\n💡 Mögliche Ursachen:');
  console.error('   - Datenbankverbindung fehlgeschlagen');
  console.error('   - Schema-Konflikte');
  console.error('   - Berechtigungsprobleme');
  process.exit(1);
}










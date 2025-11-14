#!/usr/bin/env node
/**
 * Prisma Build Script
 * Führt Build + Prisma Generate aus
 * Für Docker Build-Prozess
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🔨 Starte Prisma Build...\n');

try {
  // 1. Prisma Client generieren
  console.log('📦 Generiere Prisma Client...');
  execSync('npx prisma generate', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
  });
  console.log('✅ Prisma Client generiert!\n');

  // 2. Next.js Build
  console.log('🏗️  Baue Next.js App...');
  execSync('npm run build', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  console.log('✅ Build abgeschlossen!\n');

  console.log('🎉 Prisma Build erfolgreich abgeschlossen!');
} catch (error) {
  console.error('❌ Fehler beim Build:', error.message);
  process.exit(1);
}










#!/usr/bin/env node
/**
 * Prisma Connection Check Script
 * Testet die Verbindung zur PostgreSQL-Datenbank
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkConnection() {
  try {
    console.log('🔌 Teste PostgreSQL-Verbindung...\n');
    console.log(`📡 DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);

    // Verbindung testen
    await prisma.$connect();
    console.log('✅ Verbindung erfolgreich!\n');

    // Einfache Abfrage
    const userCount = await prisma.user.count();
    console.log(`📊 Anzahl User: ${userCount}`);

    const customerCount = await prisma.customer.count();
    console.log(`📊 Anzahl Customer: ${customerCount}`);

    const orderCount = await prisma.order.count();
    console.log(`📊 Anzahl Order: ${orderCount}\n`);

    // Datenbank-Info
    const result = await prisma.$queryRaw`SELECT version()`;
    console.log(`🗄️  Datenbank: PostgreSQL`);
    console.log(`📋 Version: ${result[0].version}\n`);

    console.log('✅ Alle Checks erfolgreich!\n');
  } catch (error) {
    console.error('❌ Verbindungsfehler:', error.message);
    console.error('\n💡 Mögliche Ursachen:');
    console.error('   - PostgreSQL-Server läuft nicht');
    console.error('   - Falsche IP-Adresse oder Port');
    console.error('   - Firewall blockiert die Verbindung');
    console.error('   - Falsche Benutzerdaten');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkConnection();










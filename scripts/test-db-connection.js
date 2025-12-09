/**
 * Test-Script: Prüft ob die App auf PostgreSQL zugreift
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('🔌 Teste Datenbankverbindung...\n');
    console.log(`📡 DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);
    
    // Test 1: Verbindung testen
    await prisma.$connect();
    console.log('✅ Verbindung erfolgreich!\n');
    
    // Test 2: Einfache Abfrage
    const userCount = await prisma.user.count();
    console.log(`📊 Anzahl User in Datenbank: ${userCount}`);
    
    const customerCount = await prisma.customer.count();
    console.log(`📊 Anzahl Customer in Datenbank: ${customerCount}`);
    
    const orderCount = await prisma.order.count();
    console.log(`📊 Anzahl Order in Datenbank: ${orderCount}\n`);
    
    // Test 3: Datenbank-Info
    const result = await prisma.$queryRaw`SELECT version()`;
    console.log(`🗄️  Datenbank: PostgreSQL`);
    console.log(`📋 Version: ${result[0].version}\n`);
    
    console.log('✅ Alle Tests erfolgreich! Die App greift auf PostgreSQL zu.\n');
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
















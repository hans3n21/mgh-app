import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function testConnection() {
    console.log('🔍 Testing PostgreSQL Connection...\n');
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@') || 'NOT SET');

    if (!process.env.DATABASE_URL) {
        console.error('\n❌ ERROR: DATABASE_URL not set');
        process.exit(1);
    }

    try {
        console.log('\nAttempting to connect...');
        const prisma = new PrismaClient({
            log: ['error', 'warn'],
        });

        await prisma.$connect();
        console.log('✅ Successfully connected to PostgreSQL!');

        // Try a simple query
        console.log('\nTesting query...');
        const result = await prisma.$queryRaw`SELECT 1 as test`;
        console.log('✅ Query successful:', result);

        await prisma.$disconnect();
        console.log('\n✅ Connection test passed!');

    } catch (error: any) {
        console.error('\n❌ Connection failed!');
        console.error('Error:', error.message);
        console.error('\nPossible issues:');
        console.error('  - PostgreSQL server not running');
        console.error('  - Incorrect host/port in DATABASE_URL');
        console.error('  - Firewall blocking connection');
        console.error('  - Wrong credentials');
        console.error('  - Database does not exist');
        process.exit(1);
    }
}

testConnection();

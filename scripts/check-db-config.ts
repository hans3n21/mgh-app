import 'dotenv/config';

console.log('=== DATABASE CONFIGURATION CHECK ===\n');
console.log('DATABASE_URL:', process.env.DATABASE_URL || 'NOT SET');
console.log('\nDatabase Type:', process.env.DATABASE_URL?.startsWith('file:') ? 'SQLite' : process.env.DATABASE_URL?.startsWith('postgresql') ? 'PostgreSQL' : 'Unknown');

if (!process.env.DATABASE_URL) {
    console.log('\n❌ ERROR: No DATABASE_URL found in environment');
    console.log('   Please create a .env file with DATABASE_URL');
} else if (process.env.DATABASE_URL.startsWith('file:')) {
    console.log('\n⚠️  WARNING: DATABASE_URL is currently pointing to SQLite');
    console.log('   For migration, this should point to PostgreSQL');
} else if (process.env.DATABASE_URL.startsWith('postgresql')) {
    console.log('\n✅ DATABASE_URL is correctly configured for PostgreSQL');
}

import 'dotenv/config';
import { Client } from 'pg';

async function createDatabase() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error('❌ DATABASE_URL not set');
        process.exit(1);
    }

    // Parse the URL to get database name
    const url = new URL(dbUrl);
    const dbName = url.pathname.slice(1); // Remove leading "/"
    const baseUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`;

    console.log('🔍 Database Configuration:');
    console.log(`  Host: ${url.hostname}`);
    console.log(`  Port: ${url.port}`);
    console.log(`  Database: ${dbName}`);
    console.log(`  User: ${url.username}\n`);

    console.log('📝 Attempting to create database...\n');

    try {
        // Connect to the default 'postgres' database
        const client = new Client({
            connectionString: baseUrl,
        });

        await client.connect();
        console.log('✅ Connected to PostgreSQL server');

        // Check if database exists
        const checkQuery = `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`;
        const result = await client.query(checkQuery);

        if (result.rows.length > 0) {
            console.log(`✅ Database '${dbName}' already exists`);
        } else {
            console.log(`📦 Creating database '${dbName}'...`);
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log(`✅ Database '${dbName}' created successfully!`);
        }

        await client.end();

        console.log('\n✅ Ready to proceed!');
        console.log('\nNext steps:');
        console.log('  1. Run: npx prisma db push');
        console.log('  2. Run: npx tsx scripts/migrate-sqlite-to-postgres.ts --clear');

    } catch (error: any) {
        console.error('\n❌ Failed to create database');
        console.error('Error:', error.message);

        if (error.message.includes('permission denied')) {
            console.error('\n💡 The database user does not have permission to create databases.');
            console.error('   Please ask your database administrator to:');
            console.error(`   1. Create the database: CREATE DATABASE "${dbName}";`);
            console.error(`   2. Grant access: GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO ${url.username};`);
        }

        process.exit(1);
    }
}

createDatabase();

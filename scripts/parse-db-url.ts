import 'dotenv/config';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
}

try {
    const url = new URL(dbUrl);

    console.log('=== DATABASE_URL PARSE RESULT ===\n');
    console.log('Protocol:', url.protocol);
    console.log('Host:', url.hostname);
    console.log('Port:', url.port);
    console.log('Database:', url.pathname.slice(1));
    console.log('Username:', url.username);
    console.log('Password:', url.password ? '***' + url.password.slice(-3) : 'NOT SET');
    console.log('Search params:', url.search);

    console.log('\n=== FULL URL (sanitized) ===');
    const sanitized = dbUrl.replace(/:[^:@]+@/, ':****@');
    console.log(sanitized);

} catch (error: any) {
    console.error('❌ Invalid DATABASE_URL format');
    console.error('Error:', error.message);
}

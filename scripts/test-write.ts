import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function testWrite() {
    const url = process.env.DATABASE_URL;
    console.log('URL:', url?.replace(/:[^:@]+@/, ':****@'));

    const prisma = new PrismaClient({
        datasources: { db: { url } },
    });

    try {
        console.log('Connecting...');
        await prisma.$connect();

        console.log('Creating test user...');
        // Use 'USER' as string, assuming enum matches or is compatible
        const user = await prisma.user.create({
            data: {
                email: `test-${Date.now()}@example.com`,
                name: 'Test User',
                role: 'USER',
            }
        });
        console.log('Created user:', user.id);

        const count = await prisma.user.count();
        console.log('User count:', count);

    } catch (e: any) {
        console.error('Error Message:', e.message);
        if (e.code) console.error('Error Code:', e.code);
    } finally {
        await prisma.$disconnect();
    }
}

testWrite();

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const LOG_FILE = 'migration-debug.log';

function log(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(msg);
}

async function debug() {
    fs.writeFileSync(LOG_FILE, '--- START DEBUG ---\n');

    const url = process.env.DATABASE_URL;
    log(`DATABASE_URL (masked): ${url?.replace(/:[^:@]+@/, ':****@')}`);

    const prisma = new PrismaClient({
        datasources: { db: { url } },
        log: ['query', 'info', 'warn', 'error'],
    });

    try {
        log('Connecting to Prisma...');
        await prisma.$connect();
        log('Connected.');

        log('Attempting to create a test user...');
        const email = `debug-${Date.now()}@example.com`;
        const user = await prisma.user.create({
            data: {
                email: email,
                name: 'Debug User',
                role: 'USER',
            }
        });
        log(`User created! ID: ${user.id}`);

        const count = await prisma.user.count();
        log(`Total User Count in DB: ${count}`);

    } catch (e: any) {
        log(`ERROR: ${e.message}`);
        if (e.code) log(`ERROR CODE: ${e.code}`);
        if (e.meta) log(`ERROR META: ${JSON.stringify(e.meta)}`);
    } finally {
        await prisma.$disconnect();
        log('--- END DEBUG ---');
    }
}

debug();

import { syncAllAccounts } from '../lib/mail/sync';
import { seedDefaultAccount } from '../lib/mail/account';
import { prisma } from '../lib/prisma';

// Keep the process alive
const INTERVAL_MS = 60 * 1000; // 1 minute

async function main() {
    console.log('Starting Mail Sync Worker...');

    // Ensure at least one account exists
    await seedDefaultAccount();

    // Initial Sync
    await runSync();

    // Loop
    setInterval(runSync, INTERVAL_MS);
}

async function runSync() {
    console.log(`[${new Date().toISOString()}] Syncing accounts...`);
    try {
        await syncAllAccounts();
        console.log(`[${new Date().toISOString()}] Sync complete.`);
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Stopping worker...');
    await prisma.$disconnect();
    process.exit(0);
});

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

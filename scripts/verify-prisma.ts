import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking Prisma Client...');

    // Check if model exists on client
    if ('mailAccount' in prisma) {
        console.log('SUCCESS: prisma.mailAccount exists.');
    } else {
        console.error('FAILURE: prisma.mailAccount does NOT exist.');
    }

    try {
        // Try to count
        // @ts-ignore
        const count = await prisma.mailAccount.count();
        console.log(`SUCCESS: Counted ${count} mail accounts.`);
    } catch (e) {
        console.error('FAILURE: Could not query mailAccount:', e);
    }

    await prisma.$disconnect();
}

main();

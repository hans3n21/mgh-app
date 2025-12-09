import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function checkImages() {
    const prisma = new PrismaClient();
    try {
        const count = await prisma.orderImage.count();
        console.log(`Total OrderImages in Postgres: ${count}`);

        if (count > 0) {
            const samples = await prisma.orderImage.findMany({ take: 5 });
            console.log('Sample Images:', JSON.stringify(samples, null, 2));
        } else {
            console.log('No images found in Postgres.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkImages();

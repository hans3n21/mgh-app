import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function verify() {
    console.log('URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
    const prisma = new PrismaClient();
    try {
        const users = await prisma.user.count();
        const customers = await prisma.customer.count();
        const orders = await prisma.order.count();

        console.log(`USERS:${users}`);
        console.log(`CUSTOMERS:${customers}`);
        console.log(`ORDERS:${orders}`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

verify();

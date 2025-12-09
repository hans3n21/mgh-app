import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function checkData() {
    console.log('🔍 Checking PostgreSQL database for existing data...\n');

    try {
        const prisma = new PrismaClient();
        await prisma.$connect();
        console.log('✅ Connected to PostgreSQL\n');

        // Check for data in key tables
        console.log('📊 Checking tables:\n');

        const userCount = await prisma.user.count();
        console.log(`  Users: ${userCount}`);

        const customerCount = await prisma.customer.count();
        console.log(`  Customers: ${customerCount}`);

        const orderCount = await prisma.order.count();
        console.log(`  Orders: ${orderCount}`);

        const priceItemCount = await prisma.priceItem.count();
        console.log(`  Price Items: ${priceItemCount}`);

        const procurementCount = await prisma.procurementItem.count();
        console.log(`  Procurement Items: ${procurementCount}`);

        const mailAccountCount = await prisma.mailAccount.count();
        console.log(`  Mail Accounts: ${mailAccountCount}`);

        const mailCount = await prisma.mail.count();
        console.log(`  Mails: ${mailCount}`);

        await prisma.$disconnect();

        const totalRecords = userCount + customerCount + orderCount + priceItemCount + procurementCount;

        console.log(`\n📈 Total business records: ${totalRecords}`);

        if (totalRecords === 0) {
            console.log('\n❌ Database is empty - migration needed!');
            console.log('\nRun: npx tsx scripts/migrate-sqlite-to-postgres.ts --clear');
        } else {
            console.log('\n✅ Database contains data!');
            console.log('\nThe data is already in PostgreSQL.');
            console.log('If you want to re-import from SQLite, run:');
            console.log('  npx tsx scripts/migrate-sqlite-to-postgres.ts --clear');
        }

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);

        if (error.message.includes('does not exist')) {
            console.error('\n💡 Tables do not exist yet. Run first:');
            console.error('   npx prisma db push');
        }
    }
}

checkData();

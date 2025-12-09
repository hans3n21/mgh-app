/**
 * Backup PostgreSQL database to JSON files
 * 
 * Creates a timestamped backup of all data in the PostgreSQL database
 * so it can be restored if the migration goes wrong.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function backup() {
    try {
        console.log('🔍 Checking configuration...');
        console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET');

        if (!process.env.DATABASE_URL) {
            console.error('❌ ERROR: DATABASE_URL is not set!');
            console.error('   Please create a .env file with your PostgreSQL connection string.');
            console.error('   Example: DATABASE_URL="postgresql://user:password@localhost:5432/dbname"');
            process.exit(1);
        }

        if (process.env.DATABASE_URL.startsWith('file:')) {
            console.error('❌ ERROR: DATABASE_URL points to SQLite, not PostgreSQL!');
            console.error('   Current: ' + process.env.DATABASE_URL);
            console.error('   Please update .env to use a PostgreSQL connection string.');
            process.exit(1);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = join(process.cwd(), 'backups', `postgres-backup-${timestamp}`);

        console.log('📦 Creating PostgreSQL backup...');
        console.log(`📁 Backup directory: ${backupDir}\n`);

        // Create backup directory
        mkdirSync(backupDir, { recursive: true });

        // Backup all tables
        console.log('💾 Backing up data...\n');

        // 1. Users
        console.log('  👥 Users...');
        const users = await prisma.user.findMany();
        writeFileSync(join(backupDir, 'users.json'), JSON.stringify(users, null, 2));
        console.log(`     ✅ ${users.length} users`);

        // 1a. Accounts
        const accounts = await prisma.account.findMany();
        writeFileSync(join(backupDir, 'accounts.json'), JSON.stringify(accounts, null, 2));

        // 1b. Sessions
        const sessions = await prisma.session.findMany();
        writeFileSync(join(backupDir, 'sessions.json'), JSON.stringify(sessions, null, 2));

        // 2. Customers
        console.log('  👤 Customers...');
        const customers = await prisma.customer.findMany();
        writeFileSync(join(backupDir, 'customers.json'), JSON.stringify(customers, null, 2));
        console.log(`     ✅ ${customers.length} customers`);

        // 3. Orders
        console.log('  📦 Orders...');
        const orders = await prisma.order.findMany();
        writeFileSync(join(backupDir, 'orders.json'), JSON.stringify(orders, null, 2));
        console.log(`     ✅ ${orders.length} orders`);

        // 3a. Order Specs
        const orderSpecs = await prisma.orderSpecKV.findMany();
        writeFileSync(join(backupDir, 'orderSpecs.json'), JSON.stringify(orderSpecs, null, 2));

        // 3b. Order Images
        const orderImages = await prisma.orderImage.findMany();
        writeFileSync(join(backupDir, 'orderImages.json'), JSON.stringify(orderImages, null, 2));

        // 3c. Order Items
        const orderItems = await prisma.orderItem.findMany();
        writeFileSync(join(backupDir, 'orderItems.json'), JSON.stringify(orderItems, null, 2));

        // 3d. Messages
        const messages = await prisma.message.findMany();
        writeFileSync(join(backupDir, 'messages.json'), JSON.stringify(messages, null, 2));

        // 3e. Order Extras
        const orderExtras = await prisma.orderExtra.findMany();
        writeFileSync(join(backupDir, 'orderExtras.json'), JSON.stringify(orderExtras, null, 2));

        // 3f. Datasheets
        const datasheets = await prisma.datasheet.findMany();
        writeFileSync(join(backupDir, 'datasheets.json'), JSON.stringify(datasheets, null, 2));

        // 4. Price Items
        console.log('  💰 Price Items...');
        const priceItems = await prisma.priceItem.findMany();
        writeFileSync(join(backupDir, 'priceItems.json'), JSON.stringify(priceItems, null, 2));
        console.log(`     ✅ ${priceItems.length} price items`);

        // 5. Procurement Items
        console.log('  📋 Procurement Items...');
        const procurementItems = await prisma.procurementItem.findMany();
        writeFileSync(join(backupDir, 'procurementItems.json'), JSON.stringify(procurementItems, null, 2));
        console.log(`     ✅ ${procurementItems.length} procurement items`);

        // 6. Mail Accounts (important to preserve!)
        console.log('  📧 Mail Accounts...');
        const mailAccounts = await prisma.mailAccount.findMany();
        writeFileSync(join(backupDir, 'mailAccounts.json'), JSON.stringify(mailAccounts, null, 2));
        console.log(`     ✅ ${mailAccounts.length} mail accounts`);

        // 7. Mails
        console.log('  ✉️  Mails...');
        const mails = await prisma.mail.findMany();
        writeFileSync(join(backupDir, 'mails.json'), JSON.stringify(mails, null, 2));
        console.log(`     ✅ ${mails.length} mails`);

        // 7a. Attachments
        const attachments = await prisma.attachment.findMany();
        writeFileSync(join(backupDir, 'attachments.json'), JSON.stringify(attachments, null, 2));

        // 8. Reply Templates
        console.log('  📝 Reply Templates...');
        const replyTemplates = await prisma.replyTemplate.findMany();
        writeFileSync(join(backupDir, 'replyTemplates.json'), JSON.stringify(replyTemplates, null, 2));
        console.log(`     ✅ ${replyTemplates.length} reply templates`);

        // 9. System Settings
        console.log('  ⚙️  System Settings...');
        const systemSettings = await prisma.systemSetting.findMany();
        writeFileSync(join(backupDir, 'systemSettings.json'), JSON.stringify(systemSettings, null, 2));
        console.log(`     ✅ ${systemSettings.length} system settings`);

        // 10. Feedback
        console.log('  💬 Feedback...');
        const feedback = await prisma.feedback.findMany();
        writeFileSync(join(backupDir, 'feedback.json'), JSON.stringify(feedback, null, 2));
        console.log(`     ✅ ${feedback.length} feedback entries`);

        // 11. Verification Tokens
        console.log('  🔑 Verification Tokens...');
        const verificationTokens = await prisma.verificationToken.findMany();
        writeFileSync(join(backupDir, 'verificationTokens.json'), JSON.stringify(verificationTokens, null, 2));
        console.log(`     ✅ ${verificationTokens.length} verification tokens`);

        // Create metadata file
        const metadata = {
            timestamp: new Date().toISOString(),
            databaseType: 'PostgreSQL',
            backupVersion: '1.0',
            counts: {
                users: users.length,
                customers: customers.length,
                orders: orders.length,
                priceItems: priceItems.length,
                procurementItems: procurementItems.length,
                mailAccounts: mailAccounts.length,
                mails: mails.length,
                replyTemplates: replyTemplates.length,
                systemSettings: systemSettings.length,
                feedback: feedback.length,
                verificationTokens: verificationTokens.length,
            },
        };
        writeFileSync(join(backupDir, '_metadata.json'), JSON.stringify(metadata, null, 2));

        console.log('\n🎉 Backup completed successfully!');
        console.log(`📁 Location: ${backupDir}`);
        console.log('\n📊 Summary:');
        console.log(`  - ${users.length} users`);
        console.log(`  - ${customers.length} customers`);
        console.log(`  - ${orders.length} orders`);
        console.log(`  - ${mailAccounts.length} mail accounts`);
        console.log(`  - ${mails.length} mails`);
        console.log(`  - ${priceItems.length} price items`);
        console.log(`  - ${procurementItems.length} procurement items`);

        if (mailAccounts.length > 0 || mails.length > 0) {
            console.log('\n⚠️  WICHTIG: Mail-Daten wurden gesichert!');
            console.log('   Diese werden bei der Migration NICHT überschrieben.');
        }

        return backupDir;

    } catch (error) {
        console.error('❌ Backup failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

backup()
    .then((dir) => {
        console.log(`\n✅ Backup gespeichert: ${dir}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });

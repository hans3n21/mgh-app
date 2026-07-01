/**
 * JSON-Restore Funktionen
 * Stellt Datenbank aus JSON-Backup-Dateien wieder her
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

/**
 * Leert die Datenbank in der richtigen Reihenfolge (wegen Foreign Keys)
 */
async function clearDatabase(): Promise<void> {
    console.log('🗑️  Leere Datenbank...');
    
    // Reihenfolge: Zuerst abhängige Tabellen, dann Basis-Tabellen
    await prisma.attachment.deleteMany();
    await prisma.mail.deleteMany();
    await prisma.mailAccount.deleteMany();
    await prisma.datasheet.deleteMany();
    await prisma.orderExtra.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.message.deleteMany();
    await prisma.orderImage.deleteMany();
    await prisma.orderSpecKV.deleteMany();
    await prisma.order.deleteMany();
    await prisma.procurementItem.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.feedback.deleteMany();
    await prisma.replyTemplate.deleteMany();
    await prisma.priceItem.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.systemSetting.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.user.deleteMany();
    
    console.log('✅ Datenbank geleert');
}

/**
 * Lädt JSON-Datei aus Backup-Verzeichnis
 */
function loadJsonFile(backupPath: string, filename: string): any[] {
    const filePath = join(backupPath, filename);
    if (!existsSync(filePath)) {
        return [];
    }
    try {
        const content = readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`⚠️  Konnte ${filename} nicht laden:`, error);
        return [];
    }
}

/**
 * Stellt Datenbank aus JSON-Backup wieder her
 */
export async function restoreFromJson(backupPath: string): Promise<{ success: boolean; error?: string; counts?: Record<string, number> }> {
    try {
        await prisma.$connect();
        
        // Prüfe ob Backup-Verzeichnis existiert
        if (!existsSync(backupPath)) {
            return { success: false, error: 'Backup-Verzeichnis nicht gefunden' };
        }
        
        // Prüfe ob Metadaten existiert
        const metadataPath = join(backupPath, '_metadata.json');
        if (!existsSync(metadataPath)) {
            return { success: false, error: 'Backup-Metadaten nicht gefunden' };
        }
        
        // Leere Datenbank
        await clearDatabase();
        
        console.log('📥 Lade Daten aus Backup...');
        
        // Lade Daten in der richtigen Reihenfolge (wegen Foreign Keys)
        const counts: Record<string, number> = {};
        
        // 1. Basis-Tabellen (keine Foreign Keys)
        console.log('  👥 Users...');
        const users = loadJsonFile(backupPath, 'users.json');
        for (const user of users) {
            await prisma.user.create({ data: user });
        }
        counts.users = users.length;
        console.log(`     ✅ ${users.length} users`);
        
        console.log('  👤 Customers...');
        const customers = loadJsonFile(backupPath, 'customers.json');
        for (const customer of customers) {
            await prisma.customer.create({ data: customer });
        }
        counts.customers = customers.length;
        console.log(`     ✅ ${customers.length} customers`);
        
        console.log('  💰 Price Items...');
        const priceItems = loadJsonFile(backupPath, 'priceItems.json');
        for (const item of priceItems) {
            await prisma.priceItem.create({ data: item });
        }
        counts.priceItems = priceItems.length;
        console.log(`     ✅ ${priceItems.length} price items`);
        
        console.log('  📋 Procurement Items...');
        const procurementItems = loadJsonFile(backupPath, 'procurementItems.json');
        for (const item of procurementItems) {
            await prisma.procurementItem.create({ data: item });
        }
        counts.procurementItems = procurementItems.length;
        
        // Accounts & Sessions (abhängig von User)
        const accounts = loadJsonFile(backupPath, 'accounts.json');
        for (const account of accounts) {
            await prisma.account.create({ data: account });
        }
        counts.accounts = accounts.length;
        
        const sessions = loadJsonFile(backupPath, 'sessions.json');
        for (const session of sessions) {
            await prisma.session.create({ data: session });
        }
        counts.sessions = sessions.length;
        
        // 2. Orders (abhängig von User/Customer)
        console.log('  📦 Orders...');
        const orders = loadJsonFile(backupPath, 'orders.json');
        for (const order of orders) {
            await prisma.order.create({ data: order });
        }
        counts.orders = orders.length;
        console.log(`     ✅ ${orders.length} orders`);
        
        // 3. Order-abhängige Tabellen
        const orderSpecs = loadJsonFile(backupPath, 'orderSpecs.json');
        for (const spec of orderSpecs) {
            await prisma.orderSpecKV.create({ data: spec });
        }
        counts.orderSpecs = orderSpecs.length;
        
        const orderImages = loadJsonFile(backupPath, 'orderImages.json');
        for (const image of orderImages) {
            await prisma.orderImage.create({ data: image });
        }
        counts.orderImages = orderImages.length;
        
        const orderItems = loadJsonFile(backupPath, 'orderItems.json');
        for (const item of orderItems) {
            await prisma.orderItem.create({ data: item });
        }
        counts.orderItems = orderItems.length;
        
        const messages = loadJsonFile(backupPath, 'messages.json');
        for (const message of messages) {
            await prisma.message.create({ data: message });
        }
        counts.messages = messages.length;
        
        const orderExtras = loadJsonFile(backupPath, 'orderExtras.json');
        for (const extra of orderExtras) {
            await prisma.orderExtra.create({ data: extra });
        }
        counts.orderExtras = orderExtras.length;
        
        const datasheets = loadJsonFile(backupPath, 'datasheets.json');
        for (const datasheet of datasheets) {
            await prisma.datasheet.create({ data: datasheet });
        }
        counts.datasheets = datasheets.length;
        
        // 4. Mail Accounts
        console.log('  📧 Mail Accounts...');
        const mailAccounts = loadJsonFile(backupPath, 'mailAccounts.json');
        for (const account of mailAccounts) {
            await prisma.mailAccount.create({ data: account });
        }
        counts.mailAccounts = mailAccounts.length;
        console.log(`     ✅ ${mailAccounts.length} mail accounts`);
        
        // 5. Mails
        console.log('  ✉️  Mails...');
        const mails = loadJsonFile(backupPath, 'mails.json');
        for (const mail of mails) {
            await prisma.mail.create({ data: mail });
        }
        counts.mails = mails.length;
        console.log(`     ✅ ${mails.length} mails`);
        
        // 6. Attachments (abhängig von Mail)
        const attachments = loadJsonFile(backupPath, 'attachments.json');
        for (const attachment of attachments) {
            await prisma.attachment.create({ data: attachment });
        }
        counts.attachments = attachments.length;
        
        // 7. Reply Templates
        console.log('  📝 Reply Templates...');
        const replyTemplates = loadJsonFile(backupPath, 'replyTemplates.json');
        for (const template of replyTemplates) {
            await prisma.replyTemplate.create({ data: template });
        }
        counts.replyTemplates = replyTemplates.length;
        
        // 8. System Settings
        console.log('  ⚙️  System Settings...');
        const systemSettings = loadJsonFile(backupPath, 'systemSettings.json');
        for (const setting of systemSettings) {
            await prisma.systemSetting.create({ data: setting });
        }
        counts.systemSettings = systemSettings.length;
        
        // 9. Feedback
        console.log('  💬 Feedback...');
        const feedback = loadJsonFile(backupPath, 'feedback.json');
        for (const item of feedback) {
            await prisma.feedback.create({ data: item });
        }
        counts.feedback = feedback.length;
        
        // 10. Verification Tokens
        const verificationTokens = loadJsonFile(backupPath, 'verificationTokens.json');
        for (const token of verificationTokens) {
            await prisma.verificationToken.create({ data: token });
        }
        counts.verificationTokens = verificationTokens.length;
        
        console.log('\n✅ Datenbank erfolgreich wiederhergestellt!');
        console.log('📊 Zusammenfassung:');
        console.log(`  - ${counts.users} users`);
        console.log(`  - ${counts.customers} customers`);
        console.log(`  - ${counts.orders} orders`);
        console.log(`  - ${counts.mailAccounts} mail accounts`);
        console.log(`  - ${counts.mails} mails`);
        
        return { success: true, counts };
    } catch (error: any) {
        console.error('❌ Restore fehlgeschlagen:', error);
        return { success: false, error: error.message || String(error) };
    } finally {
        await prisma.$disconnect();
    }
}

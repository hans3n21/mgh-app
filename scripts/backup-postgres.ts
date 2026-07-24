/**
 * Backup PostgreSQL database to JSON files and SQL dump
 * 
 * Creates a timestamped backup of all data in the PostgreSQL database
 * - JSON files for selective restore
 * - SQL dump for full database restore
 * - Automatic cleanup of old backups (keeps last 30 days)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { checkPostgresTools } from '../lib/check-postgres-tools';

const prisma = new PrismaClient();

// Parse PostgreSQL connection string to extract connection details
function parseDatabaseUrl(url: string): { host: string; port: string; database: string; user: string; password: string } | null {
    try {
        // Format: postgresql://user:password@host:port/database
        const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (!match) return null;
        
        return {
            user: match[1],
            password: match[2],
            host: match[3],
            port: match[4],
            database: match[5],
        };
    } catch {
        return null;
    }
}

// Create SQL dump using pg_dump
async function createSqlDump(backupDir: string, dbUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('  💾 Creating SQL dump...');
        
        // Prüfe ob pg_dump verfügbar ist
        const toolsStatus = checkPostgresTools();
        if (!toolsStatus.pgDump.available) {
            const errorMsg = `pg_dump nicht gefunden. ${toolsStatus.pgDump.error || 'Bitte installieren Sie PostgreSQL Client Tools.'}`;
            console.warn(`     ⚠️  ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
        
        console.log(`     📍 pg_dump gefunden: ${toolsStatus.pgDump.path || 'im PATH'}`);
        
        const dbInfo = parseDatabaseUrl(dbUrl);
        
        if (!dbInfo) {
            const errorMsg = 'Could not parse DATABASE_URL';
            console.warn(`     ⚠️  ${errorMsg}`);
            return { success: false, error: errorMsg };
        }

        const dumpFile = join(backupDir, 'database.sql');
        
        // Use pg_dump with connection string (password will be in URL)
        // Set PGPASSWORD environment variable for pg_dump
        const env = { ...process.env, PGPASSWORD: dbInfo.password };
        
        // Build pg_dump command
        // --clean: Fügt DROP TABLE Befehle hinzu für vollständige Wiederherstellung
        // --if-exists: Verhindert Fehler wenn Tabellen nicht existieren
        const dumpCmd = `pg_dump -h ${dbInfo.host} -p ${dbInfo.port} -U ${dbInfo.user} -d ${dbInfo.database} --clean --if-exists --no-owner --no-acl -f "${dumpFile}"`;
        
        execSync(dumpCmd, { 
            env,
            stdio: 'pipe', // Hide output unless error
        });
        
        const stats = statSync(dumpFile);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`     ✅ SQL dump created (${sizeMB} MB)`);
        return { success: true };
    } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.warn(`     ⚠️  SQL dump failed: ${errorMsg}`);
        console.warn('     💡 Install PostgreSQL client tools or use JSON backup only');
        return { success: false, error: errorMsg };
    }
}

/**
 * Prüft ob die Datenbank funktioniert und Daten enthält
 */
async function checkDatabaseHealth(): Promise<{ 
    isHealthy: boolean; 
    hasData: boolean; 
    error?: string; 
    recordCounts?: { users: number; customers: number; orders: number; total: number } 
}> {
    try {
        await prisma.$connect();
        
        // Prüfe ob wichtige Tabellen existieren und Daten enthalten
        const [users, customers, orders] = await Promise.all([
            prisma.user.count().catch(() => 0),
            prisma.customer.count().catch(() => 0),
            prisma.order.count().catch(() => 0),
        ]);
        
        const totalRecords = users + customers + orders;
        const hasData = totalRecords > 0;
        const hasUsers = users > 0; // Mindestens ein User ist kritisch
        
        // DB ist gesund wenn: Verbindung funktioniert UND mindestens ein User existiert UND Daten vorhanden
        const isHealthy = hasUsers && hasData;
        
        return {
            isHealthy,
            hasData,
            recordCounts: {
                users,
                customers,
                orders,
                total: totalRecords,
            },
        };
    } catch (error: any) {
        return {
            isHealthy: false,
            hasData: false,
            error: error.message || String(error),
        };
    }
}

/**
 * Prüft ob ein Backup gültig ist (enthält Daten)
 */
function verifyBackupHealth(backupDir: string): boolean {
    try {
        const metadataPath = join(backupDir, '_metadata.json');
        if (!existsSync(metadataPath)) {
            return false;
        }
        
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        const counts = metadata.counts || {};
        const totalRecords = (counts.users || 0) + (counts.customers || 0) + (counts.orders || 0);
        
        // Backup ist gültig wenn es Daten enthält UND mindestens ein User
        return totalRecords > 0 && (counts.users || 0) > 0;
    } catch {
        return false;
    }
}

/**
 * Cleanup old backups (keep last 30 days)
 * SICHERHEIT: Nur wenn DB gesund ist UND mindestens ein gültiges Backup bleibt
 */
async function cleanupOldBackups(backupsDir: string, keepDays: number = 30): Promise<void> {
    try {
        // Prüfe erst ob DB gesund ist
        const health = await checkDatabaseHealth();
        
        if (!health.isHealthy) {
            console.warn('⚠️  Datenbank ist nicht gesund - Cleanup übersprungen zum Schutz der Backups!');
            if (health.error) {
                console.warn(`   Fehler: ${health.error}`);
            } else {
                console.warn('   Grund: Keine Daten in der Datenbank');
            }
            return;
        }
        
        const files = readdirSync(backupsDir);
        const now = Date.now();
        const maxAge = keepDays * 24 * 60 * 60 * 1000; // days to milliseconds
        
        // Zähle gültige Backups
        const validBackups: string[] = [];
        for (const file of files) {
            if (!file.startsWith('postgres-backup-')) continue;
            const filePath = join(backupsDir, file);
            try {
                if (statSync(filePath).isDirectory() && verifyBackupHealth(filePath)) {
                    validBackups.push(file);
                }
            } catch {
                // Ignore errors
            }
        }
        
        let deleted = 0;
        let skipped = 0;
        let remainingValidBackups = validBackups.length;
        
        for (const file of files) {
            if (!file.startsWith('postgres-backup-')) continue;
            
            const filePath = join(backupsDir, file);
            try {
                const stats = statSync(filePath);
                
                if (stats.isDirectory() && (now - stats.mtimeMs) > maxAge) {
                    // Prüfe ob Backup gültig ist
                    const isValid = verifyBackupHealth(filePath);
                    
                    // Nur löschen wenn:
                    // 1. Backup alt ist UND
                    // 2. (Backup ungültig ist ODER es gibt noch andere gültige Backups)
                    if (!isValid || remainingValidBackups > 1) {
                        const filesInDir = readdirSync(filePath);
                        for (const f of filesInDir) {
                            unlinkSync(join(filePath, f));
                        }
                        rmdirSync(filePath);
                        deleted++;
                        
                        // Reduziere Zähler wenn gültiges Backup gelöscht wurde
                        if (isValid) {
                            remainingValidBackups--;
                        }
                        
                        console.log(`  🗑️  Deleted old backup: ${file}`);
                    } else {
                        skipped++;
                        console.warn(`  ⚠️  Skipped deletion of ${file} - it's the only valid backup!`);
                    }
                }
            } catch (error) {
                // Ignore errors for individual backups
            }
        }
        
        if (deleted > 0) {
            console.log(`\n🧹 Cleanup: Removed ${deleted} old backup(s) (older than ${keepDays} days)`);
        }
        if (skipped > 0) {
            console.log(`\n🛡️  Sicherheit: ${skipped} Backup(s) geschützt (letztes gültiges Backup)`);
        }
    } catch (error) {
        console.warn('⚠️  Cleanup failed:', error);
    }
}

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

        // WICHTIG: Prüfe DB-Health VOR dem Backup
        console.log('🏥 Checking database health...\n');
        const health = await checkDatabaseHealth();
        
        if (!health.isHealthy) {
            console.error('❌ FEHLER: Datenbank ist nicht gesund!');
            if (health.error) {
                console.error(`   Fehler: ${health.error}`);
            } else {
                console.error('   Grund: Keine Daten in der Datenbank');
            }
            if (health.recordCounts) {
                console.error(`   Users: ${health.recordCounts.users}, Customers: ${health.recordCounts.customers}, Orders: ${health.recordCounts.orders}`);
            }
            console.error('\n⚠️  BACKUP ABGEBROCHEN zum Schutz vor Überschreibung gültiger Backups!');
            console.error('   Bitte prüfen Sie die Datenbank und stellen Sie sie wieder her, bevor Sie ein neues Backup erstellen.');
            process.exit(1);
        }
        
        console.log('✅ Datenbank ist gesund:');
        console.log(`   Users: ${health.recordCounts!.users}, Customers: ${health.recordCounts!.customers}, Orders: ${health.recordCounts!.orders}`);
        console.log(`   Gesamt: ${health.recordCounts!.total} Datensätze\n`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupsBaseDir = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
        const backupDir = join(backupsBaseDir, `postgres-backup-${timestamp}`);

        console.log('📦 Creating PostgreSQL backup...');
        console.log(`📁 Backup directory: ${backupDir}\n`);

        // Create backup directory
        mkdirSync(backupDir, { recursive: true });
        
        // Cleanup old backups before creating new one (nur wenn DB gesund)
        console.log('🧹 Cleaning up old backups...\n');
        await cleanupOldBackups(backupsBaseDir, 30);

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

        // 7. Mails (chunked export to avoid oversized single query issues)
        console.log('  ✉️  Mails...');
        const mailsPath = join(backupDir, 'mails.json');
        writeFileSync(mailsPath, '[\n');
        let mailsCount = 0;
        let cursor: string | null = null;
        let firstMail = true;
        const MAIL_BATCH_SIZE = 100;

        while (true) {
            const batch = await prisma.mail.findMany({
                take: MAIL_BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                orderBy: { id: 'asc' },
            });

            if (batch.length === 0) break;

            for (const mail of batch) {
                const line = JSON.stringify(mail, null, 2);
                appendFileSync(mailsPath, `${firstMail ? '' : ',\n'}${line}`);
                firstMail = false;
                mailsCount++;
            }

            cursor = batch[batch.length - 1].id;
        }

        appendFileSync(mailsPath, '\n]\n');
        console.log(`     ✅ ${mailsCount} mails`);

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

        // Create SQL dump
        console.log('\n');
        const sqlDumpResult = await createSqlDump(backupDir, process.env.DATABASE_URL!);

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
                mails: mailsCount,
                replyTemplates: replyTemplates.length,
                systemSettings: systemSettings.length,
                feedback: feedback.length,
                verificationTokens: verificationTokens.length,
            },
            sqlDump: {
                success: sqlDumpResult.success,
                error: sqlDumpResult.error || undefined,
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
        console.log(`  - ${mailsCount} mails`);
        console.log(`  - ${priceItems.length} price items`);
        console.log(`  - ${procurementItems.length} procurement items`);

        if (mailAccounts.length > 0 || mailsCount > 0) {
            console.log('\n⚠️  WICHTIG: Mail-Daten wurden gesichert!');
            console.log('   Diese werden bei der Migration NICHT überschrieben.');
        }

        console.log('\n💡 Restore:');
        console.log('   - JSON: Use Prisma to import individual tables');
        console.log('   - SQL:  Use psql or pg_restore to restore full database');
        console.log(`   - Example: psql $DATABASE_URL < "${join(backupDir, 'database.sql')}"`);

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

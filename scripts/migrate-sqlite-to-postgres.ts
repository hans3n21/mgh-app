/**
 * Migrate data from SQLite to PostgreSQL
 * Uses better-sqlite3 to read SQLite directly to avoid Prisma client conflicts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import fs from 'fs';

const LOG_FILE = 'migration.log';

function log(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(msg);
}

// Helper to convert SQLite string dates to Date objects
const toDate = (val: any) => val ? new Date(val) : new Date();

// Enum Mappers
function mapOrderType(type: string): any {
    const map: Record<string, string> = {
        'guitar': 'GUITAR', 'GUITAR': 'GUITAR',
        'body': 'BODY', 'BODY': 'BODY',
        'neck': 'NECK', 'NECK': 'NECK',
        'repair': 'REPAIR', 'REPAIR': 'REPAIR',
        'pickguard': 'PICKGUARD', 'PICKGUARD': 'PICKGUARD',
        'pickups': 'PICKUPS', 'PICKUPS': 'PICKUPS',
        'engraving': 'ENGRAVING', 'ENGRAVING': 'ENGRAVING',
        'finish': 'FINISH_ONLY', 'FINISH_ONLY': 'FINISH_ONLY'
    };
    return map[type] || 'GUITAR'; // Default
}

function mapOrderStatus(status: string): any {
    const map: Record<string, string> = {
        'intake': 'intake',
        'quote': 'quote',
        'in_progress': 'in_progress',
        'finishing': 'finishing',
        'setup': 'setup',
        'awaiting_customer': 'awaiting_customer',
        'complete': 'complete',
        'design_review': 'design_review'
    };
    return map[status] || 'intake'; // Default
}

async function migrate() {
    fs.writeFileSync(LOG_FILE, '--- START MIGRATION ---\n');
    log('🚀 Starting migration from SQLite to PostgreSQL...');

    const postgresUrl = process.env.DATABASE_URL;
    if (!postgresUrl || postgresUrl.startsWith('file:')) {
        log('❌ ERROR: DATABASE_URL must point to PostgreSQL!');
        process.exit(1);
    }
    log(`Target DB: ${postgresUrl.replace(/:[^:@]+@/, ':****@')}`);

    const shouldClear = process.argv.includes('--clear');

    try {
        // --- Step 1: Read from SQLite ---
        log('📖 Reading from SQLite database (prisma/dev_local.db)...');
        const db = new Database('./prisma/dev_local.db', { readonly: true });

        const getAll = (table: string) => {
            try {
                return db.prepare(`SELECT * FROM "${table}"`).all();
            } catch (e: any) {
                log(`⚠️ Could not read table ${table}: ${e.message}`);
                return [];
            }
        };

        const users = getAll('User');
        const accounts = getAll('Account');
        const sessions = getAll('Session');
        const customers = getAll('Customer');
        const priceItems = getAll('PriceItem');
        const orders = getAll('Order');
        const orderSpecs = getAll('OrderSpecKV');
        const orderImages = getAll('OrderImage');
        const orderItems = getAll('OrderItem');
        const messages = getAll('Message');
        const orderExtras = getAll('OrderExtra');
        const procurementItems = getAll('ProcurementItem');
        const datasheets = getAll('Datasheet');
        const systemSettings = getAll('SystemSetting');
        const feedbacks = getAll('Feedback');

        db.close();
        log(`✅ Data loaded from SQLite. Users: ${users.length}, Customers: ${customers.length}, Orders: ${orders.length}, Images: ${orderImages.length}`);

        // --- Step 2: Write to PostgreSQL ---
        log('💾 Writing to PostgreSQL...');

        const pg = new PrismaClient({
            datasources: { db: { url: postgresUrl } },
        });

        await pg.$connect();

        if (shouldClear) {
            log('⚠️  Clearing existing data in PostgreSQL...');
            try {
                await pg.feedback.deleteMany();
                // await pg.systemSetting.deleteMany(); 
                await pg.datasheet.deleteMany();
                await pg.orderExtra.deleteMany();
                await pg.orderItem.deleteMany();
                await pg.message.deleteMany();
                await pg.orderImage.deleteMany();
                await pg.orderSpecKV.deleteMany();
                await pg.order.deleteMany();
                await pg.customer.deleteMany();
                await pg.procurementItem.deleteMany();
                await pg.priceItem.deleteMany();
                await pg.session.deleteMany();
                await pg.account.deleteMany();
                await pg.user.deleteMany();
                log('✅ Cleared existing data');
            } catch (e: any) {
                log(`⚠️  Error clearing data: ${e.message}`);
            }
        }

        // 1. Users
        log(`👥 Migrating ${users.length} users...`);
        for (const user of users as any[]) {
            try {
                const data = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    passwordHash: user.passwordHash || 'placeholder_hash',
                    role: user.role,
                    createdAt: toDate(user.createdAt),
                };
                await pg.user.upsert({ where: { id: user.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed user ${user.id}: ${e.message}`);
            }
        }

        // 2. Accounts
        for (const account of accounts as any[]) {
            try {
                const { id, userId, type, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state } = account;
                const data = {
                    id, userId, type, provider, providerAccountId, refresh_token, access_token,
                    expires_at: expires_at || null,
                    token_type, scope, id_token, session_state
                };
                await pg.account.upsert({ where: { id: account.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed account ${account.id}: ${e.message}`);
            }
        }

        // 3. Sessions
        for (const session of sessions as any[]) {
            try {
                const { id, sessionToken, userId, expires } = session;
                const data = { id, sessionToken, userId, expires: toDate(expires) };
                await pg.session.upsert({ where: { id: session.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed session ${session.id}: ${e.message}`);
            }
        }

        // 4. Customers
        log(`👤 Migrating ${customers.length} customers...`);
        for (const customer of customers as any[]) {
            try {
                const name = customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown Customer';

                const data = {
                    id: customer.id,
                    name: name,
                    email: customer.email,
                    phone: customer.phone,
                    addressLine1: customer.street,
                    postalCode: customer.zip,
                    city: customer.city,
                    country: customer.country || 'DE',
                    createdAt: toDate(customer.createdAt),
                };
                await pg.customer.upsert({ where: { id: customer.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed customer ${customer.id}: ${e.message}`);
            }
        }

        // 5. Price Items
        log(`💰 Migrating ${priceItems.length} price items...`);
        for (const item of priceItems as any[]) {
            try {
                const data = {
                    id: item.id,
                    category: item.category || 'Uncategorized',
                    label: item.name || item.label || 'Unnamed Item',
                    description: item.description,
                    price: item.price, // Corrected from basePrice
                    unit: item.unit,
                    min: item.min,
                    max: item.max,
                    priceText: item.priceText,
                    mainCategory: item.mainCategory,
                    active: Boolean(item.active),
                };
                await pg.priceItem.upsert({ where: { id: item.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed price item ${item.id}: ${e.message}`);
            }
        }

        // 6. Orders
        log(`📦 Migrating ${orders.length} orders...`);
        for (const order of orders as any[]) {
            try {
                const data = {
                    id: order.id,
                    title: order.orderNumber || `Order ${order.id}`,
                    type: mapOrderType(order.type),
                    status: mapOrderStatus(order.status),
                    createdAt: toDate(order.createdAt),
                    customerId: order.customerId,
                    assigneeId: order.userId,
                    finalAmountCents: order.total ? Math.round(order.total * 100) : 0,
                    paymentStatus: (order.deposit && order.deposit > 0) ? 'deposit' : 'open',
                };
                await pg.order.upsert({ where: { id: order.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed order ${order.id}: ${e.message}`);
            }
        }

        // Order related tables
        log(`   Migrating ${orderSpecs.length} specs, ${orderImages.length} images...`);

        for (const spec of orderSpecs as any[]) {
            try {
                await pg.orderSpecKV.upsert({ where: { id: spec.id }, create: spec, update: spec });
            } catch (e: any) { log(`❌ Failed spec ${spec.id}: ${e.message}`); }
        }

        for (const img of orderImages as any[]) {
            try {
                const { id, orderId, path, comment, position, attach, scope, fieldKey, createdAt } = img;
                const data = {
                    id, orderId,
                    path: path || 'placeholder_path',
                    comment,
                    position: position || 0,
                    attach: Boolean(attach),
                    scope,
                    fieldKey,
                    createdAt: toDate(createdAt)
                };
                await pg.orderImage.upsert({ where: { id: img.id }, create: data, update: data });
            } catch (e: any) { log(`❌ Failed image ${img.id}: ${e.message}`); }
        }

        for (const item of orderItems as any[]) {
            try {
                // OrderItem mapping if needed
            } catch (e: any) { log(`❌ Failed item ${item.id}: ${e.message}`); }
        }

        for (const msg of messages as any[]) {
            try {
                const { id, content, text, message, body, orderId, userId, createdAt } = msg;
                const data = {
                    id,
                    body: content || text || message || body || 'Empty message',
                    orderId,
                    senderId: userId,
                    createdAt: toDate(createdAt)
                };
                await pg.message.upsert({ where: { id: msg.id }, create: data, update: data });
            } catch (e: any) { log(`❌ Failed message ${msg.id}: ${e.message}`); }
        }

        for (const extra of orderExtras as any[]) {
            try {
                const { id, orderId, description, price, category } = extra;
                const data = {
                    id, orderId,
                    label: description || 'Extra', // Map description to label
                    amountCents: price || 0, // Map price to amountCents
                    // category is not in schema?
                };
                await pg.orderExtra.upsert({ where: { id: extra.id }, create: data, update: data });
            } catch (e: any) { log(`❌ Failed extra ${extra.id}: ${e.message}`); }
        }

        // 7. Procurement Items
        for (const item of procurementItems as any[]) {
            try {
                const { id, name, url, status, price, notes, userId, createdAt } = item;
                const data = {
                    id, name, url, status, price, notes, userId,
                    createdAt: toDate(createdAt),
                };
                await pg.procurementItem.upsert({ where: { id: item.id }, create: data, update: data });
            } catch (e: any) {
                log(`❌ Failed procurement item ${item.id}: ${e.message}`);
            }
        }

        // 8. Datasheets
        if (datasheets.length > 0) {
            for (const d of datasheets as any[]) {
                try {
                    const { id, name, content, createdAt, orderId } = d;
                    let fields = {};
                    try {
                        fields = typeof content === 'string' ? JSON.parse(content) : content;
                    } catch {
                        fields = { content: content };
                    }

                    const data = {
                        id,
                        type: name || 'default', // Map name to type
                        fields: fields || {}, // Map content to fields
                        createdAt: toDate(createdAt),
                        orderId
                    };
                    await pg.datasheet.upsert({ where: { id: d.id }, create: data, update: data });
                } catch (e: any) { log(`❌ Failed datasheet ${d.id}: ${e.message}`); }
            }
        }

        // --- VERIFICATION ---
        log('🔍 Verifying data in PostgreSQL...');
        const userCount = await pg.user.count();
        const customerCount = await pg.customer.count();
        const orderCount = await pg.order.count();
        const imageCount = await pg.orderImage.count();

        log(`   Users: ${userCount}`);
        log(`   Customers: ${customerCount}`);
        log(`   Orders: ${orderCount}`);
        log(`   Images: ${imageCount}`);

        await pg.$disconnect();
        log('🎉 Migration completed!');

    } catch (error: any) {
        log(`❌ FATAL ERROR: ${error.message}`);
        process.exit(1);
    }
}

migrate();

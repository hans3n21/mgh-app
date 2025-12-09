import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

async function checkPrices() {
    const prisma = new PrismaClient();
    try {
        const items = await prisma.priceItem.findMany({
            where: { active: true },
            select: { id: true, label: true, price: true, priceText: true, active: true }
        });

        const withPrice = items.filter(i => i.price !== null && i.price > 0);
        const withPriceText = items.filter(i => i.priceText !== null && i.priceText !== '');
        const emptyPriceText = items.filter(i => i.priceText === '');

        const output = {
            total: items.length,
            withPriceCount: withPrice.length,
            withPriceTextCount: withPriceText.length,
            emptyPriceTextCount: emptyPriceText.length,
            sampleWithPrice: withPrice.length > 0 ? withPrice[0] : null,
            sampleWithPriceText: withPriceText.length > 0 ? withPriceText[0] : null,
            sampleEmptyPriceText: emptyPriceText.length > 0 ? emptyPriceText[0] : null,
            allWithPriceText: withPriceText.map(i => ({ id: i.id, text: i.priceText, price: i.price }))
        };
        fs.writeFileSync('check-prices-output.json', JSON.stringify(output, null, 2));
        console.log('Written to check-prices-output.json');

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkPrices();

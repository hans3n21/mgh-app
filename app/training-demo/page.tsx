import { notFound } from 'next/navigation';
import MailTrainingDemo from '@/components/inbox/MailTrainingDemo';
import { initialAnnotations, orderFields, sourceHash } from '@/lib/mail-training/review';
import type { ExtractedEntity } from '@/lib/mail/extraction';

export const dynamic = 'force-dynamic';
export default function TrainingDemoPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const plaintext = 'Hallo,\n\nich möchte jetzt doch Palisander statt Ebenholz für das Griffbrett.\nWas würden 22 Edelstahlbünde kosten? Bitte noch nicht ändern.\n\nLieferadresse: Anna Beispiel, Musterstraße 12, 12345 Musterstadt.\n\nViele Grüße\nAnna Beispiel';
  const entities: ExtractedEntity[] = ['Anna Beispiel', 'Musterstraße 12', '12345 Musterstadt'].flatMap((text, i) => {
    const items: ExtractedEntity[] = []; let from = 0;
    while (true) { const start = plaintext.indexOf(text, from); if (start < 0) break;
      items.push({ type: i === 0 ? 'name' : i === 1 ? 'address' : 'postalCode', text, start, end: start + text.length, pii: true, confidence: 1, source: 'regex' }); from = start + text.length;
    }
    return items;
  });
  return <MailTrainingDemo initial={{ mailId: 'demo-mail', orderId: 'DEMO-001', plaintext, sourceHash: sourceHash(plaintext), revision: 0,
    annotations: initialAnnotations(plaintext, entities, 'GUITAR'), fields: orderFields('GUITAR'),
    currentValues: { fretboard_material: 'Ebenholz', neck_wood: 'Ahorn', frets: '21 Bünde' }, history: [], exampleCount: 0, modelEnabled: false }} />;
}

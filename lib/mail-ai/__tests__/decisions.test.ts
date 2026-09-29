import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), mail: vi.fn(), update: vi.fn(), specs: vi.fn(), newSpec: vi.fn(), order: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => {
  const client = { mail: { findUnique: mocks.mail }, mailTrainingReview: { updateMany: mocks.update },
    orderSpecKV: { updateMany: mocks.specs, create: mocks.newSpec }, order: { update: mocks.order } };
  return { prisma: { ...client, $transaction: (fn: (client: unknown) => unknown) => fn(client) } };
});
import { POST } from '@/app/api/orders/[id]/mail-suggestions/route';
import { snippetAround } from '@/lib/mail-ai/decisions';
import { sourceHash } from '@/lib/mail-training/review';
import type { Annotation } from '@/lib/mail-training/contracts';

const text = 'Hallo,\nbitte jetzt doch Palisander statt Ebenholz. Was kosten 22 Edelstahlbünde?\n\n> Alt: Ebenholz';
const at = (value: string) => ({ start: text.indexOf(value), end: text.indexOf(value) + value.length, text: value, value });
const suggestion = (id: string, value: string, field: string, intent: Annotation['intent']): Annotation => ({ id, ...at(value), kind: 'order', field,
  intent, masked: false, dismissed: false, origin: 'model', reviewed: false });
const annotations = [suggestion('p', 'Palisander', 'fretboard_material', 'change'), suggestion('b', '22 Edelstahlbünde', 'frets', 'question')];
const mail = () => ({ text, html: null, orderId: 'o1', isDeleted: false,
  order: { type: 'GUITAR', deletedAt: null, specs: [{ key: 'fretboard_material', value: 'Ebenholz' }] },
  trainingReview: { sourceHash: sourceHash(text), orderId: 'o1', revision: 3, annotations, history: [] } });
const base = { mailId: 'm1', revision: 3, sourceHash: sourceHash(text) };
const params = { params: Promise.resolve({ id: 'o1' }) };
const req = (body: unknown) => new NextRequest('http://localhost/api/orders/o1/mail-suggestions', { method: 'POST', body: JSON.stringify(body) });
const written = () => mocks.update.mock.calls[0][0].data as { annotations: Annotation[]; history: Record<string, unknown>[] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'staff1', role: 'staff' } });
  mocks.mail.mockResolvedValue(mail()); mocks.update.mockResolvedValue({ count: 1 }); mocks.specs.mockResolvedValue({ count: 1 });
});

describe('Vorschlaege im Auftrag entscheiden', () => {
  it('Mitarbeitende uebernehmen eine Aenderung; Altwert und Lernbeispiel werden vermerkt', async () => {
    const res = await POST(req({ ...base, annotationId: 'p', action: 'accept', expectedValue: 'Ebenholz' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: true, oldValue: 'Ebenholz', newValue: 'Palisander' });
    expect(mocks.specs).toHaveBeenCalledWith({ where: { orderId: 'o1', key: 'fretboard_material', value: 'Ebenholz' }, data: { value: 'Palisander' } });
    const saved = written();
    expect(saved.annotations.find(a => a.id === 'p')).toMatchObject({ reviewed: true, reason: 'correct', dismissed: false });
    expect(saved.history[0]).toMatchObject({ action: 'apply', userId: 'staff1', oldValue: 'Ebenholz', newValue: 'Palisander' });
  });

  it('eine Frage wird nie in den Auftrag geschrieben, nur als erledigt vermerkt', async () => {
    expect((await POST(req({ ...base, annotationId: 'b', action: 'accept' }), params)).status).toBe(200);
    expect(mocks.specs).not.toHaveBeenCalled(); expect(mocks.newSpec).not.toHaveBeenCalled();
    expect(written().annotations.find(a => a.id === 'b')).toMatchObject({ reviewed: true, reason: 'correct' });
  });

  it('Korrektur von Feld und Absicht wird als solche gelernt und dann uebernommen', async () => {
    const res = await POST(req({ ...base, annotationId: 'b', action: 'accept', intent: 'confirmed', value: '22 Jumbo Stainless Steel', expectedValue: '' }), params);
    expect(res.status).toBe(200);
    expect(mocks.newSpec).toHaveBeenCalledWith({ data: { orderId: 'o1', key: 'frets', value: '22 Jumbo Stainless Steel' } });
    expect(written().annotations.find(a => a.id === 'b')).toMatchObject({ reason: 'value', intent: 'confirmed', text: '22 Edelstahlbünde' });
  });

  it('Verwerfen markiert den Vorschlag als falsch erkannt, ohne den Auftrag anzufassen', async () => {
    expect((await POST(req({ ...base, annotationId: 'p', action: 'reject' }), params)).status).toBe(200);
    expect(mocks.specs).not.toHaveBeenCalled();
    expect(written().annotations.find(a => a.id === 'p')).toMatchObject({ reviewed: true, dismissed: true, reason: 'wrong' });
  });

  it('lehnt veraltete Staende, fremde Auftraege und doppelte Entscheidungen ab', async () => {
    expect((await POST(req({ ...base, revision: 2, annotationId: 'p', action: 'accept', expectedValue: 'Ebenholz' }), params)).status).toBe(409);
    expect((await POST(req({ ...base, annotationId: 'p', action: 'accept', expectedValue: 'Ahorn' }), params)).status).toBe(409);
    mocks.mail.mockResolvedValue({ ...mail(), orderId: 'o2' });
    expect((await POST(req({ ...base, annotationId: 'p', action: 'accept', expectedValue: 'Ebenholz' }), params)).status).toBe(409);
    mocks.mail.mockResolvedValue({ ...mail(), trainingReview: { ...mail().trainingReview, annotations: [{ ...annotations[0], reviewed: true }] } });
    expect((await POST(req({ ...base, annotationId: 'p', action: 'accept', expectedValue: 'Ebenholz' }), params)).status).toBe(409);
    expect(mocks.specs).not.toHaveBeenCalled();
  });

  it('verlangt eine Anmeldung', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(req({ ...base, annotationId: 'p', action: 'reject' }), params)).status).toBe(401);
    expect(mocks.mail).not.toHaveBeenCalled();
  });
});

describe('Alle Wuensche uebernehmen', () => {
  it('zaehlt die Version derselben Mail innerhalb des Stapels mit', async () => {
    const both = [suggestion('p', 'Palisander', 'fretboard_material', 'change'), suggestion('b', '22 Edelstahlbünde', 'frets', 'confirmed')];
    const at = (revision: number, annotations: Annotation[]) => ({ ...mail(), trainingReview: { ...mail().trainingReview, revision, annotations } });
    mocks.mail.mockResolvedValueOnce(at(3, both)).mockResolvedValueOnce(at(4, [{ ...both[0], reviewed: true }, both[1]]));
    const res = await POST(req({ action: 'accept-all', items: [
      { mailId: 'm1', annotationId: 'p', revision: 3, sourceHash: sourceHash(text), expectedValue: 'Ebenholz' },
      { mailId: 'm1', annotationId: 'b', revision: 3, sourceHash: sourceHash(text), expectedValue: '' },
    ] }), params);
    expect(await res.json()).toMatchObject({ applied: 2, failed: 0 });
    expect(mocks.update.mock.calls.map(c => c[0].where.revision)).toEqual([3, 4]);
  });

  it('ein veralteter Vorschlag scheitert allein, die anderen werden trotzdem uebernommen', async () => {
    const res = await POST(req({ action: 'accept-all', items: [
      { mailId: 'm1', annotationId: 'p', revision: 3, sourceHash: sourceHash(text), expectedValue: 'Ahorn' },
    ] }), params);
    const data = await res.json();
    expect(data).toMatchObject({ applied: 0, failed: 1 });
    expect(data.results[0].error).toMatch(/inzwischen geändert/);
    expect(mocks.specs).not.toHaveBeenCalled();
  });
});

describe('Listenwerte beim Uebernehmen', () => {
  const t = 'Hallo,\nich hätte gern eine Strat, Korpus aus Esche, zweiteilig.';
  const s = (id: string, value: string, field: string): Annotation => ({ id, start: t.indexOf(value), end: t.indexOf(value) + value.length,
    text: value, value, kind: 'order', field, intent: 'confirmed', masked: false, dismissed: false, origin: 'model', reviewed: false });
  const b = { mailId: 'm1', revision: 1, sourceHash: sourceHash(t) };
  beforeEach(() => mocks.mail.mockResolvedValue({ text: t, html: null, orderId: 'o1', isDeleted: false,
    order: { type: 'GUITAR', deletedAt: null, specs: [] },
    trainingReview: { sourceHash: sourceHash(t), orderId: 'o1', revision: 1, history: [],
      annotations: [s('shape', 'Strat', 'body_shape'), s('wood', 'Esche, zweiteilig', 'body_material')] } }));

  it('traegt den Wert der Auswahlliste ein; der Mailwert bleibt Beleg', async () => {
    const res = await POST(req({ ...b, annotationId: 'shape', action: 'accept', expectedValue: '' }), params);
    expect(await res.json()).toMatchObject({ applied: true, newValue: 'Stratocaster' });
    expect(mocks.newSpec).toHaveBeenCalledWith({ data: { orderId: 'o1', key: 'body_shape', value: 'Stratocaster' } });
    expect(written().annotations.find(a => a.id === 'shape')).toMatchObject({ value: 'Strat', reason: 'correct' });
    expect(written().history[0]).toMatchObject({ newValue: 'Stratocaster', sourceValue: 'Strat' });
  });

  it('was die Liste nicht abdeckt, kommt in die Notizen des Bereichs', async () => {
    await POST(req({ ...b, annotationId: 'wood', action: 'accept', expectedValue: '' }), params);
    expect(mocks.newSpec).toHaveBeenCalledWith({ data: { orderId: 'o1', key: 'body_material', value: 'Esche' } });
    expect(mocks.newSpec).toHaveBeenCalledWith({ data: { orderId: 'o1', key: 'body_notes', value: 'Bodymaterial: Esche, zweiteilig' } });
  });

  it('einen im Banner geaenderten Wert wie getippt eintragen', async () => {
    await POST(req({ ...b, annotationId: 'shape', action: 'accept', value: 'Strat Custom', expectedValue: '' }), params);
    expect(mocks.newSpec).toHaveBeenCalledWith({ data: { orderId: 'o1', key: 'body_shape', value: 'Strat Custom' } });
  });
});

describe('snippetAround', () => {
  it('zeigt den Satz um die Stelle', () => {
    const s = snippetAround(text, text.indexOf('Palisander'), text.indexOf('Palisander') + 10);
    expect(`${s.before}[${s.match}]${s.after}`).toBe('bitte jetzt doch [Palisander] statt Ebenholz.');
  });
});

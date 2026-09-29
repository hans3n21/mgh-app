import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { mail: db } }));
import { freezeContext, loadContext } from '../context';

const row = (id: string, date: string, text: string, overrides = {}) => ({ id, date: new Date(date), text, html: null,
  senderId: null, fromEmail: 'kunde@example.invalid', accountId: 'acc1', customerId: 'c1', orderId: 'o1', threadId: 't1',
  messageId: `<${id}>`, inReplyTo: null, isDeleted: false, account: { email: 'mgh@example.invalid' }, order: { type: 'GUITAR' as const, deletedAt: null }, ...overrides });
const current = row('new', '2026-01-03', 'Was kostet die zweite Variante?', { inReplyTo: '<parent>' });
const parent = row('parent', '2026-01-02', 'Griffbrett: Ebenholz oder Palisander?', { senderId: 'staff1' });
describe('conversation context and evidence', () => {
  it('keeps staff context and excludes later, deleted, foreign and differently assigned mails', () => {
    const s = freezeContext(current, [parent, row('future', '2026-01-04', 'Jetzt Ebenholz'), row('foreign', '2026-01-01', 'Geheim', { accountId: 'acc2' }),
      row('deleted', '2026-01-01', 'Geheim', { isDeleted: true }), row('other-order', '2026-01-01', 'Ahorn', { orderId: 'o2' })]);
    expect(s.messages.map(m => m.id)).toEqual(['parent', 'new']); expect(s.messages[0].role).toBe('staff');
    expect(JSON.stringify(s)).not.toContain('specs');
  });
  it('scopes the database query by account, time and assignment', async () => {
    db.findUnique.mockResolvedValue(current); db.findMany.mockResolvedValue([parent]);
    const c = await loadContext('new');
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accountId: 'acc1', isDeleted: false, date: { lt: current.date } }) }));
    expect(c.groupKeys).toHaveLength(4); expect(c.groupKeys.every(k => /^[a-f0-9]{64}$/.test(k))).toBe(true);
  });
  it('retains a direct reply parent when reducing a long conversation', () => {
    const older = row('parent', '2025-01-01', parent.text);
    const many = Array.from({ length: 20 }, (_, n) => row(`m${n}`, `2025-12-${String(n + 1).padStart(2, '0')}`, 'Kurze Mail'));
    const s = freezeContext(current, [older, ...many]);
    expect(s.messages).toHaveLength(12); expect(s.messages.some(m => m.id === 'parent')).toBe(true); expect(s.omitted).toBe(10);
  });
});

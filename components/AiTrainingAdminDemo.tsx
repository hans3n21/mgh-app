'use client';
import { useMemo } from 'react';
import AiTrainingAdmin, { type TrainingTransport } from './AiTrainingAdmin';
import type { Dashboard, Finding, ModelConfig } from '@/lib/ai-training/contracts';

export default function AiTrainingAdminDemo() {
  const transport = useMemo<TrainingTransport>(() => {
    const expected: Finding = { kind: 'order', field: 'fretboard_material', value: 'Palisander', intent: 'question', quote: 'Was kostet die zweite Variante?', evidence: [{ mailId: 'demo-parent', quote: 'Ebenholz oder Palisander' }] };
    const data: Dashboard = { config: { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: '', useExamples: false, localOnlyConfirmed: false }, cases: [
      { id: 'demo-case', mailId: 'demo-mail', title: 'Preisfrage zur zweiten Griffbrettvariante', partition: 'test', fingerprint: 'demo-hash', createdAt: '2026-09-28T09:00:00Z',
        expected: [expected], results: [], snapshot: { currentId: 'demo-mail', orderType: 'GUITAR', fields: [{ key: 'fretboard_material', label: 'Griffbrettmaterial' }], omitted: 0,
          messages: [{ id: 'demo-parent', date: '2026-09-27T09:00:00Z', role: 'staff', text: 'Für das Griffbrett bieten wir Ebenholz oder Palisander an.' },
            { id: 'demo-mail', date: '2026-09-28T09:00:00Z', role: 'customer', text: 'Was kostet die zweite Variante?' }] } },
    ] };
    return async body => {
      if (!body) return structuredClone(data);
      if (body.action === 'models') return { models: [{ name: 'qwen3.5:4b', size: 3000000000 }, { name: 'qwen3.5:9b', size: 6000000000 }] };
      if (body.action === 'config') { data.config = body.config as ModelConfig; return { ok: true }; }
      if (body.action === 'delete') { data.cases = data.cases.filter(c => c.id !== body.caseId); return { ok: true }; }
      if (body.action === 'compare') {
        const c = data.cases.find(c => c.id === body.caseId)!; const success = String(body.model).startsWith('qwen');
        c.results.unshift({ id: crypto.randomUUID(), model: String(body.model), digest: 'demo-only', protocol: 'demo-simulation', durationMs: 1200,
          error: null, createdAt: new Date().toISOString(), findings: success ? [expected] : [], examples: [],
          metrics: { expected: 1, predicted: success ? 1 : 0, correct: success ? 1 : 0, missed: success ? 0 : 1, extra: 0, unsafeConfirmations: 0, privacyMissed: 0, exact: success } });
        return { ok: true };
      }
      return { ok: true };
    };
  }, []);
  return <main className="min-h-screen bg-slate-950"><AiTrainingAdmin transport={transport} demo /></main>;
}

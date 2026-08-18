export const WORKFLOW_STATUSES = [
  'draft',
  'awaiting_payment',
  'intake',
  'in_progress',
  'waiting_parts',
  'awaiting_customer',
  'setup',
  'complete',
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: 'Entwurf',
  awaiting_payment: 'Wartet auf Zahlung',
  intake: 'Eingang',
  in_progress: 'In Arbeit',
  waiting_parts: 'Wartet auf Teile',
  awaiting_customer: 'Wartet auf Kunde',
  setup: 'Montage',
  complete: 'Fertig',
};

export const WORKFLOW_STATUS_CLASS: Record<WorkflowStatus, string> = {
  draft: 'bg-slate-900/40 text-slate-400 border-slate-600 border-dashed',
  awaiting_payment: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50',
  intake: 'bg-slate-800 text-slate-300 border-slate-700',
  in_progress: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
  waiting_parts: 'bg-amber-900/30 text-amber-300 border-amber-700/50',
  awaiting_customer: 'bg-violet-900/30 text-violet-300 border-violet-700/50',
  setup: 'bg-orange-900/30 text-orange-300 border-orange-700/50',
  complete: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
};

export function normalizeWorkflowStatus(status: string): WorkflowStatus {
  if (status === 'draft') return 'draft';
  if (status === 'awaiting_payment') return 'awaiting_payment';
  if (status === 'intake') return 'intake';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'waiting_parts') return 'waiting_parts';
  if (status === 'awaiting_customer') return 'awaiting_customer';
  if (status === 'setup') return 'setup';
  if (status === 'complete') return 'complete';

  // Nicht mehr aktiv genutzte Alt-Status auf die nächstliegende Stufe mappen
  if (status === 'quote' || status === 'design_review') return 'intake';
  if (status === 'finishing') return 'setup';

  return 'intake';
}

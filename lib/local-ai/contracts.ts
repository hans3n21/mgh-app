export const DECISIONS = ['confirmed', 'tentative', 'rejected', 'unclear'] as const;
export type Decision = typeof DECISIONS[number];
export const DECISION_LABELS: Record<Decision, string> = {
  confirmed: 'Verbindlicher Wunsch', tentative: 'Offen / Rückfrage',
  rejected: 'Abgelehnt', unclear: 'Nicht eindeutig zugeordnet',
};

export type Candidate = { id: string; field: string; label: string; value: string; evidence: string };
export type Finding = Candidate & { decision: Decision; probability: number; currentValue?: string };
export type Analysis = {
  findings: Finding[]; model: string; revision: string; elapsedMs: number;
  hadQuotes: boolean; orderId?: string; mailId?: string;
};

export const DEMO_MAIL = 'Bitte den Hals aus Ahorn und das Griffbrett aus Ebenholz. Ich möchte 22 Edelstahlbünde. Wäre ein Radius von 12 Zoll möglich? Das ist noch nicht entschieden.';

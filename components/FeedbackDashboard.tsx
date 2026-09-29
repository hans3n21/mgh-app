'use client';
import React, { useEffect, useState } from 'react';

// Letzte Bedienschritte, wie PointOut sie mitsendet (Klicks, JS-Fehler, fehlgeschlagene Anfragen).
interface FeedbackStep {
  seconds_before: number;
  kind: 'click' | 'error' | 'request';
  label: string;
  area?: string;
  count?: number;
}

interface Feedback {
  id: string;
  message: string;
  page: string;
  url: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string | null;
  createdAt: string;
  category?: string | null;
  screenshotPath?: string | null;
  device?: { device_type?: string | null; viewport?: { width: number; height: number } | null } | null;
  metadata?: {
    steps?: FeedbackStep[];
    app_context?: Record<string, string | number | boolean | null>;
  } | null;
  userAgent?: string | null;
  createdByName?: string | null;
}

type StatusFilter = 'open' | 'resolved' | 'all';
type Category = 'bug' | 'idea' | 'design' | 'general';

const CATEGORIES: Record<Category, { label: string; dot: string }> = {
  bug: { label: 'Fehler', dot: 'bg-red-400' },
  idea: { label: 'Idee', dot: 'bg-sky-400' },
  design: { label: 'Design', dot: 'bg-violet-400' },
  general: { label: 'Allgemein', dot: 'bg-slate-500' },
};

const DEVICES: Record<string, string> = { mobile: 'Handy', tablet: 'Tablet', desktop: 'Desktop' };

const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100';

function categoryOf(item: Feedback): Category {
  return item.category && item.category in CATEGORIES ? (item.category as Category) : 'general';
}

// Alte Eintraege haben die volle Adresse mit IP des Rechners; relativ oeffnet sie auf jedem Rechner.
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Im LAN laeuft die App ueber http://192.168…, dort gibt es navigator.clipboard nicht.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      // Eine unbeantwortete Berechtigungsabfrage darf den Knopf nicht haengen lassen.
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
      return true;
    }
  } catch {
    // Rueckfall unten
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.className = 'fixed left-0 top-0 opacity-0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export default function FeedbackDashboard() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [status, setStatus] = useState<StatusFilter>('open');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Screenshots, die nicht laden (Datei fehlt, NAS weg): Platzhalter statt kaputtem Bild.
  const [brokenShots, setBrokenShots] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const loadFeedback = async () => {
    try {
      // Immer alles laden, damit die Zaehler in allen Reitern stimmen.
      const response = await fetch('/api/feedback');
      if (response.ok) setFeedback(await response.json());
    } catch (error) {
      console.error('Fehler beim Laden des Feedbacks:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleResolved = async (id: string, resolved: boolean) => {
    setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, resolved } : f)));
    try {
      const response = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved }),
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      loadFeedback();
    }
  };

  const copyForClaude = async (id: string) => {
    const command = `/feedback ${id}`;
    if (!(await copyText(command))) {
      // Zwischenablage gesperrt: Befehl zum Selbstkopieren anzeigen.
      window.prompt('Befehl für Claude Code:', command);
      return;
    }
    setCopied(id);
    setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
  };

  const openCount = feedback.filter((f) => !f.resolved).length;
  const byStatus = feedback.filter((f) => status === 'all' || (status === 'open' ? !f.resolved : f.resolved));
  const categoryCounts = byStatus.reduce<Partial<Record<Category, number>>>((acc, f) => {
    const key = categoryOf(f);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const visible = byStatus.filter((f) => category === 'all' || categoryOf(f) === category);

  if (loading) {
    return <div className="py-6 text-center text-sm text-slate-400">Lade Feedback…</div>;
  }

  return (
    <div>
      {/* Kopf: Titel, Zaehler, Status-Umschalter */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold text-slate-100">Feedback</h2>
        <span className="text-xs text-slate-500">
          {openCount} offen · {feedback.length - openCount} erledigt
        </span>
        <div className="ml-auto inline-flex rounded-lg border border-slate-800 bg-slate-950/40 p-0.5 text-xs">
          {([
            ['open', 'Offen'],
            ['resolved', 'Erledigt'],
            ['all', 'Alle'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setStatus(key);
                setCategory('all');
              }}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                status === key ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Kategorien, nur die vorkommenden */}
      {Object.keys(categoryCounts).length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['all', ...(Object.keys(CATEGORIES) as Category[]).filter((c) => categoryCounts[c])] as const).map((key) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                category === key
                  ? 'border-slate-600 bg-slate-800 text-slate-100'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {key !== 'all' && <span className={`h-1.5 w-1.5 rounded-full ${CATEGORIES[key].dot}`} />}
              {key === 'all' ? 'Alle' : CATEGORIES[key].label}
              <span className="text-slate-500">{key === 'all' ? byStatus.length : categoryCounts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          {status === 'open' ? 'Kein offenes Feedback' : status === 'resolved' ? 'Kein erledigtes Feedback' : 'Kein Feedback vorhanden'}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-800/70 border-t border-slate-800/70">
          {visible.map((item) => {
            const isOpen = expanded === item.id;
            const cat = CATEGORIES[categoryOf(item)];
            const steps = item.metadata?.steps ?? [];
            const problems = steps.filter((s) => s.kind !== 'click').length;
            const device = item.device?.device_type ? DEVICES[item.device.device_type] : null;
            const shotBroken = brokenShots.has(item.id);
            const screenshotUrl = item.screenshotPath && !shotBroken ? `/api/feedback/${item.id}/screenshot` : null;
            const markBroken = () => setBrokenShots((prev) => new Set(prev).add(item.id));

            return (
              <li key={item.id} className={item.resolved ? 'opacity-60' : undefined}>
                <div className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-800/30">
                  <button
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    {screenshotUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={screenshotUrl}
                        alt=""
                        loading="lazy"
                        onError={markBroken}
                        className="h-10 w-16 shrink-0 rounded border border-slate-700 bg-slate-950 object-cover object-top"
                      />
                    ) : (
                      <span className="hidden h-10 w-16 shrink-0 rounded border border-dashed border-slate-800 sm:block" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm text-slate-200 ${isOpen ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                        {item.message}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
                          {cat.label}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.page}</span>
                        {item.createdByName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-400">{item.createdByName}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <time dateTime={item.timestamp}>{formatDate(item.timestamp)}</time>
                        {device && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{device}</span>
                          </>
                        )}
                        {problems > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-red-400">{problems === 1 ? '1 Fehler' : `${problems} Fehler`} im Ablauf</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center">
                    <button
                      onClick={() => copyForClaude(item.id)}
                      className={ICON_BUTTON}
                      title="Befehl für Claude kopieren (/feedback …)"
                      aria-label="Befehl für Claude kopieren"
                    >
                      {copied === item.id ? (
                        <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <a
                      href={pathOf(item.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={ICON_BUTTON}
                      title="Seite öffnen"
                      aria-label="Seite öffnen"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    <button
                      onClick={() => toggleResolved(item.id, !item.resolved)}
                      className={`${ICON_BUTTON} ${item.resolved ? 'text-emerald-400' : ''}`}
                      title={item.resolved ? 'Wieder öffnen' : 'Als erledigt markieren'}
                      aria-label={item.resolved ? 'Wieder öffnen' : 'Als erledigt markieren'}
                      aria-pressed={item.resolved}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" strokeWidth={2} />
                        {item.resolved && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12.5l2.5 2.5L16 9.5" />}
                      </svg>
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-3 pb-4 text-xs text-slate-400 sm:pl-[4.75rem]">
                    {screenshotUrl && (
                      <button onClick={() => setLightbox(screenshotUrl)} className="block" title="Screenshot vergrößern">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshotUrl}
                          alt="Screenshot zum Feedback"
                          onError={markBroken}
                          className="max-h-72 max-w-full rounded-lg border border-slate-700 hover:border-slate-500"
                        />
                      </button>
                    )}

                    {shotBroken && <div className="text-amber-300/80">Screenshot konnte nicht geladen werden.</div>}

                    {steps.length > 0 && (
                      <div>
                        <div className="mb-1 text-slate-500">Letzte Schritte</div>
                        <ol className="space-y-0.5 border-l border-slate-800 pl-3">
                          {steps.map((step, index) => (
                            <li key={index} className={step.kind === 'click' ? '' : 'text-red-300'}>
                              <span className="tabular-nums text-slate-500">−{step.seconds_before}s </span>
                              {step.kind === 'error' ? 'Fehler: ' : step.kind === 'request' ? 'Anfrage: ' : ''}
                              {step.label}
                              {step.area && <span className="text-slate-500"> · {step.area}</span>}
                              {step.count && <span className="text-slate-500"> ×{step.count}</span>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                      <span className="font-mono">{pathOf(item.url)}</span>
                      {item.userAgent && <span>{item.userAgent}</span>}
                      {item.device?.viewport && (
                        <span>
                          {item.device.viewport.width}×{item.device.viewport.height}
                        </span>
                      )}
                      {item.resolved && item.resolvedAt && <span>erledigt {formatDate(item.resolvedAt)}</span>}
                      <span className="font-mono">{item.id}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Screenshot zum Feedback" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}

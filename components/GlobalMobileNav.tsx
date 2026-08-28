'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NAV_ITEMS } from '@/lib/nav-items';

export default function GlobalMobileNav() {
  // Mobile Navigation Component
  const pathname = usePathname();

  // Die Leiste ist mit neun Punkten deutlich breiter als der Bildschirm (846px
  // gegen 375px), und die vier sichtbaren enden zufaellig genau am Rand — es gibt
  // also kein angeschnittenes Symbol, das andeutet, dass es weitergeht. Nutzer
  // haben die hinteren Punkte deshalb fuer nicht vorhanden gehalten.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [moreRight, setMoreRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [pathname]);

  // Nicht anzeigen auf Auftragsdetails-Seiten (die haben ihre eigene Navigation).
  // Statische Unterseiten wie /app/orders/trash sind KEINE Detailseiten und
  // brauchen die Leiste — ohne sie waren sie am Handy eine Sackgasse.
  const ORDERS_SUBPAGES = ['trash'];
  if (pathname?.startsWith('/app/orders/') && pathname !== '/app/orders') {
    const segment = pathname.slice('/app/orders/'.length).split('/')[0];
    if (!ORDERS_SUBPAGES.includes(segment)) {
      return null;
    }
  }

  return (
    <>
      {/* Mobile Navigation unten */}
      <div
        className="fixed left-0 right-0 bg-slate-900 border-t border-slate-800 lg:hidden z-50"
        style={{
          bottom: '0px',
          margin: '0px',
          padding: '12px 0 16px 0'
        }}
      >
        <div className="relative">
        {/* Verlauf plus Pfeil: der Verlauf allein reicht nicht, weil am Rand kein
            angeschnittenes Symbol steht, das er ueberblenden koennte.
            pointer-events-none, damit die Andeutung keine Tipps abfaengt. */}
        {moreRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-slate-900 via-slate-900/90 to-transparent pr-1.5 text-slate-400">
            <span aria-hidden="true" className="text-lg leading-none">›</span>
          </div>
        )}
        {/* scrollbar-hide statt no-scrollbar: die Klasse hiess nie so,
            der Balken war deshalb immer sichtbar (globals.css). */}
        <div ref={scrollerRef} className="flex overflow-x-auto px-4 gap-2 scrollbar-hide">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  // Im Posteingang wirkt der eigene Punkt als Zurueck-Knopf:
                  // eine offene Mail wird geschlossen statt die Seite neu zu
                  // laden. Die "‹ Posteingang"-Zeile oben entfaellt dafuer.
                  if (item.href === '/app/posteingang' && pathname === '/app/posteingang') {
                    e.preventDefault();
                    window.dispatchEvent(new Event('mgh:inbox-back'));
                  }
                }}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[80px] flex-shrink-0 ${isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
              >
                <div className="text-lg">{item.icon}</div>
                <span className="text-xs font-medium whitespace-nowrap">{item.shortLabel ?? item.label}</span>
              </Link>
            );
          })}
        </div>
        </div>
      </div>

      {/* Padding unten für mobile Navigation */}
      <div className="h-24 lg:hidden"></div>
    </>
  );
}

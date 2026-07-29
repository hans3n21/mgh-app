'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/app',
    icon: '🏠'
  },
  {
    id: 'inbox',
    label: 'Posteingang',
    href: '/app/posteingang',
    icon: '📬'
  },
  {
    id: 'customers',
    label: 'Kunden',
    href: '/app/customers',
    icon: '👥'
  },
  {
    id: 'label-generator',
    label: 'Labels',
    href: '/app/label-generator',
    icon: '🏷️'
  },
  {
    id: 'procurement',
    label: 'Beschaffung',
    href: '/app/procurement',
    icon: '📦'
  },
  {
    id: 'prices',
    label: 'Preise',
    href: '/app/prices',
    icon: '💰'
  },
  {
    id: 'knowledge',
    label: 'Wissen',
    href: '/app/wissen',
    icon: 'W'
  },
  {
    id: 'settings',
    label: 'Einstellungen',
    href: '/app/settings',
    icon: '⚙️'
  },
];

export default function GlobalMobileNav() {
  // Mobile Navigation Component
  const pathname = usePathname();

  // Nicht anzeigen auf Auftragsdetails-Seiten (die haben ihre eigene Navigation)
  if (pathname?.startsWith('/app/orders/') && pathname !== '/app/orders') {
    return null;
  }

  return (
    <>
      {/* Mobile Navigation unten */}
      <div
        className="fixed left-0 right-0 bg-slate-900 border-t border-slate-800 md:hidden z-50"
        style={{
          bottom: '0px',
          margin: '0px',
          padding: '12px 0 16px 0'
        }}
      >
        {/* scrollbar-hide statt no-scrollbar: die Klasse hiess nie so,
            der Balken war deshalb immer sichtbar (globals.css). */}
        <div className="flex overflow-x-auto px-4 gap-2 scrollbar-hide">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[80px] flex-shrink-0 ${isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
              >
                <div className="text-lg">{item.icon}</div>
                <span className="text-xs font-medium whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Padding unten für mobile Navigation */}
      <div className="h-24 md:hidden"></div>
    </>
  );
}

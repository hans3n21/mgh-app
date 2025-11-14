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
    id: 'settings', 
    label: 'Einstellungen', 
    href: '/app/settings', 
    icon: '⚙️'
  },
];

export default function GlobalMobileNav() {
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
          padding: '12px 8px 16px 8px'
        }}
      >
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="text-lg">{item.icon}</div>
                <span className="text-xs font-medium">{item.label}</span>
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

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import CreateOrderButton from './CreateOrderButton';

interface NavigationProps {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  customers?: Array<{ id: string; name: string; email?: string; phone?: string }>;
  users?: Array<{ id: string; name: string }>;
}

export default function Navigation({ user, customers = [], users = [] }: NavigationProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/app', label: 'Dashboard' },
    { href: '/app/orders', label: 'Aufträge' },
    { href: '/app/customers', label: 'Kunden' },
    { href: '/app/prices', label: 'Preise' },
    { href: '/app/procurement', label: 'Einkauf' },
    { href: '/app/settings', label: 'Einstellungen' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-950/70 backdrop-blur border-b border-slate-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
        <Link href="/app" className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700">
          <span className="font-black">M</span>
        </Link>
        
        <nav className="hidden sm:flex items-center gap-1 text-sm text-slate-300">
          {navItems.map((item, index) => (
            <div key={item.href} className="flex items-center gap-1">
              {index > 0 && <span>·</span>}
              <Link
                href={item.href}
                className={`hover:text-white ${
                  pathname === item.href ? 'text-white font-semibold' : ''
                }`}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <input
            placeholder="Suchen (Auftrag, Kunde, Typ)"
            className="hidden md:block rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
          />
          
          <div className="flex items-center gap-2">
            <CreateOrderButton customers={customers} users={users} />
            <span className="text-sm text-slate-400">{user.name}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              Abmelden
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

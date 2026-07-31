'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import CreateOrderButton from './CreateOrderButton';
import NotificationBell from './NotificationBell';
import { NAV_ITEMS } from '@/lib/nav-items';

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
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Fetch unread mail count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const res = await fetch('/api/mails/unread-count');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();
    
    // Refresh unread count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    
    // Listen for custom events to update unread count immediately
    const handleUnreadUpdate = () => {
      fetchUnreadCount();
    };
    
    window.addEventListener('mail-assigned', handleUnreadUpdate);
    window.addEventListener('mail-synced', handleUnreadUpdate);
    window.addEventListener('mail-read', handleUnreadUpdate);
    window.addEventListener('mail-unread', handleUnreadUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('mail-assigned', handleUnreadUpdate);
      window.removeEventListener('mail-synced', handleUnreadUpdate);
      window.removeEventListener('mail-read', handleUnreadUpdate);
      window.removeEventListener('mail-unread', handleUnreadUpdate);
    };
  }, []);

  // Reihenfolge und Beschriftungen kommen aus lib/nav-items.ts, damit obere und
  // untere Leiste nicht wieder auseinanderlaufen. Das Badge haengt nur hier dran.
  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    badge: item.href === '/app/posteingang' && unreadCount > 0 ? unreadCount : undefined,
  }));

  return (
    <header className="sticky top-0 z-40 bg-slate-950/70 backdrop-blur border-b border-slate-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
        <Link href="/app" className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700">
          <span className="font-black">M</span>
        </Link>
        
        {/* Erst ab lg: darunter ist die neunteilige Leiste breiter als die Kopfzeile
            und draengt "+ Auftrag" und "Abmelden" aus dem Bild. Unterhalb uebernimmt
            GlobalMobileNav (ebenfalls lg), damit es keine Zone mit beiden gibt. */}
        <nav className="hidden lg:flex items-center gap-1 text-sm text-slate-300">
          {navItems.map((item, index) => (
            <div key={item.href} className="flex items-center gap-1">
              {index > 0 && <span>·</span>}
              <Link
                href={item.href}
                className={`hover:text-white relative ${
                  pathname === item.href ? 'text-white font-semibold' : ''
                }`}
              >
                {item.label}
                {item.badge && (
                  <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            <NotificationBell />
            <CreateOrderButton customers={customers} users={users} />
            <span className="hidden text-sm text-slate-400 lg:inline">{user.name}</span>
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

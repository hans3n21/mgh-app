'use client';

import React from 'react';

type Props = {
  phone: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
};

type PublicTelephonyConfig = {
  enabled: boolean;
  provider: string;
};

function normalizePhone(input: string): string {
  return (input || '').replace(/[^\d+*#]/g, '');
}

export default function PhoneLink({ phone, className, title, children }: Props) {
  const [telephony, setTelephony] = React.useState<PublicTelephonyConfig>({ enabled: false, provider: 'tel' });
  const [calling, setCalling] = React.useState(false);
  const normalized = React.useMemo(() => normalizePhone(phone), [phone]);
  const telHref = React.useMemo(() => `tel:${normalized || phone}`, [normalized, phone]);

  React.useEffect(() => {
    let active = true;
    fetch('/api/settings/telephony/public')
      .then((r) => (r.ok ? r.json() : { enabled: false, provider: 'tel' }))
      .then((data) => {
        if (!active) return;
        setTelephony({
          enabled: !!data?.enabled,
          provider: String(data?.provider || 'tel'),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <a
      href={telHref}
      className={className}
      title={title || `Anrufen: ${phone}`}
      aria-busy={calling}
      onClick={async (e) => {
        if (!telephony.enabled || !normalized || calling) return;
        e.preventDefault();
        setCalling(true);
        try {
          const res = await fetch('/api/telephony/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: normalized }),
          });
          if (!res.ok) {
            // Fallback to native dial if FritzBox call failed
            window.location.href = telHref;
          }
        } catch {
          window.location.href = telHref;
        } finally {
          setCalling(false);
        }
      }}
    >
      {children}
    </a>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    // Check if iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Check if not standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    // Check if already dismissed
    const isDismissed = localStorage.getItem('ios-install-hint-dismissed');

    if (isIOS && !isStandalone && !isDismissed) {
      setShowInstallHint(true);
    }
  }, []);

  const dismissHint = () => {
    setShowInstallHint(false);
    localStorage.setItem('ios-install-hint-dismissed', 'true');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Ungültige Anmeldedaten');
      } else {
        router.push('/app');
      }
    } catch {
      setError('Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-slate-800 mb-4">
              <span className="font-black text-xl">M</span>
            </div>
            <h1 className="text-2xl font-bold">MGH App</h1>
            <p className="text-slate-400 text-sm">Anmeldung erforderlich</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-600"
                placeholder="admin@mgh.local"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-600"
                placeholder="mgh123"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/20 border border-red-800 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 font-semibold"
            >
              {loading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>

          <div className="mt-6 text-xs text-slate-500 text-center">
            <div>Demo-Zugänge:</div>
            <div>admin@mgh.local / mgh123</div>
            <div>johannes@mgh.local / staff123</div>
          </div>
        </div>
      </div>

      {/* iOS Install Hint */}
      {showInstallHint && (
        <div className="fixed bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-4 rounded-xl shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500">
          <div className="flex items-start gap-3">
            <div className="bg-slate-800 p-2 rounded-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-sky-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-slate-200 mb-1">App installieren</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zum Startbildschirm hinzufügen: Tippe auf <span className="inline-block mx-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg></span> und dann auf "Zum Home-Bildschirm".
              </p>
            </div>
            <button
              onClick={dismissHint}
              className="text-slate-400 hover:text-slate-200 p-1"
              aria-label="Schließen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

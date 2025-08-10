'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
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
    </div>
  );
}

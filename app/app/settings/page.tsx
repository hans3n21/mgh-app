import UserManagement from '@/components/UserManagement';

export default function SettingsPage() {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <h2 className="text-lg font-semibold">Einstellungen</h2>
      
      <UserManagement />
      
      <div className="rounded-xl border border-slate-800 p-3">
        <div className="font-semibold">Allgemein</div>
        <div className="text-sm text-slate-400 mt-2">Platzhalter – weitere Einstellungen folgen.</div>
      </div>
      <div className="rounded-xl border border-slate-800 p-3">
        <div className="font-semibold">System</div>
        <ul className="text-xs text-slate-400 list-disc ml-5 mt-2">
          <li>Node & Next.js laufen – prüfen Sie die Konsole für Details.</li>
          <li>Prisma SQLite: file:./dev.db</li>
        </ul>
      </div>
    </section>
  );
}

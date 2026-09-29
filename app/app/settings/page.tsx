import UserManagement from '@/components/UserManagement';
import BackupManagement from '@/components/BackupManagement';
import MailAccountManagement from '@/components/MailAccountManagement';
import ReplyTemplateManagement from '@/components/ReplyTemplateManagement';
import SpeechSettings from '@/components/SpeechSettings';
import UpdateTemplateSettings from '@/components/UpdateTemplateSettings';
import AiSettings from '@/components/AiSettings';
import MailAiSettings from '@/components/MailAiSettings';
import TelephonySettings from '@/components/TelephonySettings';
import DhlSettings from '@/components/DhlSettings';
import DatevSettings from '@/components/DatevSettings';
import { PAGE_PANEL } from '@/lib/ui-classes';
import Link from 'next/link';
import { auth } from '@/lib/auth';

export default async function SettingsPage() {
  const session = await auth();
  return (
    <section className={`${PAGE_PANEL} space-y-3`}>
      <h2 className="text-lg font-semibold">Einstellungen</h2>
      {['admin', 'admin_no_feedback'].includes(session?.user?.role || '') && <Link href="/app/ki-training" className="block rounded-lg border border-sky-700 bg-sky-950/40 p-4 text-sm text-sky-200">KI-Training → Prüffälle, lokale Modelle und Modellvergleich</Link>}
      
      <UserManagement />
      
      <MailAccountManagement />
      
      <ReplyTemplateManagement />

      <UpdateTemplateSettings />

      <SpeechSettings />

      <AiSettings />

      <MailAiSettings />

      <TelephonySettings />

      <DhlSettings />

      <DatevSettings />

      <BackupManagement />
    </section>
  );
}

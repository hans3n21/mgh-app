import UserManagement from '@/components/UserManagement';
import BackupManagement from '@/components/BackupManagement';
import MailAccountManagement from '@/components/MailAccountManagement';
import ReplyTemplateManagement from '@/components/ReplyTemplateManagement';
import SpeechSettings from '@/components/SpeechSettings';
import UpdateTemplateSettings from '@/components/UpdateTemplateSettings';
import AiSettings from '@/components/AiSettings';
import TelephonySettings from '@/components/TelephonySettings';
import DhlSettings from '@/components/DhlSettings';
import DatevSettings from '@/components/DatevSettings';
import { PAGE_PANEL } from '@/lib/ui-classes';

export default function SettingsPage() {
  return (
    <section className={`${PAGE_PANEL} space-y-3`}>
      <h2 className="text-lg font-semibold">Einstellungen</h2>
      
      <UserManagement />
      
      <MailAccountManagement />
      
      <ReplyTemplateManagement />

      <UpdateTemplateSettings />

      <SpeechSettings />

      <AiSettings />

      <TelephonySettings />

      <DhlSettings />

      <DatevSettings />

      <BackupManagement />
    </section>
  );
}

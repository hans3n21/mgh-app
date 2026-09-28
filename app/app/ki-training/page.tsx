import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import AiTrainingAdmin from '@/components/AiTrainingAdmin';

export default async function TrainingPage() {
  const session = await auth();
  if (!session?.user || !['admin', 'admin_no_feedback'].includes(session.user.role)) redirect('/app');
  return <AiTrainingAdmin />;
}

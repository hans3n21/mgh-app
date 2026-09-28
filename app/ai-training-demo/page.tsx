import { notFound } from 'next/navigation';
import AiTrainingAdminDemo from '@/components/AiTrainingAdminDemo';
export const dynamic = 'force-dynamic';
export default function DemoPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <AiTrainingAdminDemo />;
}

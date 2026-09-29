'use client';
import '@hans3n21/pointout/style.css';
import { PointOutWidget } from '@hans3n21/pointout';
import { useSession } from 'next-auth/react';
import { POINTOUT_PROJECT_ID, POINTOUT_PROJECT_NAME } from '@/lib/pointout-config';

// Feedback mit Screenshot, Markierungen und Spracheingabe (PointOut,
// github.com/hans3n21/pointout). Der Knopf sitzt unten rechts, am Handy
// ueber der Navigationsleiste. Der Rahmen gehoert zum Widget und bleibt
// deshalb wie der Knopf selbst aus dem Screenshot heraus.
export default function FeedbackWidget() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? null;

  return (
    <div
      data-pointout-root
      data-feedback-screenshot-ignore
      className="fixed right-4 bottom-24 z-[60] rounded-xl bg-slate-900/90 shadow-lg shadow-black/40 backdrop-blur lg:bottom-5"
    >
      <PointOutWidget
        projectId={POINTOUT_PROJECT_ID}
        projectName={POINTOUT_PROJECT_NAME}
        triggerVariant="icon"
        // Live-Mitschrift liefe ueber OpenAI; Aufnahmen gehen an den lokalen Whisper.
        liveTranscribeUrl={null}
        context={() => ({ rolle: role })}
      />
    </div>
  );
}

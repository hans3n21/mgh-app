import InboxPage from '@/components/inbox/InboxPage';

export default function Page() {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen h-[calc(100vh-120px)] px-4 sm:px-6 lg:px-8 overflow-hidden">
      <InboxPage />
    </div>
  );
}



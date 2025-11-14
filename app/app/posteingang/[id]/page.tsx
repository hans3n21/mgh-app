import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import ReplyComposer from '../components/ReplyComposer';
import AttachmentsPanel from '../components/AttachmentsPanel';
import OrderChooseAndEdit from '../components/OrderChooseAndEdit';


export default async function MailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Session und Mail-Daten parallel laden
  const [session, mail] = await Promise.all([
    auth(),
    prisma.mail.findUnique({ where: { id }, include: { attachments: true, order: { include: { customer: true } } } })
  ]);
  
  if (!mail) {
    return <div className="p-4">Mail nicht gefunden.</div>;
  }

  // Kontext laden
  const customer = mail.fromEmail ? await prisma.customer.findFirst({ where: { email: mail.fromEmail } }) : null;
  const orderCandidates = customer
    ? await prisma.order.findMany({ 
        where: { customerId: customer.id, status: { not: 'complete' } }, 
        select: { 
          id: true, 
          title: true,
          assignee: {
            select: {
              id: true,
              name: true
            }
          }
        } 
      })
    : [];



  return (
    <div className="p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Linke Spalte: Mail */}
        <div className="space-y-4">
          <div className="rounded border border-slate-800 p-3 bg-slate-900">
            <div className="text-lg font-semibold">{mail.subject || 'Ohne Betreff'}</div>
            <div className="text-sm text-slate-400 mt-1">Von: {mail.fromName || mail.fromEmail || '–'} · {mail.date ? new Date(mail.date).toLocaleString() : '–'}</div>
            <pre className="mt-3 whitespace-pre-wrap text-sm rounded-lg border border-slate-800 p-2 bg-slate-950 max-h-64 overflow-auto">{String((mail as any).text || '').slice(0, 5000)}</pre>
          </div>

          <AttachmentsPanel
            mailId={mail.id}
            attachments={mail.attachments as any}
            orderId={mail.orderId}
            linkedPaths={[]}
          />

          <ReplyComposer 
            mail={{ 
              id: mail.id, 
              subject: mail.subject || undefined, 
              text: (mail as any).text || undefined,
              fromEmail: mail.fromEmail || undefined,
              fromName: mail.fromName || undefined 
            }} 
            customer={customer}
            order={mail.order}
            currentUser={session?.user}
          />
        </div>

        {/* Rechte Spalte: Datenblatt */}
        <OrderChooseAndEdit
          mail={{ id: mail.id, subject: mail.subject, attachments: mail.attachments as any }}
          initialOrderId={mail.orderId}
          candidates={orderCandidates}
          suggestedOrderTypes={[]}
          specSuggestions={[]}
        />
      </div>
    </div>
  );
}



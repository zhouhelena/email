import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function Dashboard({ searchParams }: { searchParams?: { page?: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const page = Number((searchParams?.page as string) || '1') || 1;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const [events, total] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { userId: session.user.id },
      orderBy: { start: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.calendarEvent.count({ where: { userId: session.user.id } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Created Events</h1>
        <Link href="/" className="text-sm underline">Home</Link>
      </div>

      {events.length === 0 ? (
        <div className="text-gray-600">No events yet. The cron will process your Inbox and create relevant events automatically.</div>
      ) : (
        <ul className="space-y-4">
          {events.map((e) => (
            <li key={e.id} className="rounded border p-4">
              <div className="font-medium">{e.title}</div>
              <div className="text-sm text-gray-600">{new Date(e.start).toLocaleString()} — {new Date(e.end).toLocaleString()}</div>
              <div className="text-sm text-gray-600">Thread: <code>{e.gmailThreadId}</code></div>
              <div className="mt-2 flex gap-3 text-sm">
                <a className="underline" href={e.htmlLink} target="_blank" rel="noreferrer">Open in Google Calendar</a>
                <a className="underline" href={`https://mail.google.com/mail/u/0/#inbox/${e.gmailThreadId}`} target="_blank" rel="noreferrer">Open Gmail thread</a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-6">
        <Link aria-disabled={page <= 1} className={`px-3 py-1 rounded border ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`} href={`/dashboard?page=${Math.max(1, page - 1)}`}>Prev</Link>
        <div className="text-sm">Page {page} / {totalPages}</div>
        <Link aria-disabled={page >= totalPages} className={`px-3 py-1 rounded border ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`} href={`/dashboard?page=${Math.min(totalPages, page + 1)}`}>Next</Link>
      </div>
    </div>
  );
}

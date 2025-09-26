import Link from 'next/link';
import { auth } from '@/lib/auth';

export default async function Home() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-semibold text-center">Email → Calendar MVP</h1>
      <p className="text-center max-w-xl text-gray-600">
        Connect your Google account and automatically create Google Calendar events from relevant Gmail threads. A scheduled job checks your Inbox every 5 minutes and surfaces created events in a simple dashboard.
      </p>

      <div className="flex gap-4">
        {!signedIn ? (
          <a
            href="/api/auth/signin"
            className="px-4 py-2 rounded bg-black text-white hover:opacity-90"
          >
            Sign in with Google
          </a>
        ) : (
          <>
            <Link href="/dashboard" className="px-4 py-2 rounded border">Open Dashboard</Link>
            <a href="/api/auth/signout" className="px-4 py-2 rounded border">Sign out</a>
          </>
        )}
      </div>

      <div className="text-xs text-gray-500 mt-8">
        Requires scopes: Gmail Readonly and Calendar access. Cron runs every 5 minutes.
      </div>
    </div>
  );
}

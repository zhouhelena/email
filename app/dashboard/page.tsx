import { auth } from '@/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProcessEmailsButton } from './ProcessEmailsButton';
import { CronStatus } from './CronStatus';

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user) redirect('/');

  // Save authenticated user for dev cron
  if (process.env.NODE_ENV === 'development' && session?.user?.email && (session as any).accessToken && (session as any).refreshToken) {
    const { saveAuthenticatedUser } = await import('@/lib/userManager');
    await saveAuthenticatedUser(
      session.user.email,
      (session as any).accessToken,
      (session as any).refreshToken
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <nav className="flex justify-end items-center p-6 gap-4">
        <Link
          href="/api/auth/signout"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          sign out
        </Link>
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          open gcal
        </a>
        <Link
          href="/about"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          about
        </Link>
      </nav>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 pb-16">
        <div className="text-center space-y-8 w-full max-w-2xl">
          <h1 className="text-5xl font-light text-gray-900 tracking-tight">
            put it on the gcal
          </h1>

          <CronStatus />

          <div className="pt-4 pb-8">
            <ProcessEmailsButton />
          </div>
        </div>
      </div>
    </div>
  );
}

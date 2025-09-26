import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  console.log(`[EMAIL-TO-CAL] 🔄 Starting manual email processing...`);

  const session = await auth();
  if (!session?.user?.email || !(session as any).accessToken || !(session as any).refreshToken) {
    console.log(`[EMAIL-TO-CAL] ❌ Unauthorized access attempt`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[EMAIL-TO-CAL] ✅ Authenticated user: ${session.user.email}`);

  try {
    // Use the same email processor logic as the cron job
    const { processEmailsForUser } = await import('@/lib/emailProcessor');
    const result = await processEmailsForUser(
      session.user.email,
      (session as any).accessToken,
      (session as any).refreshToken
    );

    if (result.ok) {
      console.log(`[EMAIL-TO-CAL] ✅ Manual processing completed: ${result.processed} emails, ${result.results.filter(r => r.status === 'created').length} new events`);
    } else {
      console.error(`[EMAIL-TO-CAL] ❌ Manual processing failed:`, result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[EMAIL-TO-CAL] ❌ Manual processing error:`, error);
    return NextResponse.json({
      ok: false,
      processed: 0,
      results: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
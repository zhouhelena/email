import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCronLogs } from '@/lib/cronLog';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const logs = await getCronLogs();
    // Return the most recent 10 entries
    const recentLogs = logs.slice(-10).reverse();

    return NextResponse.json({
      ok: true,
      logs: recentLogs,
      lastRun: recentLogs[0]?.timestamp || null,
      isHealthy: recentLogs.length > 0 && recentLogs[0]?.status === 'success'
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
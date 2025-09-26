import { NextRequest, NextResponse } from 'next/server';
import { addCronLog } from '@/lib/cronLog';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  const secret = req.headers.get('x-cron-secret') || req.headers.get('x-vercel-cron-secret');

  console.log(`[CRON] 🕒 Cron job triggered at ${timestamp}`);

  if (!secret || secret !== process.env.CRON_SECRET) {
    console.log(`[CRON] ❌ Unauthorized cron request - missing or invalid secret`);
    await addCronLog({
      timestamp,
      status: 'error',
      message: 'Unauthorized cron request - missing or invalid secret'
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[CRON] ✅ Cron job authorized and running`);
  console.log(`[CRON] ℹ️  Database removed - automatic processing not available`);
  console.log(`[CRON] 💡 Users can manually process emails via the dashboard`);

  await addCronLog({
    timestamp,
    status: 'success',
    message: 'Cron job running successfully. Manual email processing available via dashboard.',
    processed: 0
  });

  return NextResponse.json({
    ok: true,
    message: 'Cron job running. Database removed - use manual processing via dashboard.',
    timestamp,
    nextActions: [
      'Visit /dashboard to manually process emails',
      'Cron runs every 5 minutes to confirm system health'
    ]
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

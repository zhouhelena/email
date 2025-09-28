import { addCronLog } from './cronLog';

let cronInterval: NodeJS.Timeout | null = null;
let isRunning = false;

export function startDevCron() {
  if (process.env.NODE_ENV !== 'development') {
    console.log('[DEV-CRON] Not in development mode, skipping dev cron');
    return;
  }

  if (cronInterval || isRunning) {
    console.log('[DEV-CRON] Dev cron already running, skipping');
    return;
  }

  if (cronInterval) {
    console.log('[DEV-CRON] Clearing existing cron interval');
    clearInterval(cronInterval);
    cronInterval = null;
  }

  console.log('[DEV-CRON] Starting development cron job (every 5 minutes)');

  const runCronJob = async () => {
    if (isRunning) {
      console.log('[DEV-CRON] ⚠️  Cron job already running, skipping this execution');
      return;
    }

    isRunning = true;
    const timestamp = new Date().toISOString();
    console.log(`[DEV-CRON] 🕒 Dev cron job triggered at ${timestamp}`);

    try {
      const { getAuthenticatedUsers } = await import('./userManager');
      const { processEmailsForUser } = await import('./emailProcessor');

      const authenticatedUsers = await getAuthenticatedUsers();
      console.log(`[DEV-CRON] Found ${authenticatedUsers.length} authenticated users`);

      if (authenticatedUsers.length === 0) {
        await addCronLog({
          timestamp,
          status: 'success',
          message: 'No authenticated users to process. Visit /dashboard to authenticate.',
          processed: 0
        });
        console.log(`[DEV-CRON] ✅ No authenticated users to process`);
        return;
      }

      let totalProcessed = 0;
      const allResults: any[] = [];
      let totalCreated = 0;
      let totalAlreadyExists = 0;

      for (const user of authenticatedUsers) {
        console.log(`[DEV-CRON] Processing emails for ${user.email}`);
        const result = await processEmailsForUser(user.email, user.accessToken, user.refreshToken);

        if (result.ok) {
          totalProcessed += result.processed;
          allResults.push(...result.results);

          const userCreated = result.results.filter(r => r.status === 'created').length;
          const userAlreadyExists = result.results.filter(r => r.status === 'already_created').length;

          totalCreated += userCreated;
          totalAlreadyExists += userAlreadyExists;

          console.log(`[DEV-CRON] ✅ User ${user.email}: ${result.processed} emails, ${userCreated} created, ${userAlreadyExists} already exist`);
        } else {
          console.error(`[DEV-CRON] ❌ Failed to process emails for ${user.email}:`, result.error);
        }
      }

      // Build informative message
      const messageParts = [`Processed ${totalProcessed} emails`];
      if (totalCreated > 0) messageParts.push(`created ${totalCreated} new events`);
      if (totalAlreadyExists > 0) messageParts.push(`${totalAlreadyExists} already existed`);

      const message = messageParts.join(', ');

      await addCronLog({
        timestamp,
        status: 'success',
        message,
        processed: totalProcessed,
        results: allResults
      });

      console.log(`[DEV-CRON] ✅ Dev cron job completed: ${message}`);
    } catch (error) {
      console.error(`[DEV-CRON] ❌ Dev cron job failed:`, error);
      await addCronLog({
        timestamp,
        status: 'error',
        message: `Dev cron job failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      isRunning = false;
    }
  };

  // Don't run immediately, wait for the interval
  console.log('[DEV-CRON] Cron job scheduled, first run in 5 minutes');

  // Run every 5 minutes (300000ms)
  cronInterval = setInterval(runCronJob, 300000);
}

export function stopDevCron() {
  if (cronInterval) {
    console.log('[DEV-CRON] Stopping development cron job');
    clearInterval(cronInterval);
    cronInterval = null;
  }
  isRunning = false;
}

// Auto-start in development
if (process.env.NODE_ENV === 'development') {
  startDevCron();
}
import { getGmailAndCalendar, getUserCalendarTimezone } from './google';
import { proposeCalendarEvent } from './llm';
import { htmlToText } from 'html-to-text';
import { addMinutes } from 'date-fns';
import * as chrono from 'chrono-node';

function parseAddressList(value?: string): { email: string; name?: string }[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .map((entry) => {
      const m = entry.match(/^(?:\"?([^<\"]+)\"?\s*)?<([^>]+)>$/);
      if (m) {
        return { email: m[2].trim(), name: m[1]?.trim() };
      }
      return { email: entry };
    })
    .filter((a) => /@/.test(a.email));
}

function getHeader(headers: any[], name: string): string | undefined {
  const h = headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value as string | undefined;
}

function extractPlainTextFromMessage(msg: any): string {
  const payload = msg.payload;
  function walk(p: any): string | null {
    if (!p) return null;
    if (p.mimeType === 'text/plain' && p.body?.data) {
      const data = Buffer.from(p.body.data, 'base64').toString('utf8');
      return data;
    }
    if (p.mimeType === 'text/html' && p.body?.data) {
      const html = Buffer.from(p.body.data, 'base64').toString('utf8');
      return htmlToText(html, { wordwrap: 120 });
    }
    if (Array.isArray(p.parts)) {
      for (const part of p.parts) {
        const got = walk(part);
        if (got) return got;
      }
    }
    return null;
  }
  return walk(payload) || msg.snippet || '';
}

async function checkExistingEvent(calendar: any, threadId: string, emailSubject?: string): Promise<{ exists: boolean; event?: any }> {
  try {
    const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${threadId}`;

    // Search for events in the next 90 days and past 30 days for comprehensive coverage
    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // Method 1: Search by thread ID (most reliable)
    console.log(`[EMAIL-PROCESSOR] 🔍 Checking for thread ID: ${threadId}`);
    const threadResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      q: threadId,
      maxResults: 50
    });

    const threadEvents = threadResponse.data.items || [];

    // Check if any event has this Gmail thread as source or in description
    for (const event of threadEvents) {
      if (event.source?.url === gmailUrl ||
          event.description?.includes(threadId) ||
          event.description?.includes(gmailUrl)) {
        console.log(`[EMAIL-PROCESSOR] ✅ Found existing event by thread ID: "${event.summary}"`);
        return { exists: true, event };
      }
    }

    // Method 2: Search by email subject with smart normalization
    if (emailSubject && emailSubject.length > 5) {
      // Advanced subject cleaning
      const cleanSubject = emailSubject
        .replace(/^(Re:|Fwd?:|RE:|FWD?:|Meeting:|Event:)\s*/i, '') // Remove prefixes
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s]/g, '') // Remove special characters
        .trim()
        .slice(0, 60); // Reasonable length limit

      if (cleanSubject.length > 8) { // Only search if meaningful
        console.log(`[EMAIL-PROCESSOR] 🔍 Checking for similar titles: "${cleanSubject}"`);

        const subjectResponse = await calendar.events.list({
          calendarId: 'primary',
          timeMin,
          timeMax,
          q: cleanSubject.split(' ').slice(0, 3).join(' '), // Use first 3 words for broader search
          maxResults: 30
        });

        const subjectEvents = subjectResponse.data.items || [];

        // Look for events with very similar titles created recently
        const recentThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // Last 14 days

        for (const event of subjectEvents) {
          if (!event.summary) continue;

          const eventCreated = event.created ? new Date(event.created) : null;
          const eventSummary = event.summary
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .toLowerCase()
            .trim();

          const subjectLower = cleanSubject.toLowerCase();

          // Check if event was created recently
          if (eventCreated && eventCreated > recentThreshold) {
            // Multiple similarity checks
            const exactMatch = eventSummary === subjectLower;
            const levenshteinSimilarity = calculateStringSimilarity(eventSummary, subjectLower);
            const wordOverlap = calculateWordOverlap(eventSummary, subjectLower);

            // Smart matching: high Levenshtein similarity OR significant word overlap OR exact match
            if (exactMatch || levenshteinSimilarity > 0.85 || (levenshteinSimilarity > 0.7 && wordOverlap > 0.6)) {
              const similarityScore = Math.max(levenshteinSimilarity, wordOverlap) * 100;
              console.log(`[EMAIL-PROCESSOR] ✅ Found existing event by title similarity (${Math.round(similarityScore)}%): "${event.summary}"`);
              return { exists: true, event };
            }
          }
        }
      }
    }

    console.log(`[EMAIL-PROCESSOR] ❌ No existing event found for thread ${threadId}`);
    return { exists: false };
  } catch (error) {
    console.error(`[EMAIL-PROCESSOR] Error checking existing event for thread ${threadId}:`, error);
    return { exists: false };
  }
}

// Enhanced word overlap calculation for better semantic matching
function calculateWordOverlap(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));

  return intersection.size / Math.min(words1.size, words2.size);
}

// Simple string similarity calculation using Levenshtein distance
function calculateStringSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,     // deletion
        matrix[j][i - 1] + 1,     // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return (maxLen - matrix[len2][len1]) / maxLen;
}

export async function processEmailsForUser(userEmail: string, accessToken: string, refreshToken: string) {
  console.log(`[EMAIL-PROCESSOR] 🔄 Processing emails for user: ${userEmail}`);

  try {
    const timezone = await getUserCalendarTimezone(accessToken, refreshToken);
    const { gmail, calendar } = await getGmailAndCalendar(accessToken, refreshToken);

    console.log(`[EMAIL-PROCESSOR] 📧 Fetching recent emails from inbox...`);

    // Get recent emails from inbox
    const list = await gmail.users.threads.list({
      userId: 'me',
      q: 'in:inbox newer_than:1d',
      maxResults: 10
    });
    const threads = list.data.threads || [];

    console.log(`[EMAIL-PROCESSOR] 📊 Found ${threads.length} recent email threads for ${userEmail}`);

    const results = [];
    let processed = 0;

    for (const t of threads) {
      if (processed >= 5) break; // Limit to 5 threads for cron processing
      if (!t.id) continue;

      const thr = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' });
      const messages = thr.data.messages || [];
      if (messages.length === 0) continue;

      // Get latest message
      const latest = [...messages].sort((a: any, b: any) => Number(a.internalDate || 0) - Number(b.internalDate || 0)).at(-1)!;

      const headers = latest.payload?.headers || [];
      const subject = getHeader(headers, 'Subject') || '(no subject)';
      const to = parseAddressList(getHeader(headers, 'To'));
      const cc = parseAddressList(getHeader(headers, 'Cc'));

      console.log(`[EMAIL-PROCESSOR] 📄 Analyzing email: "${subject}"`);

      // Check if we've already created an event for this thread
      const existingCheck = await checkExistingEvent(calendar, t.id, subject);
      if (existingCheck.exists) {
        console.log(`[EMAIL-PROCESSOR] ⚠️  Event already exists for thread ${t.id}: "${existingCheck.event?.summary}"`);
        results.push({
          threadId: t.id,
          subject,
          status: 'already_created',
          eventId: existingCheck.event?.id,
          eventLink: existingCheck.event?.htmlLink,
          title: existingCheck.event?.summary
        });
        processed++;
        continue;
      }

      const myEmail = userEmail.toLowerCase();
      const candidateMap = new Map<string, { email: string; name?: string }>();
      for (const a of [...to, ...cc]) {
        const em = a.email.toLowerCase();
        if (myEmail && em === myEmail) continue;
        if (!candidateMap.has(em)) candidateMap.set(em, { email: a.email, name: a.name });
      }
      const candidates = Array.from(candidateMap.values());

      const bodyText = extractPlainTextFromMessage(latest).slice(0, 16000);

      console.log(`[EMAIL-PROCESSOR] 🤖 Sending to AI for analysis...`);

      const { proposal } = await proposeCalendarEvent({
        subject,
        text: bodyText,
        timezone,
        attendees: candidates,
        gmailThreadId: t.id,
      });

      if (!proposal) {
        results.push({
          threadId: t.id,
          subject,
          status: 'skipped',
          reason: 'No meeting/event detected'
        });
        processed++;
        continue;
      }

      // Compute start/end times with better validation
      let startISO = proposal.startISO;
      let endISO = proposal.endISO;

      // Validate and fix startISO format
      if (!startISO.includes('T') || !startISO.match(/:\d{2}$/)) {
        console.log(`[EMAIL-PROCESSOR] ⚠️  Fixing malformed startISO: ${startISO}`);
        const startDate = new Date(startISO);
        if (!isNaN(startDate.getTime())) {
          startISO = startDate.toISOString();
        }
      }

      if (!endISO) {
        // Try to parse end time from email content using chrono
        const parsed = chrono.parse(`${subject}\n${bodyText}`.slice(0, 4000), new Date(), { forwardDate: true });
        if (parsed?.[0]?.end) {
          endISO = parsed[0].end.date().toISOString();
        } else {
          // Smart default durations based on event type
          const startDate = new Date(startISO);
          let defaultDurationMinutes = 60; // Default 1 hour

          const subjectLower = subject.toLowerCase();
          const bodyLower = bodyText.toLowerCase();
          const combined = `${subjectLower} ${bodyLower}`;

          if (combined.includes('lunch') || combined.includes('dinner') || combined.includes('meal')) {
            defaultDurationMinutes = 90; // 1.5 hours for meals
          } else if (combined.includes('call') || combined.includes('phone') || combined.includes('quick')) {
            defaultDurationMinutes = 30; // 30 minutes for calls
          } else if (combined.includes('workshop') || combined.includes('training') || combined.includes('conference')) {
            defaultDurationMinutes = 120; // 2 hours for longer events
          }

          endISO = addMinutes(startDate, defaultDurationMinutes).toISOString();
          console.log(`[EMAIL-PROCESSOR] 📅 Set default duration: ${defaultDurationMinutes} minutes`);
        }
      }

      // Validate that end time is after start time
      const startTime = new Date(startISO);
      const endTime = new Date(endISO);

      if (endTime <= startTime) {
        console.log(`[EMAIL-PROCESSOR] ⚠️  End time before start time, fixing...`);
        endISO = addMinutes(startTime, 60).toISOString();
      }

      // Create calendar event
      const attendeeInputs = (proposal.attendees && proposal.attendees.length > 0 ? proposal.attendees : candidates);
      const attendees = attendeeInputs.map((a) => ({ email: a.email, displayName: a.name }));

      try {
        console.log(`[EMAIL-PROCESSOR] Creating calendar event for thread ${t.id}`);
        console.log(`[EMAIL-PROCESSOR] Event details:`, {
          title: proposal.title,
          start: startISO,
          end: endISO,
          attendees: attendees.length,
          timezone: proposal.timezone
        });

        // Add thread ID to description for reliable duplicate detection
        const enhancedDescription = [
          proposal.description || '',
          '',
          `Gmail Thread ID: ${t.id}`,
          `Gmail Link: https://mail.google.com/mail/u/0/#inbox/${t.id}`
        ].filter(Boolean).join('\n');

        const insert = await calendar.events.insert({
          calendarId: 'primary',
          sendUpdates: 'all',
          requestBody: {
            summary: proposal.title,
            description: enhancedDescription,
            start: { dateTime: startISO, timeZone: proposal.timezone },
            end: { dateTime: endISO, timeZone: proposal.timezone },
            attendees,
            source: { title: 'Gmail thread', url: `https://mail.google.com/mail/u/0/#inbox/${t.id}` },
          },
        });

        const eventId = insert.data.id;
        const eventLink = insert.data.htmlLink;

        console.log(`[EMAIL-PROCESSOR] ✅ Successfully created calendar event:`);
        console.log(`[EMAIL-PROCESSOR] Event ID: ${eventId}`);
        console.log(`[EMAIL-PROCESSOR] Event Link: ${eventLink}`);
        console.log(`[EMAIL-PROCESSOR] Gmail Thread: https://mail.google.com/mail/u/0/#inbox/${t.id}`);

        results.push({
          threadId: t.id,
          subject,
          status: 'created',
          eventId,
          eventLink,
          title: proposal.title
        });
      } catch (error) {
        console.error(`[EMAIL-PROCESSOR] ❌ Failed to create calendar event for thread ${t.id}:`, error);
        results.push({
          threadId: t.id,
          subject,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      processed++;
    }

    return { ok: true, processed, results };
  } catch (error) {
    console.error(`[EMAIL-PROCESSOR] ❌ Failed to process emails for ${userEmail}:`, error);
    return {
      ok: false,
      processed: 0,
      results: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
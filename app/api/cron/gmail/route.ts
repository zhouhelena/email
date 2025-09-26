import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getGmailAndCalendar, getUserCalendarTimezone } from '@/lib/google';
import { proposeCalendarEvent } from '@/lib/llm';
import { htmlToText } from 'html-to-text';
import { startOfDay, endOfDay, addMinutes } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import * as chrono from 'chrono-node';

export const runtime = 'nodejs';

const MAX_THREADS_PER_USER = 50;

function parseAddressList(value?: string): { email: string; name?: string }[] {
  if (!value) return [];
  // Very light parser: split by comma, extract name <email> or plain email
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

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('x-vercel-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    where: { provider: 'google' },
    select: { userId: true },
    distinct: ['userId'],
  });

  const results: any[] = [];

  for (const { userId } of accounts) {
    let processed = 0;
    let tokenPrompt = 0;
    let tokenCompletion = 0;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) continue;

      const timezone = await getUserCalendarTimezone(userId);
      const now = new Date();
      const zonedNow = utcToZonedTime(now, timezone);
      const startZoned = startOfDay(zonedNow);
      const endZoned = endOfDay(zonedNow);
      const todayStartUtc = zonedTimeToUtc(startZoned, timezone);
      const todayEndUtc = zonedTimeToUtc(endZoned, timezone);

      const { gmail, calendar } = await getGmailAndCalendar(userId);

      const list = await gmail.users.threads.list({ userId: 'me', q: 'in:inbox newer_than:1d' });
      const threads = list.data.threads || [];

      for (const t of threads) {
        if (processed >= MAX_THREADS_PER_USER) break;
        if (!t.id) continue;

        const existingThread = await prisma.emailThread.findUnique({ where: { userId_gmailThreadId: { userId, gmailThreadId: t.id } } });
        if (existingThread?.processedAt) continue;

        const thr = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' });
        const messages = thr.data.messages || [];
        if (messages.length === 0) continue;

        // Latest message by internalDate
        const latest = [...messages].sort((a: any, b: any) => Number(a.internalDate || 0) - Number(b.internalDate || 0)).at(-1)!;
        const latestMs = Number(latest.internalDate || 0);
        const latestDate = new Date(latestMs);
        if (latestDate < todayStartUtc || latestDate > todayEndUtc) {
          // Outside today window
          continue;
        }

        const headers = latest.payload?.headers || [];
        const subject = getHeader(headers, 'Subject') || '(no subject)';
        const to = parseAddressList(getHeader(headers, 'To'));
        const cc = parseAddressList(getHeader(headers, 'Cc'));
        const from = parseAddressList(getHeader(headers, 'From'));

        const myEmail = user.email?.toLowerCase();
        const candidateMap = new Map<string, { email: string; name?: string }>();
        for (const a of [...to, ...cc]) {
          const em = a.email.toLowerCase();
          if (myEmail && em === myEmail) continue;
          if (!candidateMap.has(em)) candidateMap.set(em, { email: a.email, name: a.name });
        }
        const candidates = Array.from(candidateMap.values());

        const bodyText = extractPlainTextFromMessage(latest).slice(0, 16000);

        const { proposal, usage } = await proposeCalendarEvent({
          subject,
          text: bodyText,
          timezone,
          attendees: candidates,
          gmailThreadId: t.id,
        });
        tokenPrompt += usage?.promptTokens || 0;
        tokenCompletion += usage?.completionTokens || 0;

        // Upsert EmailThread record baseline
        const et = await prisma.emailThread.upsert({
          where: { userId_gmailThreadId: { userId, gmailThreadId: t.id } },
          create: {
            userId,
            gmailThreadId: t.id,
            latestMessageId: latest.id || '',
            lastMessageAt: latestDate,
          },
          update: {
            latestMessageId: latest.id || '',
            lastMessageAt: latestDate,
          },
        });

        if (!proposal) {
          // Distinguish no_datetime vs not_relevant using chrono
          const parsed = chrono.parse(bodyText, zonedNow, { forwardDate: true });
          const reason = parsed?.[0]?.start ? 'not_relevant' : 'no_datetime';
          await prisma.emailThread.update({
            where: { id: et.id },
            data: {
              processedAt: new Date(),
              processedReason: reason as any,
            },
          });
          processed++;
          continue;
        }

        // Idempotency: skip if already created for this thread
        const already = await prisma.calendarEvent.findUnique({ where: { userId_gmailThreadId: { userId, gmailThreadId: t.id } } });
        if (already) {
          await prisma.emailThread.update({ where: { id: et.id }, data: { processedAt: new Date(), processedReason: 'created', createdCalendarEventId: already.calendarEventId } });
          processed++;
          continue;
        }

        // Compute start/end
        let startISO = proposal.startISO;
        let endISO = proposal.endISO;

        if (!endISO) {
          // Try chrono to infer end
          const parsed = chrono.parse(`${subject}\n${bodyText}`.slice(0, 4000), zonedNow, { forwardDate: true });
          if (parsed?.[0]?.end) {
            endISO = parsed[0].end.date().toISOString();
          } else {
            // default 30 minutes
            endISO = addMinutes(new Date(startISO), 30).toISOString();
          }
        }

        // Create calendar event
        const attendeeInputs = (proposal.attendees && proposal.attendees.length > 0 ? proposal.attendees : candidates);
        const attendees = attendeeInputs.map((a) => ({ email: a.email, displayName: a.name }));
        const insert = await calendar.events.insert({
          calendarId: 'primary',
          sendUpdates: 'all',
          requestBody: {
            summary: proposal.title,
            description: proposal.description,
            start: { dateTime: startISO, timeZone: proposal.timezone },
            end: { dateTime: endISO, timeZone: proposal.timezone },
            attendees,
            source: { title: 'Gmail thread', url: `https://mail.google.com/mail/u/0/#inbox/${t.id}` },
          },
        });

        const created = insert.data;
        const calendarEventId = created.id || '';

        await prisma.calendarEvent.create({
          data: {
            userId,
            gmailThreadId: t.id,
            calendarEventId,
            htmlLink: created.htmlLink || '',
            title: proposal.title,
            start: new Date(startISO),
            end: new Date(endISO),
            attendees: attendeeInputs || [],
            sourceSummary: subject,
          },
        });

        await prisma.emailThread.update({
          where: { id: et.id },
          data: { processedAt: new Date(), processedReason: 'created', createdCalendarEventId: calendarEventId },
        });

        processed++;
      }

      await prisma.userSyncState.upsert({
        where: { userId },
        create: { userId, lastSyncedAt: new Date() },
        update: { lastSyncedAt: new Date() },
      });

      results.push({ userId, processed, tokens: { prompt: tokenPrompt, completion: tokenCompletion } });
    } catch (err: any) {
      results.push({ userId, error: err?.message || 'unknown' });
      continue;
    }
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

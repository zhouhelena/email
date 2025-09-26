import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from './db';
import { decryptString, encryptString, isEncryptedString } from './crypto';

export async function getGoogleAccountForUser(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });
  if (!account) throw new Error('Google account not linked');
  return account;
}

function decryptMaybe(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (isEncryptedString(value)) return decryptString(value);
  return value;
}

export async function getOAuthClientForUser(userId: string): Promise<OAuth2Client> {
  const account = await getGoogleAccountForUser(userId);
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  const refreshToken = decryptMaybe(account.refresh_token);
  const accessToken = decryptMaybe(account.access_token);
  const expiry = account.expires_at ? account.expires_at * 1000 : undefined;

  if (!refreshToken) throw new Error('Missing refresh token');

  client.setCredentials({ refresh_token: refreshToken, access_token: accessToken, expiry_date: expiry });

  // Refresh if expired or missing access token
  const needsRefresh = !accessToken || !expiry || Date.now() > (expiry - 60_000);
  if (needsRefresh) {
    const res = await client.refreshToken(refreshToken);
    const tokens = res.tokens;
    const newAccess = tokens.access_token!;
    const newExpiry = tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined;
    const newRefresh = tokens.refresh_token ?? refreshToken; // sometimes not returned

    await prisma.account.update({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: account.providerAccountId } },
      data: {
        access_token: encryptString(newAccess),
        refresh_token: isEncryptedString(account.refresh_token || '') ? undefined : encryptString(newRefresh),
        expires_at: newExpiry,
      },
    });

    client.setCredentials({ refresh_token: newRefresh, access_token: newAccess, expiry_date: newExpiry ? newExpiry * 1000 : undefined });
  }

  return client;
}

export async function getGmailAndCalendar(userId: string) {
  const auth = await getOAuthClientForUser(userId);
  const gmail = google.gmail({ version: 'v1', auth });
  const calendar = google.calendar({ version: 'v3', auth });
  return { gmail, calendar, auth };
}

export async function getUserCalendarTimezone(userId: string): Promise<string> {
  const { calendar } = await getGmailAndCalendar(userId);
  try {
    const tzSetting = await calendar.settings.get({ setting: 'timezone' });
    const tz = (tzSetting.data as any)?.value as string | undefined;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export async function getOAuthClientFromTokens(accessToken: string, refreshToken: string): Promise<OAuth2Client> {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  return client;
}

export async function getGmailAndCalendar(accessToken: string, refreshToken: string) {
  const auth = await getOAuthClientFromTokens(accessToken, refreshToken);
  const gmail = google.gmail({ version: 'v1', auth });
  const calendar = google.calendar({ version: 'v3', auth });
  return { gmail, calendar, auth };
}

export async function getUserCalendarTimezone(accessToken: string, refreshToken: string): Promise<string> {
  const { calendar } = await getGmailAndCalendar(accessToken, refreshToken);
  try {
    const tzSetting = await calendar.settings.get({ setting: 'timezone' });
    const tz = (tzSetting.data as any)?.value as string | undefined;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

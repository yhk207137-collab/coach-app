import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TOKENS_KEY = 'google_calendar_tokens';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state?: string) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    prompt: 'consent',
    ...(state ? { state } : {}),
  });
}

export async function getTokensFromCode(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function saveTokens(tokens: any) {
  await prisma.setting.upsert({
    where: { key: TOKENS_KEY },
    create: { key: TOKENS_KEY, value: JSON.stringify(tokens) },
    update: { value: JSON.stringify(tokens) },
  });
}

async function getAuthorizedClient() {
  const row = await prisma.setting.findUnique({ where: { key: TOKENS_KEY } });
  if (!row) return null;

  const client = createOAuth2Client();
  const tokens = JSON.parse(row.value);
  client.setCredentials(tokens);

  // Auto-refresh token if expired and save updated tokens
  client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await saveTokens(merged);
  });

  return client;
}

export async function isCalendarConnected(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: TOKENS_KEY } });
  return !!row;
}

export async function addToGoogleCalendar(meeting: any, client: any): Promise<string | undefined> {
  if (!process.env.GOOGLE_CLIENT_ID) return undefined;
  const auth = await getAuthorizedClient();
  if (!auth) return undefined;

  const calendar = google.calendar({ version: 'v3', auth });
  const startTime = new Date(meeting.date);
  const endTime = new Date(startTime.getTime() + meeting.duration * 60000);

  const event = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all', // sends Google Calendar invite email to attendees
    requestBody: {
      summary: `פגישה – ${client.fullName}`,
      description: meeting.notes || '',
      start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Jerusalem' },
      end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Jerusalem' },
      attendees: [{ email: client.email, displayName: client.fullName }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    },
  });

  return event.data.id || undefined;
}

export async function updateGoogleCalendarEvent(eventId: string, meeting: any, client: any) {
  if (!process.env.GOOGLE_CLIENT_ID) return;
  const auth = await getAuthorizedClient();
  if (!auth) return;

  const calendar = google.calendar({ version: 'v3', auth });
  const startTime = new Date(meeting.date);
  const endTime = new Date(startTime.getTime() + meeting.duration * 60000);

  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
    requestBody: {
      summary: `פגישה – ${client.fullName}`,
      description: meeting.notes || '',
      start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Jerusalem' },
      end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Jerusalem' },
    },
  });
}

export async function deleteFromGoogleCalendar(eventId: string) {
  if (!process.env.GOOGLE_CLIENT_ID) return;
  const auth = await getAuthorizedClient();
  if (!auth) return;
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
}

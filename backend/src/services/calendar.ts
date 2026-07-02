import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const TOKEN_PATH = path.join(__dirname, '../../.google-tokens.json');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

export async function getTokensFromCode(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function saveTokens(tokens: any) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
}

function getAuthorizedClient() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  const client = createOAuth2Client();
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  client.setCredentials(tokens);
  return client;
}

export async function addToGoogleCalendar(meeting: any, client: any): Promise<string | undefined> {
  const auth = getAuthorizedClient();
  if (!auth) return undefined;

  const calendar = google.calendar({ version: 'v3', auth });
  const startTime = new Date(meeting.date);
  const endTime = new Date(startTime.getTime() + meeting.duration * 60000);

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `פגישת אימון – ${client.fullName}`,
      description: meeting.notes || '',
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
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

export async function deleteFromGoogleCalendar(eventId: string) {
  const auth = getAuthorizedClient();
  if (!auth) return;
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: 'primary', eventId });
}

// Google Calendar and Gmail for the assistant, on the same grant the CRM already uses.
import { google } from 'googleapis';
import { getAuthorizedClient } from '../calendar';

const TZ = 'Asia/Jerusalem';

async function auth() {
  const a = await getAuthorizedClient();
  if (!a) throw new Error('גוגל לא מחובר. צריך ללחוץ "חבר יומן גוגל" בהגדרות המערכת.');
  return a;
}

const fmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: TZ,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const when = (iso?: string | null) => (iso ? fmt.format(new Date(iso)) : '');

// "2026-11-20T10:00" (Israel time) or a full ISO string, as Google wants it.
const at = (local: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(local) ? { dateTime: local } : { dateTime: local.length === 16 ? `${local}:00` : local, timeZone: TZ });

// ── Calendar ────────────────────────────────────────────────────────────────

export async function listEvents(from: string, to: string) {
  const calendar = google.calendar({ version: 'v3', auth: await auth() });
  const toIso = (s: string) => (s.length <= 10 ? new Date(`${s}T00:00:00+02:00`).toISOString() : new Date(s).toISOString());
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: toIso(from),
    timeMax: toIso(to),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });
  return (res.data.items || []).map((e) => ({
    id: e.id,
    title: e.summary,
    start: e.start?.dateTime || e.start?.date,
    startText: e.start?.dateTime ? when(e.start.dateTime) : `${e.start?.date} (כל היום)`,
    end: e.end?.dateTime || e.end?.date,
    location: e.location || undefined,
    attendees: (e.attendees || []).filter((a) => !a.self).map((a) => a.email),
    link: e.hangoutLink || undefined,
  }));
}

export interface EventInput {
  title: string;
  start: string; // Israel local time, YYYY-MM-DDTHH:mm
  durationMinutes: number;
  attendees?: string[];
  location?: string;
  description?: string;
  googleMeet?: boolean;
}

export async function createEvent(input: EventInput) {
  const calendar = google.calendar({ version: 'v3', auth: await auth() });
  const start = at(input.start);
  const endDate = new Date(new Date(input.start).getTime() + input.durationMinutes * 60000);
  // For Israel local times the end is computed on the same wall clock, so a DST change never shifts it.
  const [d, t] = input.start.split('T');
  const startLocal = new Date(`${d}T${(t || '00:00').slice(0, 5)}:00Z`);
  const endLocal = new Date(startLocal.getTime() + input.durationMinutes * 60000).toISOString().slice(0, 19);
  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: input.attendees?.length ? 'all' : 'none',
    conferenceDataVersion: input.googleMeet ? 1 : 0,
    requestBody: {
      summary: input.title,
      description: input.description,
      location: input.location,
      start,
      end: start.timeZone ? { dateTime: endLocal, timeZone: TZ } : { dateTime: endDate.toISOString() },
      attendees: input.attendees?.map((email) => ({ email })),
      ...(input.googleMeet
        ? { conferenceData: { createRequest: { requestId: `a-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
        : {}),
    },
  });
  return { id: res.data.id, startText: when(res.data.start?.dateTime), link: res.data.hangoutLink || undefined, htmlLink: res.data.htmlLink };
}

export async function getEvent(eventId: string) {
  const calendar = google.calendar({ version: 'v3', auth: await auth() });
  const { data } = await calendar.events.get({ calendarId: 'primary', eventId });
  return data;
}

export async function moveEvent(eventId: string, start: string, durationMinutes?: number) {
  const calendar = google.calendar({ version: 'v3', auth: await auth() });
  const old = await getEvent(eventId);
  const oldLen =
    old.start?.dateTime && old.end?.dateTime
      ? (new Date(old.end.dateTime).getTime() - new Date(old.start.dateTime).getTime()) / 60000
      : 60;
  const len = durationMinutes || oldLen;
  const [d, t] = start.split('T');
  const startLocal = new Date(`${d}T${(t || '00:00').slice(0, 5)}:00Z`);
  const endLocal = new Date(startLocal.getTime() + len * 60000).toISOString().slice(0, 19);
  const hasGuests = (old.attendees || []).some((a) => !a.self);
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    sendUpdates: hasGuests ? 'all' : 'none',
    requestBody: { start: at(start), end: { dateTime: endLocal, timeZone: TZ } },
  });
}

export async function deleteEvent(eventId: string) {
  const calendar = google.calendar({ version: 'v3', auth: await auth() });
  const old = await getEvent(eventId);
  const hasGuests = (old.attendees || []).some((a) => !a.self);
  await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: hasGuests ? 'all' : 'none' });
}

export async function eventHasGuests(eventId: string) {
  const old = await getEvent(eventId);
  return { title: old.summary || '', startText: when(old.start?.dateTime), guests: (old.attendees || []).filter((a) => !a.self).map((a) => a.email!) };
}

// ── Gmail ───────────────────────────────────────────────────────────────────

const header = (h: { name?: string | null; value?: string | null }[] | undefined, name: string) =>
  h?.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';

export async function searchMail(query: string, max = 10) {
  const gmail = google.gmail({ version: 'v1', auth: await auth() });
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: Math.min(max, 25) });
  const ids = (list.data.messages || []).map((m) => m.id!);
  const out = [];
  for (const id of ids) {
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    });
    const h = data.payload?.headers || [];
    out.push({
      id,
      threadId: data.threadId,
      from: header(h, 'From'),
      to: header(h, 'To'),
      subject: header(h, 'Subject'),
      date: when(data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null),
      unread: (data.labelIds || []).includes('UNREAD'),
      snippet: data.snippet,
    });
  }
  return out;
}

function bodyText(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  if (part.parts) {
    const plain = part.parts.map(bodyText).filter(Boolean);
    if (plain.length) return plain.join('\n');
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url')
      .toString('utf8')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  }
  return '';
}

export async function readMail(id: string) {
  const gmail = google.gmail({ version: 'v1', auth: await auth() });
  const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  const h = data.payload?.headers || [];
  const attachments: string[] = [];
  const walk = (p: any) => {
    if (p?.filename) attachments.push(p.filename);
    (p?.parts || []).forEach(walk);
  };
  walk(data.payload);
  return {
    id,
    threadId: data.threadId,
    from: header(h, 'From'),
    to: header(h, 'To'),
    cc: header(h, 'Cc'),
    subject: header(h, 'Subject'),
    date: when(data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null),
    messageIdHeader: header(h, 'Message-ID'),
    body: bodyText(data.payload).slice(0, 12000),
    attachments,
  };
}

export interface MailInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  replyToId?: string; // Gmail message id being answered, keeps the thread
}

const b64Header = (s: string) => (/^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

async function buildRaw(input: MailInput) {
  let threadId: string | undefined;
  const extra: string[] = [];
  let subject = input.subject;
  if (input.replyToId) {
    const orig = await readMail(input.replyToId);
    threadId = orig.threadId || undefined;
    if (orig.messageIdHeader) extra.push(`In-Reply-To: ${orig.messageIdHeader}`, `References: ${orig.messageIdHeader}`);
    if (!subject) subject = /^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
  }
  const lines = [
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    `Subject: ${b64Header(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    ...extra,
    '',
    Buffer.from(input.body, 'utf8').toString('base64'),
  ];
  return { raw: Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url'), threadId };
}

export async function createDraft(input: MailInput) {
  const gmail = google.gmail({ version: 'v1', auth: await auth() });
  const { raw, threadId } = await buildRaw(input);
  const { data } = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw, threadId } } });
  return { draftId: data.id };
}

export async function sendMail(input: MailInput) {
  const gmail = google.gmail({ version: 'v1', auth: await auth() });
  const { raw, threadId } = await buildRaw(input);
  const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } });
  return { id: data.id };
}

export async function markMailRead(id: string) {
  const gmail = google.gmail({ version: 'v1', auth: await auth() });
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
}

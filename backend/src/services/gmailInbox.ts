// The Gmail inbox the "guide by email" requests arrive in. Its own Google grant (gmail.modify only),
// separate from the calendar connection and from the WhatsApp assistant. Connecting goes through the
// calendar's callback (/api/calendar/callback), which is already registered with Google.
import crypto from 'crypto';
import { google } from 'googleapis';
import { prisma } from '../lib/prisma';

const TOKENS_KEY = 'google_gmail_guide_tokens';
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
// Tests only: a fake local Gmail.
const FAKE = process.env.GUIDE_MAIL_FAKE_GOOGLE_URL || process.env.ASSISTANT_FAKE_GOOGLE_URL;
const fakeRoot = FAKE ? { rootUrl: FAKE } : {};

const oauth = (redirectUri?: string) => new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);

// States of connections started from the marketing screen; the calendar callback hands them here.
const states = new Map<string, number>();
export const isGmailConnectState = (state: string) => (states.get(state) || 0) > Date.now();

export function gmailConnectUrl(redirectUri: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('החיבור לגוגל לא מוגדר בשרת (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
  const state = 'gm_' + crypto.randomBytes(16).toString('hex');
  states.set(state, Date.now() + 15 * 60_000);
  return oauth(redirectUri).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state });
}

export async function finishGmailConnect(code: string, state: string, redirectUri: string) {
  if (!isGmailConnectState(state)) throw new Error('הקישור פג תוקף. נסה שוב מהמערכת.');
  states.delete(state);
  const { tokens } = await oauth(redirectUri).getToken(code);
  await saveTokens(tokens);
}

async function saveTokens(tokens: object) {
  await prisma.setting.upsert({ where: { key: TOKENS_KEY }, create: { key: TOKENS_KEY, value: JSON.stringify(tokens) }, update: { value: JSON.stringify(tokens) } });
}

async function auth() {
  if (FAKE) {
    const fake = oauth();
    fake.setCredentials({ access_token: 'test', expiry_date: Date.now() + 3600e3 });
    return fake;
  }
  const row = await prisma.setting.findUnique({ where: { key: TOKENS_KEY } });
  if (!row) throw new Error('ג\'ימייל לא מחובר');
  const tokens = JSON.parse(row.value);
  const client = oauth();
  client.setCredentials(tokens);
  client.on('tokens', (fresh) => void saveTokens({ ...tokens, ...fresh }).catch(() => undefined));
  return client;
}

const gmail = async () => google.gmail({ version: 'v1', auth: await auth(), ...fakeRoot });

// The connected address; `error` when a grant exists but Google refuses it (e.g. the Gmail API is
// not enabled in the Google project). A revoked grant is forgotten, so the screen offers to connect again.
export async function gmailState(): Promise<{ address: string | null; error: string | null }> {
  if (!FAKE && !(await prisma.setting.findUnique({ where: { key: TOKENS_KEY } }))) return { address: null, error: null };
  try {
    const { data } = await (await gmail()).users.getProfile({ userId: 'me' });
    return { address: (data.emailAddress || '').toLowerCase() || null, error: null };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('invalid_grant')) {
      await prisma.setting.deleteMany({ where: { key: TOKENS_KEY } });
      return { address: null, error: null };
    }
    return { address: null, error: msg.slice(0, 300) };
  }
}

export const gmailAddress = async () => (await gmailState()).address;

const header = (h: { name?: string | null; value?: string | null }[] | undefined, name: string) =>
  h?.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';

function bodyText(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  if (part.parts) {
    const plain = part.parts.map(bodyText).filter(Boolean);
    if (plain.length) return plain.join('\n');
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8')
      .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  }
  return '';
}

export interface IncomingMail {
  id: string;
  from: string;
  subject: string;
  receivedAt: Date;
  body: string;
  automatic: boolean; // an auto-reply / bounce / list mail, not a person
}

export async function listIncomingMail(query: string, max = 25): Promise<IncomingMail[]> {
  const g = await gmail();
  const list = await g.users.messages.list({ userId: 'me', q: query, maxResults: Math.min(max, 50) });
  const out: IncomingMail[] = [];
  for (const m of list.data.messages || []) {
    const { data } = await g.users.messages.get({ userId: 'me', id: m.id!, format: 'full' });
    const h = data.payload?.headers || [];
    const autoSubmitted = header(h, 'Auto-Submitted').toLowerCase();
    const precedence = header(h, 'Precedence').toLowerCase();
    out.push({
      id: m.id!,
      from: header(h, 'From'),
      subject: header(h, 'Subject'),
      receivedAt: new Date(Number(data.internalDate || Date.now())),
      body: bodyText(data.payload).slice(0, 4000),
      automatic: (!!autoSubmitted && autoSubmitted !== 'no') || ['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)
        || !!header(h, 'X-Autoreply') || !!header(h, 'X-Autorespond'),
    });
  }
  return out;
}

const labelIds = new Map<string, string>();
// Puts a label on a handled message (creating the label once) and marks it read.
export async function labelHandled(id: string, labelName: string) {
  const g = await gmail();
  let labelId = labelIds.get(labelName);
  if (!labelId) {
    const { data } = await g.users.labels.list({ userId: 'me' });
    labelId = (data.labels || []).find((l) => l.name === labelName)?.id || undefined;
    if (!labelId) labelId = (await g.users.labels.create({ userId: 'me', requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' } })).data.id!;
    labelIds.set(labelName, labelId);
  }
  await g.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: [labelId], removeLabelIds: ['UNREAD'] } });
}

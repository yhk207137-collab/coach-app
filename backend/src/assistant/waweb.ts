// WhatsApp as a "linked device" of the assistant's own number (like WhatsApp Web), for the local trial.
// Linking is by an 8-character pairing code typed once on the phone that holds the number.
// Unofficial (not Meta's Business API): only the assistant's dedicated number is at risk, never the owner's.
import fs from 'fs';
import os from 'os';
import path from 'path';
import pino from 'pino';
import OpenAI, { toFile } from 'openai';
import type { HostOptions } from './host';
import { db, kvGet, kvSet } from './store';
import { handleOwnerMessage } from './brain';
import { normalizePhone } from './whatsapp';

const importEsm = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
const authDir = () => path.join(process.env.ASSISTANT_DATA_DIR || path.join(os.tmpdir(), 'personal-assistant'), 'wa-auth');

export interface WaWebState {
  state: 'off' | 'connecting' | 'waiting_for_code' | 'connected' | 'logged_out';
  code?: string;
  codeAt?: number;
  botNumber?: string;
  ownerNumber?: string;
  error?: string;
}
const st: WaWebState = { state: 'off' };
export const waWebState = () => ({ ...st });

let sock: any = null;
let B: any = null;
let host: HostOptions = {};
let starting = false;

export async function ownerNumber() {
  return normalizePhone((await kvGet('owner_number')) || process.env.WHATSAPP_OWNER_NUMBER || '');
}
export async function botNumber() {
  return normalizePhone((await kvGet('bot_number')) || process.env.ASSISTANT_WA_NUMBER || '');
}

export async function saveNumbers(owner: string, bot: string) {
  if (owner) await kvSet('owner_number', normalizePhone(owner));
  if (bot) await kvSet('bot_number', normalizePhone(bot));
}

const digitsOf = (jid?: string | null) => (jid ? jid.split('@')[0].split(':')[0] : '');

async function transcribe(data: Buffer, mime: string) {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const r = await openai.audio.transcriptions.create({ file: await toFile(data, mime.includes('mp4') ? 'voice.m4a' : 'voice.ogg'), model: 'whisper-1', language: 'he' });
  return r.text;
}

async function onMessage(m: any) {
  if (!m.message || m.key.fromMe) return;
  const jid: string = m.key.remoteJid || '';
  if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;

  // Newer WhatsApp hides numbers behind "lid" ids; the phone-number form comes in the *Alt fields.
  const owner = await ownerNumber();
  const candidates = [m.key.remoteJidAlt, m.key.senderPn, m.key.participantAlt, jid].map(digitsOf);
  if (!owner || !candidates.includes(owner)) {
    console.warn('[ASSISTANT] ignored a WhatsApp message from someone who is not the owner');
    return;
  }
  if (await db.assistantMessage.findUnique({ where: { waId: m.key.id } })) return;

  const msg = m.message.ephemeralMessage?.message || m.message.viewOnceMessage?.message || m.message;
  let text = msg.conversation || msg.extendedTextMessage?.text || '';
  const images: { data: string; mime: string }[] = [];
  const pdfs: { data: string; name?: string }[] = [];
  const reply = (t: string) => sock.sendMessage(jid, { text: t });

  try {
    await sock.readMessages([m.key]);
    await sock.sendPresenceUpdate('composing', jid);
    const download = () => B.downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
    if (msg.audioMessage) {
      const said = await transcribe(await download(), msg.audioMessage.mimetype || 'audio/ogg');
      if (said === null) return void (await reply('אני עוד לא שומע הודעות קוליות. בינתיים כתוב לי בטקסט 🙏'));
      text = `(הודעה קולית, תומללה) ${said}`;
    } else if (msg.imageMessage) {
      images.push({ data: (await download()).toString('base64'), mime: (msg.imageMessage.mimetype || 'image/jpeg').split(';')[0] });
      text = msg.imageMessage.caption || '';
    } else if (msg.documentMessage || msg.documentWithCaptionMessage) {
      const doc = msg.documentMessage || msg.documentWithCaptionMessage.message.documentMessage;
      if (!String(doc.mimetype).includes('pdf')) return void (await reply('אני יודע לקרוא כרגע רק קבצי PDF ותמונות.'));
      pdfs.push({ data: (await download()).toString('base64'), name: doc.fileName });
      text = doc.caption || '';
    } else if (!text) {
      return void (await reply('קיבלתי, אבל את סוג ההודעה הזה אני עוד לא יודע לקרוא. כתוב לי בטקסט.'));
    }
  } catch (err: any) {
    console.error('[ASSISTANT] media failed:', err?.message || err);
    return void (await reply('לא הצלחתי לפתוח את מה ששלחת. נסה שוב.'));
  }

  // Keep "typing…" alive while the assistant works.
  const typing = setInterval(() => sock?.sendPresenceUpdate('composing', jid).catch(() => undefined), 8000);
  try {
    const answer = await handleOwnerMessage({ text, images, pdfs, waId: m.key.id, at: new Date() }, host);
    await reply(answer);
  } finally {
    clearInterval(typing);
    sock?.sendPresenceUpdate('paused', jid).catch(() => undefined);
  }
}

/** Connects (or reconnects) the assistant's WhatsApp. Safe to call again. */
export async function startWaWeb(h: HostOptions) {
  host = h;
  if (starting) return;
  starting = true;
  try {
    B ||= await importEsm('baileys');
    const makeWASocket = B.default || B.makeWASocket;
    fs.mkdirSync(authDir(), { recursive: true });
    const { state, saveCreds } = await B.useMultiFileAuthState(authDir());
    const { version } = await B.fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    st.state = 'connecting';
    st.botNumber = await botNumber();
    st.ownerNumber = await ownerNumber();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: B.Browsers.windows('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock.ev.on('creds.update', saveCreds);

    let asked = false;
    sock.ev.on('connection.update', async (u: any) => {
      if (u.qr && !state.creds.registered && !asked) {
        asked = true;
        await requestCode(false);
      }
      if (u.connection === 'open') {
        st.state = 'connected';
        st.code = undefined;
        console.log('[ASSISTANT] WhatsApp connected ✓');
      }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        sock = null;
        if (code === B.DisconnectReason.loggedOut) {
          st.state = 'logged_out';
          fs.rmSync(authDir(), { recursive: true, force: true });
          console.warn('[ASSISTANT] WhatsApp was unlinked from the phone. Link again from the chat window.');
          return;
        }
        st.state = 'connecting';
        setTimeout(() => startWaWeb(host).catch(() => undefined), 3000);
      }
    });
    sock.ev.on('messages.upsert', ({ messages, type }: any) => {
      if (type !== 'notify') return;
      for (const m of messages) onMessage(m).catch((err) => console.error('[ASSISTANT] WhatsApp message failed:', err?.message || err));
    });
  } finally {
    starting = false;
  }
}

/** Asks WhatsApp for a fresh 8-character pairing code for the assistant's number. */
export async function requestCode(fromOwner = true) {
  const bot = await botNumber();
  st.botNumber = bot;
  if (!bot) {
    st.state = 'waiting_for_code';
    st.error = fromOwner ? 'חסר המספר של העוזר' : undefined;
    return st;
  }
  if (!sock) await startWaWeb(host);
  try {
    const code: string = await sock.requestPairingCode(bot);
    st.state = 'waiting_for_code';
    st.code = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    st.codeAt = Date.now();
    st.error = undefined;
    console.log(`\n[ASSISTANT] WhatsApp pairing code for ${bot}: ${st.code}\n`);
  } catch (err: any) {
    st.error = String(err?.message || err);
    console.error('[ASSISTANT] pairing code failed:', st.error);
  }
  return st;
}

/** After the owner changes numbers or the link was removed: start over with a clean link. */
export async function relink() {
  try {
    sock?.end?.(undefined);
  } catch {
    /* ignore */
  }
  sock = null;
  fs.rmSync(authDir(), { recursive: true, force: true });
  await startWaWeb(host);
}

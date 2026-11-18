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
// Every socket gets a generation number. Events from an older socket (one we replaced on purpose)
// are ignored, so closing the old link can never break the new one.
let gen = 0;
let wantCode = false;

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
  // Remember the chat the owner writes from, so reminders and the morning brief reach the same chat.
  if ((await kvGet('owner_jid')) !== jid) await kvSet('owner_jid', jid);

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

/** Connects (or reconnects) the assistant's WhatsApp. */
export async function startWaWeb(h: HostOptions) {
  host = h;
  const my = ++gen;
  B ||= await importEsm('baileys');
  const makeWASocket = B.default || B.makeWASocket;
  fs.mkdirSync(authDir(), { recursive: true });
  const { state, saveCreds } = await B.useMultiFileAuthState(authDir());
  const { version } = await B.fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  if (my !== gen) return; // replaced while starting
  st.botNumber = await botNumber();
  st.ownerNumber = await ownerNumber();
  // Not linked yet and nobody asked for a code: wait for the owner to press the button.
  if (!state.creds.registered && !wantCode) {
    st.state = 'waiting_for_code';
    return;
  }
  st.state = state.creds.registered ? 'connecting' : 'waiting_for_code';

  const s = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: B.Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock = s;
  s.ev.on('creds.update', saveCreds);

  s.ev.on('connection.update', async (u: any) => {
    if (my !== gen) return;
    // The socket is ready to pair once WhatsApp offers a QR; that is when a code can be asked for.
    if (u.qr && !state.creds.registered && wantCode) {
      wantCode = false;
      await askForCode(s);
    }
    if (u.connection === 'open') {
      st.state = 'connected';
      st.code = undefined;
      st.error = undefined;
      console.log('[ASSISTANT] WhatsApp connected ✓');
    }
    if (u.connection === 'close') {
      const status = u.lastDisconnect?.error?.output?.statusCode;
      if (sock === s) sock = null;
      if (status === B.DisconnectReason.loggedOut && state.creds.registered) {
        st.state = 'logged_out';
        fs.rmSync(authDir(), { recursive: true, force: true });
        console.warn('[ASSISTANT] WhatsApp was unlinked from the phone. Link again from the chat window.');
        return;
      }
      // Includes the normal restart WhatsApp asks for right after a successful pairing.
      setTimeout(() => {
        if (my === gen) startWaWeb(host).catch((err) => console.error('[ASSISTANT] reconnect failed:', err?.message || err));
      }, 2000);
    }
  });
  s.ev.on('messages.upsert', ({ messages, type }: any) => {
    if (my !== gen || type !== 'notify') return;
    for (const m of messages) onMessage(m).catch((err) => console.error('[ASSISTANT] WhatsApp message failed:', err?.message || err));
  });
}

async function askForCode(s: any) {
  try {
    const code: string = await s.requestPairingCode(st.botNumber);
    st.state = 'waiting_for_code';
    st.code = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    st.codeAt = Date.now();
    st.error = undefined;
    console.log(`\n[ASSISTANT] WhatsApp pairing code for ${st.botNumber}: ${st.code}\n`);
  } catch (err: any) {
    st.error = String(err?.message || err);
    console.error('[ASSISTANT] pairing code failed:', st.error);
  }
}

/**
 * Starts a clean link and waits (up to 25 s) for WhatsApp to hand out a pairing code.
 * Used for the first link and for "give me a new code".
 */
export async function requestCode() {
  const bot = await botNumber();
  st.botNumber = bot;
  st.code = undefined;
  if (!bot) {
    st.error = 'חסר המספר של העוזר';
    return waWebState();
  }
  st.error = undefined;
  const old = sock;
  gen++; // silence the old socket before closing it
  sock = null;
  try {
    old?.end?.(undefined);
  } catch {
    /* ignore */
  }
  fs.rmSync(authDir(), { recursive: true, force: true });
  wantCode = true;
  await startWaWeb(host);
  for (let i = 0; i < 50 && !st.code && !st.error; i++) await new Promise((r) => setTimeout(r, 500));
  if (!st.code && !st.error) st.error = 'וואטסאפ לא החזיר קוד. נסה שוב בעוד דקה.';
  return waWebState();
}

/** Sends a message the assistant starts on its own (reminder, morning brief). False when WhatsApp isn't linked. */
export async function sendToOwner(text: string) {
  if (!sock || st.state !== 'connected') return false;
  const jid = (await kvGet('owner_jid')) || `${await ownerNumber()}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
  return true;
}

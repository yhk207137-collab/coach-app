// Personal WhatsApp assistant — a self-contained module.
// It shares only the server process with the app around it (to avoid paying for another server).
// It has its own tables, its own Google grant and its own routes, and reads none of the app's data.
// Embedding it fully in a business app later = pass hostTools (see host.ts and ASSISTANT.md).
import express, { Express, Router } from 'express';
import OpenAI, { toFile } from 'openai';
import type { HostOptions } from './host';
import { db } from './store';
import { CHAT_PAGE } from './chatPage';
import { brainConfigured, handleOwnerMessage } from './brain';
import { finishGoogleConnect, googleAuthUrlFor, googleCallbackPath } from './google';
import { downloadMedia, isOwner, markReadAndTyping, sendText, validSignature, waConfigured } from './whatsapp';

export type { HostTool, HostOptions } from './host';

async function transcribe(data: Buffer, mime: string) {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg';
  const r = await openai.audio.transcriptions.create({ file: await toFile(data, `voice.${ext}`), model: 'whisper-1', language: 'he' });
  return r.text;
}

async function handleIncoming(m: any, host: HostOptions) {
  const from: string = m.from;
  if (!isOwner(from)) {
    console.warn(`[ASSISTANT] ignored a message from a number that is not the owner (${String(from).slice(0, 5)}…)`);
    return;
  }
  if (await db.assistantMessage.findUnique({ where: { waId: m.id } })) return; // Meta re-delivered it
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
  const stale = Date.now() - at.getTime() > 30 * 60 * 1000;

  await markReadAndTyping(m.id);

  let text = '';
  const images: { data: string; mime: string }[] = [];
  const pdfs: { data: string; name?: string }[] = [];
  try {
    switch (m.type) {
      case 'text':
        text = m.text?.body || '';
        break;
      case 'audio': {
        const media = await downloadMedia(m.audio.id);
        const said = await transcribe(media.data, media.mime);
        if (said === null) {
          await sendText(from, 'אני עוד לא שומע הודעות קוליות. בינתיים כתוב לי בטקסט 🙏');
          return;
        }
        text = `(הודעה קולית, תומללה) ${said}`;
        break;
      }
      case 'image': {
        const media = await downloadMedia(m.image.id);
        images.push({ data: media.data.toString('base64'), mime: media.mime.split(';')[0] });
        text = m.image.caption || '';
        break;
      }
      case 'document': {
        const media = await downloadMedia(m.document.id);
        if (!media.mime.includes('pdf')) {
          await sendText(from, 'אני יודע לקרוא כרגע רק קבצי PDF ותמונות.');
          return;
        }
        pdfs.push({ data: media.data.toString('base64'), name: m.document.filename });
        text = m.document.caption || '';
        break;
      }
      default:
        await sendText(from, 'קיבלתי, אבל את סוג ההודעה הזה אני עוד לא יודע לקרוא. כתוב לי בטקסט.');
        return;
    }
  } catch (err: any) {
    console.error('[ASSISTANT] media failed:', err?.message || err);
    await sendText(from, 'לא הצלחתי לפתוח את הקובץ ששלחת. נסה לשלוח שוב.');
    return;
  }

  if (stale) text = `(ההודעה נשלחה ב-${at.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })} ורק עכשיו הגיעה אליי) ${text}`;
  const reply = await handleOwnerMessage({ text, images, pdfs, waId: m.id, at: new Date() }, host);
  await sendText(from, reply);
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,Arial;max-width:460px;margin:15vh auto;padding:0 20px;text-align:center;color:#1e293b"><h2>${title}</h2><p style="color:#475569;line-height:1.6">${body}</p></body></html>`;

/**
 * Adds the assistant to an Express app. Call it before express.json() so the webhook
 * can check Meta's signature on the raw bytes.
 */
export function mountAssistant(app: Express, host: HostOptions = {}) {
  const r = Router();

  // WhatsApp webhook (Meta). Raw body for the signature check.
  r.get('/whatsapp', (req, res) => {
    const okToken = req.query['hub.mode'] === 'subscribe' && !!process.env.WHATSAPP_VERIFY_TOKEN && req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN;
    if (!okToken) return res.sendStatus(403);
    res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  });
  r.post('/whatsapp', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
    const raw = req.body as Buffer;
    if (!validSignature(raw, req.get('x-hub-signature-256'))) return res.sendStatus(401);
    res.sendStatus(200); // Meta wants a fast answer; the work continues in the background
    let body: any;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    const messages = (body?.entry || []).flatMap((e: any) => (e.changes || []).flatMap((c: any) => c.value?.messages || []));
    for (const m of messages) {
      handleIncoming(m, host).catch(async (err) => {
        console.error('[ASSISTANT] handling failed:', err);
        if (isOwner(m.from)) await sendText(m.from, 'משהו השתבש אצלי. נסה שוב בעוד רגע.').catch(() => undefined);
      });
    }
  });

  // Google connect: the assistant sends the owner a one-time link on WhatsApp.
  r.get('/google/start', (req, res) => {
    const url = googleAuthUrlFor(String(req.query.t || ''));
    if (!url) return res.status(410).send(page('הקישור פג תוקף', 'בקש מהעוזר בוואטסאפ קישור חדש לחיבור גוגל.'));
    res.redirect(url);
  });
  r.get(googleCallbackPath.replace('/api/assistant', ''), async (req, res) => {
    try {
      await finishGoogleConnect(String(req.query.code || ''), String(req.query.state || ''));
      res.send(page('גוגל חובר לעוזר ✓', 'היומן והמייל מחוברים. אפשר לחזור לוואטסאפ.'));
    } catch (err: any) {
      res.status(400).send(page('החיבור לא הצליח', String(err?.message || 'נסה שוב עם קישור חדש מהעוזר.')));
    }
  });

  // Health check without secrets.
  r.get('/health', (_req, res) => res.json({ brain: brainConfigured(), whatsapp: waConfigured() }));

  // Local trial: a chat window on the owner's computer, same brain as WhatsApp.
  // Answers only requests addressed to localhost, so it is never reachable through the public tunnel.
  if (host.localChat) {
    const local = (req: express.Request) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.get('host') || '');
    r.post('/chat', express.json(), async (req, res) => {
      if (!local(req)) return res.sendStatus(404);
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'empty' });
      res.json({ reply: await handleOwnerMessage({ text }, host) });
    });
    r.get('/chat/history', async (req, res) => {
      if (!local(req)) return res.sendStatus(404);
      const [messages, memories] = await Promise.all([
        db.assistantMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
        db.assistantMemory.findMany({ orderBy: { createdAt: 'asc' } }),
      ]);
      res.json({ messages: messages.reverse(), memories, brain: brainConfigured(), whatsapp: waConfigured() });
    });
    app.get('/', (req, res) => (local(req) ? res.type('html').send(CHAT_PAGE) : res.sendStatus(404)));
  }

  app.use('/api/assistant', r);
}

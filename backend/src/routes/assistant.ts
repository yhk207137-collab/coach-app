import { Router } from 'express';
import OpenAI, { toFile } from 'openai';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach } from '../middleware/auth';
import { brainConfigured, handleOwnerMessage, spentToday } from '../services/assistant/brain';
import { downloadMedia, isOwner, markReadAndTyping, sendText, validSignature, waConfigured } from '../services/assistant/whatsapp';
import { zoomConfigured } from '../services/assistant/zoom';
import { hasGmailAccess, isCalendarConnected } from '../services/calendar';

// ── WhatsApp webhook (called by Meta) ───────────────────────────────────────

export const whatsappWebhook = Router();

whatsappWebhook.get('/', (req, res) => {
  const ok =
    req.query['hub.mode'] === 'subscribe' &&
    !!process.env.WHATSAPP_VERIFY_TOKEN &&
    req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN;
  if (!ok) return res.sendStatus(403);
  res.status(200).send(String(req.query['hub.challenge'] ?? ''));
});

async function transcribe(data: Buffer, mime: string) {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg';
  const r = await openai.audio.transcriptions.create({ file: await toFile(data, `voice.${ext}`), model: 'whisper-1', language: 'he' });
  return r.text;
}

async function handleIncoming(m: any) {
  const from: string = m.from;
  if (!isOwner(from)) {
    console.warn(`[WHATSAPP] ignored a message from a number that is not the owner (${String(from).slice(0, 5)}…)`);
    return;
  }
  if (await prisma.assistantMessage.findUnique({ where: { waId: m.id } })) return; // Meta re-delivered it
  // After downtime Meta delivers a backlog; anything older than 30 minutes is too stale to act on blindly.
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
          await sendText(from, 'עוד לא הוגדר לי תמלול הודעות קוליות. בינתיים כתוב לי בטקסט 🙏');
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
    console.error('[WHATSAPP] media failed:', err?.message || err);
    await sendText(from, 'לא הצלחתי לפתוח את הקובץ ששלחת. נסה לשלוח שוב.');
    return;
  }

  if (stale) text = `(ההודעה נשלחה לפני זמן מה, ב-${at.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}, ורק עכשיו הגיעה אליי) ${text}`;
  const reply = await handleOwnerMessage({ text, images, pdfs, waId: m.id, at: new Date() });
  await sendText(from, reply);
}

whatsappWebhook.post('/', (req: any, res) => {
  if (!validSignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200); // Meta wants a fast answer; the work continues in the background
  const messages = (req.body?.entry || []).flatMap((e: any) => (e.changes || []).flatMap((c: any) => c.value?.messages || []));
  for (const m of messages) {
    handleIncoming(m).catch(async (err) => {
      console.error('[WHATSAPP] handling failed:', err);
      if (isOwner(m.from)) await sendText(m.from, 'משהו השתבש אצלי. נסה שוב בעוד רגע.').catch(() => undefined);
    });
  }
});

// ── Owner screen in the CRM ─────────────────────────────────────────────────

const router = Router();
router.use(requireAuth, requireCoach);

router.get('/status', async (_req, res) => {
  const monthStart = new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(new Date()).slice(0, 8) + '01T00:00:00+02:00');
  const [calendar, gmail, today, month, memories] = await Promise.all([
    isCalendarConnected().catch(() => false),
    hasGmailAccess().catch(() => false),
    spentToday(),
    prisma.assistantUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart } } }),
    prisma.assistantMemory.count(),
  ]);
  res.json({
    brain: brainConfigured(),
    whatsapp: waConfigured() && !!process.env.WHATSAPP_APP_SECRET && !!process.env.WHATSAPP_VERIFY_TOKEN,
    calendar,
    gmail: calendar && gmail,
    zoom: zoomConfigured(),
    voice: !!process.env.OPENAI_API_KEY,
    spentTodayUsd: today,
    spentMonthUsd: month._sum.costUsd || 0,
    dailyCapUsd: Number(process.env.ASSISTANT_DAILY_USD || 5),
    memories,
    webhookUrl: `${process.env.PUBLIC_URL || ''}/api/whatsapp/webhook`,
  });
});

router.get('/memories', async (_req, res) => {
  res.json(await prisma.assistantMemory.findMany({ orderBy: { createdAt: 'desc' } }));
});

router.delete('/memories/:id', async (req, res) => {
  await prisma.assistantMemory.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

router.post('/memories', async (req, res) => {
  const fact = String(req.body?.fact || '').trim();
  if (!fact) return res.status(400).json({ error: 'חסר טקסט' });
  res.json(await prisma.assistantMemory.create({ data: { fact, topic: String(req.body?.topic || 'כללי') } }));
});

router.get('/messages', async (_req, res) => {
  const rows = await prisma.assistantMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 60 });
  res.json(rows.reverse());
});

// Talk to the assistant from the CRM (same brain as WhatsApp), handy for testing.
router.post('/chat', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'חסר טקסט' });
  res.json({ reply: await handleOwnerMessage({ text }) });
});

export default router;

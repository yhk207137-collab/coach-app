// "Get the guide by email" for people who have email but no browser (many kosher email accounts).
// A mailto button opens a ready email to the owner's reply address; this module finds those requests
// in the connected Gmail, adds/updates the contact, and sends the welcome email with the guide attached.
import { prisma } from '../lib/prisma';
import { sendEmail, sendingDomainStatus, fromEmailAddress } from '../lib/email';
import { gmailState, listIncomingMail, labelHandled } from './gmailInbox';
import { isQuietTime } from '../assistant/time';
import { getMarketingSettings, getWelcomeCampaign, buildForSend, guideAttachment, getBaseUrl, processQueue } from './marketing';
import { GUIDE_MAIL_SUBJECT, GUIDE_MAIL_LABEL, guideMailButtonHtml } from './guideMailLink';
export * from './guideMailLink';

const LIST = 'המדריך לעמותה מנצחת';
const HOURLY_LIMIT = parseInt(process.env.GUIDE_MAIL_HOURLY_LIMIT || '50');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;

// ── Status (for the screen) ─────────────────────────────────────────────────

export async function guideMailStatus() {
  const [settings, welcome, gm] = await Promise.all([getMarketingSettings(), getWelcomeCampaign(), gmailState()]);
  const connected = gm.address;
  const address = (settings.replyTo || '').trim().toLowerCase();
  const problems: string[] = [];
  if (!address) problems.push('אין כתובת למענה בהגדרות הדיוור. הכפתור צריך כתובת שאליה יישלחו הבקשות.');
  if (!connected && gm.error) problems.push(`ג'ימייל חובר, אבל גוגל לא מאפשר לקרוא ממנו. ייתכן שצריך להפעיל את Gmail API בפרויקט של גוגל (Google Cloud ← APIs & Services ← Enable APIs ← Gmail API). השגיאה מגוגל: ${gm.error}`);
  else if (!connected) problems.push('ג\'ימייל לא מחובר למערכת, ולכן היא לא יכולה לקרוא את הבקשות. לחץ "חיבור ג\'ימייל" והתחבר עם החשבון של ' + (address || 'כתובת המענה') + '.');
  else if (address && connected !== address) problems.push(`הבקשות יישלחו אל ${address}, אבל הג'ימייל שמחובר למערכת הוא ${connected}. צריך שזו תהיה אותה כתובת: לשנות את "כתובת למענה" בהגדרות הדיוור, או לחבר את הג'ימייל הנכון.`);
  if (welcome.status !== 'ACTIVE') problems.push('המייל האוטומטי עם המדריך כבוי. בקשות שיגיעו ימתינו עד שיופעל.');
  if (!settings.guideUrl) problems.push('קובץ המדריך עוד לא הועלה.');
  return { address, gmailAddress: connected, gmailConnected: !!connected, ready: problems.length === 0, problems, welcomeActive: welcome.status === 'ACTIVE' };
}

// ── Handling requests ───────────────────────────────────────────────────────

function parseFrom(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : from).trim().toLowerCase();
  const name = (m ? m[1] : '').trim();
  return { email, name: name && !name.includes('@') ? name : '' };
}

function parseName(body: string) {
  const m = body.match(/שמי\s*[:：]\s*([^\r\n]*)/);
  const n = (m?.[1] || '').replace(/[_\-–.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n.length >= 2 && n.length <= 60 ? n : '';
}

const consentLine = (body: string) => body.split(/\r?\n/).find((l) => l.includes('מסכים לקבל עדכונים'))?.trim().slice(0, 500) || '';

let running = false;

export async function processGuideMailRequests() {
  if (running) return { handled: 0, skipped: 'busy' as const };
  running = true;
  let handled = 0;
  try {
    const status = await guideMailStatus();
    if (!status.address || !status.gmailAddress || status.gmailAddress !== status.address) return { handled, skipped: 'not-connected' as const };
    if (!status.welcomeActive) return { handled, skipped: 'welcome-off' as const };
    if (!(await sendingDomainStatus()).ready) return { handled, skipped: 'domain' as const };

    const messages = await listIncomingMail(`subject:"${GUIDE_MAIL_SUBJECT}" newer_than:14d -in:sent -in:drafts -in:chats`, 50);
    if (!messages.length) return { handled, skipped: null };
    const seen = new Set((await prisma.mailRequest.findMany({ where: { gmailId: { in: messages.map((m) => m.id) } }, select: { gmailId: true } })).map((r) => r.gmailId));
    const own = new Set([status.address, status.gmailAddress, fromEmailAddress().toLowerCase()]);
    const settings = await getMarketingSettings();
    const welcome = await getWelcomeCampaign();
    const base = await getBaseUrl();

    for (const msg of messages.reverse()) { // oldest first
      if (seen.has(msg.id)) continue;
      const lastHour = await prisma.mailRequest.count({ where: { status: { in: ['queued', 'sent'] }, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      if (lastHour >= HOURLY_LIMIT) break; // the rest wait for the next round

      const { email, name: fromName } = parseFrom(msg.from);
      const subjectOk = msg.subject.trim().startsWith(GUIDE_MAIL_SUBJECT);
      const record = (status: string, extra: Record<string, unknown> = {}) =>
        prisma.mailRequest.create({ data: { gmailId: msg.id, email: email.slice(0, 120), receivedAt: msg.receivedAt, status, ...extra } });

      if (!subjectOk || msg.automatic || !EMAIL_RE.test(email) || own.has(email) || /(no-?reply|mailer-daemon|postmaster|bounce)/i.test(email)) {
        await record('ignored', { note: !subjectOk ? 'נושא אחר' : msg.automatic ? 'תשובה אוטומטית' : 'כתובת שולח לא מתאימה' });
        // A mail with another subject is not ours to file away: it stays in the inbox as it was.
        if (subjectOk) await labelHandled(msg.id, GUIDE_MAIL_LABEL).catch(() => undefined);
        continue;
      }

      const name = parseName(msg.body) || fromName || null;
      const consent = !!consentLine(msg.body);
      const tag = msg.subject.match(/\[([a-z0-9-]{2,30})\]/i)?.[1]?.toLowerCase();
      const code = tag && CODE_RE.test(tag) && (await prisma.promotion.findUnique({ where: { code: tag } })) ? tag : null;

      const recent = await prisma.mailRequest.findFirst({ where: { email, status: { in: ['queued', 'sent'] }, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
      if (recent) {
        await record('duplicate', { name, code, consent, note: 'כבר קיבל את המדריך ב־24 השעות האחרונות' });
        await labelHandled(msg.id, GUIDE_MAIL_LABEL).catch(() => undefined);
        continue;
      }

      try {
        // The contact: the same fields a sign-up on the landing page gets, with the email itself as the consent.
        const consentData = consent
          ? { consentAt: msg.receivedAt, consentText: consentLine(msg.body), consentPage: 'mail', consentIp: '', consentMethod: 'email-request' }
          : {};
        const existing = await prisma.contact.findUnique({ where: { email } });
        let contact;
        if (!existing) {
          contact = await prisma.contact.create({
            data: {
              email, name, source: code || 'בקשה במייל', tags: [LIST],
              status: consent ? 'SUBSCRIBED' : 'NO_CONSENT',
              ...(consent ? consentData : { consentMethod: 'email-request-no-list' }),
            },
          });
        } else {
          const rejoin = consent && ['UNSUBSCRIBED', 'NO_CONSENT', 'BOUNCED'].includes(existing.status);
          contact = await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: existing.name || name,
              tags: existing.tags.includes(LIST) ? existing.tags : [...existing.tags, LIST],
              ...(rejoin ? { status: 'SUBSCRIBED', unsubscribedAt: null, ...consentData } : {}),
            },
          });
        }

        // Through the welcome automation when possible (opens and downloads are tracked);
        // directly otherwise (no consent for the list, or the welcome email already went to them once).
        const alreadyWelcomed = await prisma.campaignSend.findUnique({ where: { campaignId_contactId: { campaignId: welcome.id, contactId: contact.id } } });
        if (contact.status === 'SUBSCRIBED' && !alreadyWelcomed) {
          await prisma.campaignSend.create({ data: { campaignId: welcome.id, contactId: contact.id, email } });
          await record('queued', { name, code, consent, contactId: contact.id });
        } else {
          const built = buildForSend(welcome, contact, null, base, settings);
          await sendEmail(email, built.subject, built.html, await guideAttachment(settings), {
            logAs: 'המדריך (בקשה במייל)',
            logGroup: `campaign:${welcome.id}`,
            fromName: welcome.fromName || settings.senderName,
            replyTo: settings.replyTo || undefined,
            text: built.text,
            idempotencyKey: `guide-mail-${msg.id}`,
          });
          await record('sent', { name, code, consent, contactId: contact.id });
        }
        handled++;
      } catch (err: any) {
        await record('failed', { name, code, consent, note: String(err?.message || err).slice(0, 300) }).catch(() => undefined);
        console.error('[GUIDE-MAIL] request failed', msg.id, err?.message || err);
      }
      await labelHandled(msg.id, GUIDE_MAIL_LABEL).catch((e) => console.error('[GUIDE-MAIL] label:', e?.message || e));
    }
    if (handled) setTimeout(() => void processQueue(), 500);
    return { handled, skipped: null };
  } finally {
    running = false;
  }
}

// How often to look for requests: every 5 minutes in the two days after a promotion (when most
// requests arrive) or right after one came in, every 30 minutes otherwise, and not at all on
// Shabbat / Yom Tov (requests from then are handled when it ends).
const FAST = 5 * 60_000, SLOW = 30 * 60_000;

export async function guideMailSchedule(now = new Date()) {
  if (isQuietTime(now)) return { mode: 'quiet' as const, every: 0, label: 'מושהה בשבת ובחג. הבקשות יטופלו במוצאי שבת או חג.' };
  const [promo, recent] = await Promise.all([
    prisma.promotion.findFirst({ where: { date: { gte: new Date(now.getTime() - 2 * 24 * 3600_000), lte: new Date(now.getTime() + 12 * 3600_000) } }, select: { name: true } }),
    prisma.mailRequest.findFirst({ where: { status: { in: ['queued', 'sent'] }, createdAt: { gte: new Date(now.getTime() - 2 * 3600_000), lte: now } }, select: { id: true } }),
  ]);
  if (promo) return { mode: 'fast' as const, every: FAST, label: `נבדק כל 5 דקות, כי יש פרסום מהיומיים האחרונים ("${promo.name}").` };
  if (recent) return { mode: 'fast' as const, every: FAST, label: 'נבדק כל 5 דקות, כי הגיעו בקשות בשעתיים האחרונות.' };
  return { mode: 'slow' as const, every: SLOW, label: 'נבדק כל חצי שעה. ביומיים שאחרי פרסום – כל 5 דקות.' };
}

let lastRound = 0;
export function startGuideMailWorker() {
  const tick = async () => {
    try {
      const { every } = await guideMailSchedule();
      if (!every || Date.now() - lastRound < every - 30_000) return;
      lastRound = Date.now();
      await processGuideMailRequests();
    } catch (e: any) {
      console.error('[GUIDE-MAIL] round failed:', e?.message || e);
    }
  };
  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), FAST);
}

export const guideMailButtonPreview = (to: string, code?: string | null) =>
  `<!doctype html><html dir="rtl"><body style="margin:0;padding:24px;background:#f1f5f9;">${guideMailButtonHtml(to, code)}</body></html>`;

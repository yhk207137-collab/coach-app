import { prisma } from '../lib/prisma';
import { asyncRouter } from '../lib/asyncRouter';
import { normalizeEmail } from './marketing';
import { enqueueWelcome, rememberBaseUrl, verifyClick, getMarketingSettings, isGuideUrl } from '../services/marketing';
import { safeUrl } from '../services/emailRender';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const str = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').trim();
  return s ? s.slice(0, max) : null;
};
const visitorId = (v: unknown) => {
  const s = String(v ?? '');
  return /^[A-Za-z0-9_-]{8,40}$/.test(s) ? s : null;
};
const maskEmail = (e: string) => {
  const [user, domain] = e.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
};

// ── /api/public ─────────────────────────────────────────────────────────────

export const publicRouter = asyncRouter();

publicRouter.post('/subscribe', async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const email = normalizeEmail(b.email);
  if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ ok: false, error: 'invalid-email' });
  void rememberBaseUrl(`${req.protocol}://${req.get('host')}`).catch(() => {});

  const name = str(b.name, 80);
  const list = str(b.list, 40);
  // "checkbox" = the person actively ticked an explicit consent box; "form" = older form without one.
  const consent = {
    consentAt: new Date(),
    consentText: str(b.consent, 500) || 'נרשם/ה בטופס ההרשמה לדיוור',
    consentPage: str(b.page, 300),
    consentIp: String(req.ip || '').slice(0, 64),
    consentMethod: b.agree === 'yes' ? 'checkbox' : 'form',
  };

  const existing = await prisma.contact.findUnique({ where: { email } });
  let contactId: string;
  let shouldWelcome = false;
  if (!existing) {
    const created = await prisma.contact.create({
      data: { email, name, phone: str(b.phone, 30), source: str(b.source, 60) || 'דף נחיתה', tags: list ? [list] : [], ...consent },
    });
    contactId = created.id;
    shouldWelcome = true;
  } else {
    const resubscribed = existing.status !== 'SUBSCRIBED';
    await prisma.contact.update({
      where: { id: existing.id },
      data: {
        name: existing.name || name,
        tags: list && !existing.tags.includes(list) ? [...existing.tags, list] : existing.tags,
        ...(resubscribed ? { status: 'SUBSCRIBED', unsubscribedAt: null, ...consent } : {}),
      },
    });
    contactId = existing.id;
    shouldWelcome = resubscribed;
  }
  const vid = visitorId(b.vid);
  if (vid) await prisma.pageVisit.updateMany({ where: { visitorId: vid, contactId: null }, data: { contactId } });
  if (shouldWelcome) void enqueueWelcome(contactId, email).catch((e) => console.error('[MARKETING] welcome enqueue:', e?.message || e));
  res.json({ ok: true });
});

async function unsubscribeByToken(token: string, sendId?: string) {
  const contact = await prisma.contact.findUnique({ where: { unsubToken: token } });
  if (!contact) return null;
  if (contact.status === 'SUBSCRIBED') {
    await prisma.contact.update({ where: { id: contact.id }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
  }
  if (sendId) {
    await prisma.campaignSend.updateMany({ where: { id: sendId, contactId: contact.id, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
  }
  return contact;
}

publicRouter.get('/unsubscribe/:token', async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { unsubToken: req.params.token } });
  if (!contact) return res.status(404).json({ error: 'not-found' });
  res.json({ email: maskEmail(contact.email), subscribed: contact.status === 'SUBSCRIBED' });
});

// Also the RFC 8058 one-click target from the List-Unsubscribe header.
publicRouter.post('/unsubscribe/:token', async (req, res) => {
  const sendId = str(req.query.s ?? req.body?.s, 40) || undefined;
  const contact = await unsubscribeByToken(req.params.token, sendId);
  if (!contact) return res.status(404).json({ error: 'not-found' });
  res.json({ ok: true, email: maskEmail(contact.email) });
});

publicRouter.post('/resubscribe/:token', async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { unsubToken: req.params.token } });
  if (!contact) return res.status(404).json({ error: 'not-found' });
  if (contact.status !== 'SUBSCRIBED') {
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        status: 'SUBSCRIBED', unsubscribedAt: null, consentAt: new Date(), consentMethod: 'resubscribe',
        consentText: 'חזר/ה לרשימה בלחיצה על "חזרה לרשימה" בדף ההסרה', consentIp: String(req.ip || '').slice(0, 64),
      },
    });
  }
  res.json({ ok: true });
});

// ── /api/t (open pixel, click redirect, landing-page visits) ────────────────

export const trackingRouter = asyncRouter();

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const sendPixel = (res: import('express').Response) => {
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', 'Content-Length': String(PIXEL.length) });
  res.end(PIXEL);
};

// Hosts that report landing-page visits. Email links to them carry the send id (ys=), so the
// page can say who arrived from which email.
let landingHosts: { hosts: Set<string>; at: number } | null = null;
async function isLandingHost(host: string) {
  if (!landingHosts || Date.now() - landingHosts.at > 10 * 60_000) {
    const rows = await prisma.$queryRaw<{ host: string }[]>`
      SELECT DISTINCT split_part(page, '/', 1) AS host FROM "PageVisit" WHERE "createdAt" > now() - interval '90 days'`;
    landingHosts = { hosts: new Set(rows.map((r) => r.host)), at: Date.now() };
  }
  return landingHosts.hosts.has(host);
}

// The landing page loads this image once per view: v = the browser's visitor id, p = host + path,
// s = ?src= campaign source, r = referring site, e = send id when arriving from an email link.
trackingRouter.get('/v.gif', async (req, res) => {
  sendPixel(res);
  const vid = visitorId(req.query.v);
  const page = str(req.query.p, 200);
  if (!vid || !page || /bot|crawl|spider|preview|headless/i.test(String(req.get('user-agent') || ''))) return;

  let contactId: string | null = null;
  const fromEmail = str(req.query.e, 40);
  if (fromEmail) {
    const send = await prisma.campaignSend.findUnique({ where: { id: fromEmail }, select: { contactId: true } });
    if (send) {
      contactId = send.contactId;
      await prisma.pageVisit.updateMany({ where: { visitorId: vid, contactId: null }, data: { contactId } });
    }
  }
  // A refresh or a quick return is the same visit.
  const recent = await prisma.pageVisit.findFirst({
    where: { visitorId: vid, page, createdAt: { gte: new Date(Date.now() - 30 * 60_000) } },
    select: { id: true },
  });
  if (recent) return;
  if (!contactId) {
    const known = await prisma.pageVisit.findFirst({ where: { visitorId: vid, contactId: { not: null } }, select: { contactId: true } });
    contactId = known?.contactId ?? null;
  }
  await prisma.pageVisit.create({
    data: { visitorId: vid, contactId, page, source: str(req.query.s, 60), referrer: str(req.query.r, 120) },
  });
});

trackingRouter.get('/o/:file', async (req, res) => {
  const sendId = req.params.file.replace(/\.gif$/, '');
  sendPixel(res);
  const send = await prisma.campaignSend.findUnique({ where: { id: sendId }, select: { id: true, openedAt: true, status: true } });
  if (!send) return;
  await prisma.campaignSend.update({
    where: { id: send.id },
    data: {
      opens: { increment: 1 },
      openedAt: send.openedAt ?? new Date(),
      ...(send.status === 'SENT' ? { status: 'DELIVERED', deliveredAt: new Date() } : {}),
    },
  });
  if (!send.openedAt) await prisma.campaignEvent.create({ data: { sendId: send.id, type: 'open' } });
});

trackingRouter.get('/c/:sendId', async (req, res) => {
  const url = String(req.query.u || '');
  const sig = String(req.query.s || '');
  const target = safeUrl(url);
  if (!target || !/^https?:/i.test(target) || !verifyClick(req.params.sendId, url, sig)) {
    return res.status(400).send('קישור לא תקין');
  }
  let location = target;
  try {
    const u = new URL(target);
    if (await isLandingHost(u.host)) {
      if (!u.searchParams.has('src') && !u.searchParams.has('utm_source')) u.searchParams.set('src', 'email');
      u.searchParams.set('ys', req.params.sendId);
      location = u.toString();
    }
  } catch { /* plain redirect */ }
  res.redirect(302, location);
  const send = await prisma.campaignSend.findUnique({ where: { id: req.params.sendId }, select: { id: true, openedAt: true, clickedAt: true, downloadedAt: true, status: true } });
  if (!send) return;
  const now = new Date();
  const guide = isGuideUrl(target, (await getMarketingSettings()).guideUrl);
  await prisma.campaignSend.update({
    where: { id: send.id },
    data: {
      clicks: { increment: 1 },
      clickedAt: send.clickedAt ?? now,
      openedAt: send.openedAt ?? now,
      ...(guide && !send.downloadedAt ? { downloadedAt: now } : {}),
      ...(send.status === 'SENT' ? { status: 'DELIVERED', deliveredAt: now } : {}),
    },
  });
  await prisma.campaignEvent.create({ data: { sendId: send.id, type: guide ? 'download' : 'click', url: target.slice(0, 1000) } });
});

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendEmail, sendingDomainStatus, getResendDeliveryStatus, EmailError } from '../lib/email';
import { renderEmail, renderSubject, FooterInfo, BRAND_COLOR } from './emailRender';
import { welcomeDesign } from './emailStarters';

// ── Settings ────────────────────────────────────────────────────────────────

export interface MarketingSettings {
  senderName: string;
  replyTo: string;
  businessName: string;
  address: string;
  details: string;
  reason: string;
  brand: string;
  logoUrl: string;
}

const SETTINGS_KEY = 'marketing_settings';
// The purple default before the switch to the logo colors.
const OLD_BRAND_COLOR = '#6d28d9';
const BASE_URL_KEY = 'public_base_url';

export async function getMarketingSettings(): Promise<MarketingSettings> {
  const [row, coach] = await Promise.all([
    prisma.setting.findUnique({ where: { key: SETTINGS_KEY } }),
    prisma.user.findFirst({ where: { role: 'COACH' }, select: { email: true } }),
  ]);
  const saved = row ? (JSON.parse(row.value) as Partial<MarketingSettings>) : {};
  return {
    senderName: saved.senderName ?? 'יהושע כהן',
    replyTo: saved.replyTo ?? coach?.email ?? '',
    businessName: saved.businessName ?? 'יהושע כהן — אסטרטגיה וליווי לעמותות',
    address: saved.address ?? '',
    details: saved.details ?? 'לפרטים: 050-4167903',
    reason: saved.reason ?? 'קיבלת את המייל הזה כי נרשמת לדיוור "המדריך לעמותה מנצחת".',
    brand: saved.brand && saved.brand !== OLD_BRAND_COLOR ? saved.brand : BRAND_COLOR,
    logoUrl: saved.logoUrl ?? '',
  };
}

export async function saveMarketingSettings(patch: Partial<MarketingSettings>) {
  const current = await getMarketingSettings();
  const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const next: MarketingSettings = {
    senderName: patch.senderName !== undefined ? clean(patch.senderName, 60) : current.senderName,
    replyTo: patch.replyTo !== undefined ? clean(patch.replyTo, 120).toLowerCase() : current.replyTo,
    businessName: patch.businessName !== undefined ? clean(patch.businessName, 120) : current.businessName,
    address: patch.address !== undefined ? clean(patch.address, 160) : current.address,
    details: patch.details !== undefined ? clean(patch.details, 200) : current.details,
    reason: patch.reason !== undefined ? clean(patch.reason, 200) : current.reason,
    brand: patch.brand !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(patch.brand)) ? String(patch.brand) : current.brand,
    logoUrl: patch.logoUrl !== undefined ? clean(patch.logoUrl, 500) : current.logoUrl,
  };
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

const footerFrom = (s: MarketingSettings): FooterInfo => ({ businessName: s.businessName, address: s.address, details: s.details, reason: s.reason });

// ── Public URL used inside emails (links, pixel, unsubscribe) ────────────────

let cachedBaseUrl: string | null = null;

export async function rememberBaseUrl(origin: string) {
  if (!/^https:\/\//.test(origin) || origin === cachedBaseUrl) return;
  cachedBaseUrl = origin;
  await prisma.setting.upsert({ where: { key: BASE_URL_KEY }, create: { key: BASE_URL_KEY, value: origin }, update: { value: origin } });
}

export async function getBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (cachedBaseUrl) return cachedBaseUrl;
  const row = await prisma.setting.findUnique({ where: { key: BASE_URL_KEY } });
  cachedBaseUrl = row?.value || 'http://localhost:4000';
  return cachedBaseUrl;
}

// ── Tracking links ──────────────────────────────────────────────────────────

const sign = (value: string) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update(value).digest('hex').slice(0, 20);

export const verifyClick = (sendId: string, url: string, sig: string) => {
  const expected = sign(`${sendId}|${url}`);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
};

export function buildForSend(
  campaign: { design: Prisma.JsonValue; subject: string; preheader: string | null; markAsAd: boolean },
  contact: { name: string | null; email: string; unsubToken: string },
  sendId: string | null,
  base: string,
  settings: MarketingSettings
) {
  const merge = { name: contact.name, email: contact.email };
  const unsubscribeUrl = sendId
    ? `${base}/unsubscribe/${contact.unsubToken}?s=${sendId}`
    : `${base}/unsubscribe/preview`;
  const { html, text } = renderEmail(campaign.design, {
    merge,
    footer: footerFrom(settings),
    unsubscribeUrl,
    preheader: campaign.preheader,
    title: campaign.subject,
    trackLink: sendId ? (url) => `${base}/api/t/c/${sendId}?u=${encodeURIComponent(url)}&s=${sign(`${sendId}|${url}`)}` : undefined,
    openPixelUrl: sendId ? `${base}/api/t/o/${sendId}.gif` : undefined,
  });
  return {
    subject: renderSubject(campaign.subject, campaign.markAsAd, merge),
    html,
    text,
    oneClickUrl: `${base}/api/public/unsubscribe/${contact.unsubToken}${sendId ? `?s=${sendId}` : ''}`,
    unsubscribeUrl,
  };
}

// ── Audience ────────────────────────────────────────────────────────────────

export function audienceWhere(tags: string[]): Prisma.ContactWhereInput {
  return { status: 'SUBSCRIBED', ...(tags.length ? { tags: { hasSome: tags } } : {}) };
}

export async function startCampaign(campaignId: string, scheduledAt: Date | null) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const contacts = await prisma.contact.findMany({ where: audienceWhere(campaign.audienceTags), select: { id: true, email: true } });
  if (contacts.length === 0) throw new Error('אין נמענים רשומים בקהל שנבחר');
  await prisma.$transaction([
    prisma.campaignSend.createMany({
      data: contacts.map((c) => ({ campaignId, contactId: c.id, email: c.email })),
      skipDuplicates: true,
    }),
    prisma.campaign.update({
      where: { id: campaignId },
      data: scheduledAt
        ? { status: 'SCHEDULED', scheduledAt, baseUrl: await getBaseUrl() }
        : { status: 'SENDING', startedAt: new Date(), scheduledAt: null, baseUrl: await getBaseUrl() },
    }),
  ]);
  setTimeout(() => void processQueue(), 500);
  return contacts.length;
}

// ── Sending queue ───────────────────────────────────────────────────────────

export const DAILY_LIMIT = parseInt(process.env.EMAIL_DAILY_LIMIT || '90');

export async function sentInLast24h() {
  return prisma.campaignSend.count({ where: { sentAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let queueRunning = false;

export async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    await prisma.campaign.updateMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      data: { status: 'SENDING', startedAt: new Date() },
    });
    // Nothing is in flight while the lock is held, so a SENDING row was left by a restart; the
    // idempotency key on retry prevents a duplicate email.
    await prisma.campaignSend.updateMany({ where: { status: 'SENDING' }, data: { status: 'QUEUED' } });

    const domain = await sendingDomainStatus();
    if (!domain.ready) return;

    let remaining = DAILY_LIMIT - (await sentInLast24h());
    if (remaining <= 0) return;

    const settings = await getMarketingSettings();
    const base = await getBaseUrl();
    const sends = await prisma.campaignSend.findMany({
      where: { status: 'QUEUED', campaign: { status: { in: ['SENDING', 'ACTIVE'] } } },
      include: { contact: true, campaign: true },
      orderBy: { createdAt: 'asc' },
      take: Math.min(remaining, 40),
    });

    for (const send of sends) {
      if (send.contact.status !== 'SUBSCRIBED') {
        await prisma.campaignSend.update({ where: { id: send.id }, data: { status: 'SKIPPED', error: 'הנמען אינו רשום' } });
        continue;
      }
      await prisma.campaignSend.update({ where: { id: send.id }, data: { status: 'SENDING' } });
      const built = buildForSend(send.campaign, send.contact, send.id, send.campaign.baseUrl || base, settings);
      try {
        const resendId = await sendEmail(send.email, built.subject, built.html, [], {
          fromName: send.campaign.fromName || settings.senderName,
          replyTo: settings.replyTo || undefined,
          text: built.text,
          idempotencyKey: `send-${send.id}`,
          headers: {
            'List-Unsubscribe': `<${built.oneClickUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        await prisma.campaignSend.update({ where: { id: send.id }, data: { status: 'SENT', sentAt: new Date(), resendId, error: null } });
        remaining--;
      } catch (err: any) {
        if (err instanceof EmailError && err.status === 429) {
          await prisma.campaignSend.update({ where: { id: send.id }, data: { status: 'QUEUED' } });
          break;
        }
        await prisma.campaignSend.update({
          where: { id: send.id },
          data: { status: 'FAILED', error: String(err?.message || err).slice(0, 500) },
        });
        console.error('[MARKETING] send failed', send.id, err?.message || err);
      }
      if (remaining <= 0) break;
      await sleep(600);
    }

    const sending = await prisma.campaign.findMany({ where: { status: 'SENDING' }, select: { id: true } });
    for (const c of sending) {
      const pending = await prisma.campaignSend.count({ where: { campaignId: c.id, status: { in: ['QUEUED', 'SENDING'] } } });
      if (pending === 0) await prisma.campaign.update({ where: { id: c.id }, data: { status: 'SENT', sentAt: new Date() } });
    }
  } catch (e: any) {
    console.error('[MARKETING] queue error:', e?.message || e);
  } finally {
    queueRunning = false;
  }
}

// Resend knows whether an email was delivered or bounced; poll recent sends for that.
export async function refreshDeliveryStatuses() {
  const sends = await prisma.campaignSend.findMany({
    where: { status: 'SENT', resendId: { not: null }, sentAt: { gte: new Date(Date.now() - 3 * 24 * 3600_000) } },
    orderBy: { sentAt: 'asc' },
    take: 30,
  });
  for (const s of sends) {
    try {
      const { lastEvent } = await getResendDeliveryStatus(s.resendId!);
      if (['delivered', 'opened', 'clicked'].includes(lastEvent)) {
        await prisma.campaignSend.update({ where: { id: s.id }, data: { status: 'DELIVERED', deliveredAt: s.deliveredAt ?? new Date() } });
      } else if (lastEvent === 'bounced') {
        await prisma.campaignSend.update({ where: { id: s.id }, data: { status: 'BOUNCED' } });
        await prisma.contact.update({ where: { id: s.contactId }, data: { status: 'BOUNCED' } });
      } else if (lastEvent === 'complained') {
        await prisma.campaignSend.update({ where: { id: s.id }, data: { status: 'DELIVERED', unsubscribedAt: new Date() } });
        await prisma.contact.update({ where: { id: s.contactId }, data: { status: 'COMPLAINED', unsubscribedAt: new Date() } });
      }
    } catch { /* try again next round */ }
    await sleep(600);
  }
}

// Emails not yet sent (drafts, scheduled, the welcome automation) and saved templates
// still carry the old purple default; move them to the logo color. Sent ones stay as they were.
async function adoptBrandColor() {
  const campaigns = await prisma.$executeRaw`
    UPDATE "Campaign" SET design = replace(design::text, ${OLD_BRAND_COLOR}, ${BRAND_COLOR})::jsonb
    WHERE status::text IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED') AND position(${OLD_BRAND_COLOR} in design::text) > 0`;
  const templates = await prisma.$executeRaw`
    UPDATE "EmailTemplate" SET design = replace(design::text, ${OLD_BRAND_COLOR}, ${BRAND_COLOR})::jsonb
    WHERE position(${OLD_BRAND_COLOR} in design::text) > 0`;
  if (campaigns || templates) console.log(`[MARKETING] brand color updated in ${campaigns} campaigns, ${templates} templates`);
}

let workerStarted = false;
export function startMarketingWorker() {
  if (workerStarted) return;
  workerStarted = true;
  void adoptBrandColor().catch((e) => console.error('[MARKETING] brand color update:', e?.message || e));
  setInterval(() => void processQueue(), 60_000);
  setInterval(() => void refreshDeliveryStatuses().catch((e) => console.error('[MARKETING] status refresh:', e?.message || e)), 10 * 60_000);
  setTimeout(() => void processQueue(), 15_000);
}

// ── Welcome automation ──────────────────────────────────────────────────────

export async function getWelcomeCampaign() {
  const existing = await prisma.campaign.findFirst({ where: { kind: 'WELCOME' } });
  if (existing) return existing;
  const s = await getMarketingSettings();
  return prisma.campaign.create({
    data: {
      kind: 'WELCOME',
      name: 'מייל ברוכים הבאים',
      subject: 'ברוכים הבאים למדריך לעמותה מנצחת',
      preheader: 'מה יקרה מעכשיו, ועוד טיפ קטן אחד',
      markAsAd: false,
      status: 'PAUSED',
      design: welcomeDesign({ brand: s.brand, logoUrl: s.logoUrl, senderName: s.senderName, businessName: s.businessName }),
    },
  });
}

export async function enqueueWelcome(contactId: string, email: string) {
  const welcome = await prisma.campaign.findFirst({ where: { kind: 'WELCOME', status: 'ACTIVE' } });
  if (!welcome) return;
  if (!(await sendingDomainStatus()).ready) return;
  await prisma.campaignSend.createMany({ data: [{ campaignId: welcome.id, contactId, email }], skipDuplicates: true });
  setTimeout(() => void processQueue(), 500);
}

// ── Stats ───────────────────────────────────────────────────────────────────

export interface CampaignStats {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  failed: number;
  pending: number;
}

export async function statsByCampaign(ids?: string[]) {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "campaignId",
      count(*)::int AS recipients,
      count(*) FILTER (WHERE status IN ('SENT','DELIVERED','BOUNCED'))::int AS sent,
      count(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
      count("openedAt")::int AS opened,
      count("clickedAt")::int AS clicked,
      count("unsubscribedAt")::int AS unsubscribed,
      count(*) FILTER (WHERE status IN ('BOUNCED','FAILED'))::int AS failed,
      count(*) FILTER (WHERE status IN ('QUEUED','SENDING'))::int AS pending
    FROM "CampaignSend"
    ${ids && ids.length ? Prisma.sql`WHERE "campaignId" IN (${Prisma.join(ids)})` : Prisma.empty}
    GROUP BY "campaignId"`;
  const map = new Map<string, CampaignStats>();
  for (const r of rows) {
    const { campaignId, ...rest } = r;
    map.set(campaignId, rest as CampaignStats);
  }
  return map;
}

export const emptyStats: CampaignStats = { recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0, failed: 0, pending: 0 };

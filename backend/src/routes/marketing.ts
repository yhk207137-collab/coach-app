import { Request } from 'express';
import { asyncRouter } from '../lib/asyncRouter';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { UPLOAD_DIR } from '../lib/uploads';
import { sendEmail, sendingDomainStatus, EmailError, fromEmailAddress } from '../lib/email';
import { STARTERS, StarterKey } from '../services/emailStarters';
import {
  getMarketingSettings, saveMarketingSettings, rememberBaseUrl, getBaseUrl, buildForSend, audienceWhere,
  startCampaign, statsByCampaign, emptyStats, getWelcomeCampaign, DAILY_LIMIT, sentInLast24h, processQueue,
} from '../services/marketing';

const router = asyncRouter();
router.use(requireAuth, requireCoach);
router.use((req, _res, next) => {
  void rememberBaseUrl(`${req.protocol}://${req.get('host')}`).catch(() => {});
  next();
});

const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿\s]/g;
export const normalizeEmail = (v: unknown) => String(v ?? '').replace(INVISIBLE, '').toLowerCase();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const cleanTag = (t: unknown) => String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
const cleanTags = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? '').split(',')).map(cleanTag).filter(Boolean))];
const str = (v: unknown, max: number) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// ── Contacts ────────────────────────────────────────────────────────────────

function contactFilter(q: Request['query']): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {};
  const search = String(q.q || '').trim();
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }
  if (q.status && ['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED'].includes(String(q.status))) {
    where.status = String(q.status) as any;
  }
  if (q.tag) where.tags = { has: String(q.tag) };
  if (q.source) where.source = String(q.source);
  return where;
}

router.get('/contacts', async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1')));
  const pageSize = Math.min(200, Math.max(10, parseInt(String(req.query.pageSize || '50'))));
  const where = contactFilter(req.query);
  const [items, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.contact.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get('/contacts/stats', async (_req, res) => {
  const monthStart = new Date(Date.now() - 30 * 24 * 3600_000);
  const [total, subscribed, unsubscribed, bounced, newThisMonth, tagRows, sourceRows] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { status: 'SUBSCRIBED' } }),
    prisma.contact.count({ where: { status: { in: ['UNSUBSCRIBED', 'COMPLAINED'] } } }),
    prisma.contact.count({ where: { status: 'BOUNCED' } }),
    prisma.contact.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.$queryRaw<{ tag: string; count: number }[]>`SELECT t AS tag, count(*)::int AS count FROM "Contact", unnest(tags) AS t GROUP BY t ORDER BY count DESC`,
    prisma.$queryRaw<{ source: string; count: number }[]>`SELECT coalesce(source,'') AS source, count(*)::int AS count FROM "Contact" GROUP BY source ORDER BY count DESC`,
  ]);
  res.json({ total, subscribed, unsubscribed, bounced, newThisMonth, tags: tagRows, sources: sourceRows });
});

const CONSENT_METHOD_HE: Record<string, string> = {
  checkbox: 'סימן/ה תיבת הסכמה בטופס', form: 'שלח/ה טופס הרשמה', manual: 'הוסף ידנית', import: 'ייבוא', resubscribe: 'חזר/ה לרשימה בעצמו/ה',
};
const fmtDateTime = (d: Date | null) => (d ? d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');

router.get('/contacts/export.csv', async (req, res) => {
  const contacts = await prisma.contact.findMany({ where: contactFilter(req.query), orderBy: { createdAt: 'desc' } });
  const statusHe: Record<string, string> = { SUBSCRIBED: 'רשום', UNSUBSCRIBED: 'הוסר', BOUNCED: 'כתובת שגויה', COMPLAINED: 'דיווח ספאם' };
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['שם', 'מייל', 'טלפון', 'סטטוס', 'תגיות', 'מקור', 'תאריך הרשמה', 'הערות', 'מועד ההסכמה', 'אופן ההסכמה', 'נוסח ההסכמה', 'דף ההרשמה', 'כתובת IP', 'מועד הסרה'].map(q).join(','),
    ...contacts.map((c) => [
      c.name, c.email, c.phone, statusHe[c.status], c.tags.join(' | '), c.source,
      c.createdAt.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }), c.notes,
      fmtDateTime(c.consentAt), CONSENT_METHOD_HE[c.consentMethod || ''] || c.consentMethod, c.consentText, c.consentPage, c.consentIp, fmtDateTime(c.unsubscribedAt),
    ].map(q).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

router.get('/contacts/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      sends: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { campaign: { select: { id: true, name: true, kind: true } } },
      },
      visits: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!contact) return res.status(404).json({ error: 'איש הקשר לא נמצא' });
  res.json({ ...contact, visits: contact.visits.map((v) => ({ ...v, sourceLabel: sourceLabel(v.source, v.referrer) })) });
});

router.post('/contacts', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'כתובת המייל לא תקינה' });
  if (!req.body.consentConfirmed) return res.status(400).json({ error: 'יש לאשר שאיש הקשר הסכים לקבל דיוור' });
  try {
    const contact = await prisma.contact.create({
      data: {
        email,
        name: str(req.body.name, 80),
        phone: str(req.body.phone, 30),
        notes: str(req.body.notes, 1000),
        tags: cleanTags(req.body.tags),
        source: 'ידני',
        consentAt: new Date(),
        consentText: 'אושר ידנית על ידי בעל המערכת',
        consentMethod: 'manual',
      },
    });
    res.status(201).json(contact);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'איש קשר עם המייל הזה כבר קיים' });
    throw e;
  }
});

router.put('/contacts/:id', async (req, res) => {
  const data: Prisma.ContactUpdateInput = {};
  if (req.body.name !== undefined) data.name = str(req.body.name, 80);
  if (req.body.phone !== undefined) data.phone = str(req.body.phone, 30);
  if (req.body.notes !== undefined) data.notes = str(req.body.notes, 1000);
  if (req.body.tags !== undefined) data.tags = cleanTags(req.body.tags);
  if (req.body.email !== undefined) {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'כתובת המייל לא תקינה' });
    data.email = email;
  }
  if (req.body.status === 'UNSUBSCRIBED') Object.assign(data, { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() });
  if (req.body.status === 'SUBSCRIBED') {
    if (!req.body.consentConfirmed) return res.status(400).json({ error: 'יש לאשר שאיש הקשר ביקש לחזור לרשימה' });
    Object.assign(data, { status: 'SUBSCRIBED', unsubscribedAt: null, consentAt: new Date(), consentMethod: 'manual', consentText: 'הוחזר לרשימה ידנית לבקשת איש הקשר' });
  }
  try {
    res.json(await prisma.contact.update({ where: { id: req.params.id }, data }));
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'איש קשר עם המייל הזה כבר קיים' });
    throw e;
  }
});

router.post('/contacts/bulk', async (req, res) => {
  const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const tag = cleanTag(req.body.tag);
  if (!ids.length) return res.status(400).json({ error: 'לא נבחרו אנשי קשר' });
  switch (req.body.action) {
    case 'addTag':
      if (!tag) return res.status(400).json({ error: 'חסרה תגית' });
      await prisma.$executeRaw`UPDATE "Contact" SET tags = array_append(tags, ${tag}), "updatedAt" = now() WHERE id IN (${Prisma.join(ids)}) AND NOT (${tag} = ANY(tags))`;
      break;
    case 'removeTag':
      await prisma.$executeRaw`UPDATE "Contact" SET tags = array_remove(tags, ${tag}), "updatedAt" = now() WHERE id IN (${Prisma.join(ids)})`;
      break;
    case 'unsubscribe':
      await prisma.contact.updateMany({ where: { id: { in: ids } }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() } });
      break;
    case 'delete':
      await prisma.contact.deleteMany({ where: { id: { in: ids } } });
      break;
    default:
      return res.status(400).json({ error: 'פעולה לא מוכרת' });
  }
  res.json({ ok: true, count: ids.length });
});

router.post('/contacts/import', async (req, res) => {
  if (!req.body.consentConfirmed) return res.status(400).json({ error: 'יש לאשר שכל אנשי הקשר ברשימה הסכימו לקבל דיוור' });
  const rows: any[] = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  const tags = cleanTags(req.body.tags);
  const source = str(req.body.source, 60) || 'ייבוא';
  let created = 0, updated = 0, invalid = 0, skippedUnsubscribed = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    const name = str(row.name, 80);
    const phone = str(row.phone, 30);
    const existing = await prisma.contact.findUnique({ where: { email } });
    if (!existing) {
      await prisma.contact.create({
        data: {
          email, name, phone, tags, source,
          consentAt: row.date && !isNaN(Date.parse(row.date)) ? new Date(row.date) : new Date(),
          consentText: str(req.body.consentText, 300) || 'יובא ברשימה שאושרה כרשימת נרשמים',
          consentMethod: 'import',
        },
      });
      created++;
    } else {
      if (existing.status !== 'SUBSCRIBED') skippedUnsubscribed++;
      await prisma.contact.update({
        where: { email },
        data: {
          name: existing.name || name,
          phone: existing.phone || phone,
          tags: [...new Set([...existing.tags, ...tags])],
        },
      });
      updated++;
    }
  }
  res.json({ created, updated, invalid, skippedUnsubscribed });
});

// ── Media library ───────────────────────────────────────────────────────────

const MEDIA_DIR = path.join(UPLOAD_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${IMAGE_TYPES[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, !!IMAGE_TYPES[file.mimetype]),
});

const mediaUrl = async (filename: string) => `${await getBaseUrl()}/uploads/media/${filename}`;

router.get('/media', async (_req, res) => {
  const items = await prisma.media.findMany({ orderBy: { createdAt: 'desc' }, take: 120 });
  res.json(await Promise.all(items.map(async (m) => ({ ...m, url: await mediaUrl(m.filename) }))));
});

router.post('/media', mediaUpload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'אפשר להעלות רק תמונות (JPG, PNG, GIF, WEBP) עד 5MB' });
  const width = parseInt(String(req.body.width || '')) || null;
  const height = parseInt(String(req.body.height || '')) || null;
  const media = await prisma.media.create({
    data: {
      filename: req.file.filename,
      name: str(req.body.name, 120) || req.file.originalname.slice(0, 120),
      mimeType: req.file.mimetype,
      size: req.file.size,
      width,
      height,
    },
  });
  res.status(201).json({ ...media, url: await mediaUrl(media.filename) });
});

router.delete('/media/:id', async (req, res) => {
  const media = await prisma.media.findUnique({ where: { id: req.params.id } });
  if (!media) return res.status(404).json({ error: 'לא נמצא' });
  await prisma.media.delete({ where: { id: media.id } });
  fs.rm(path.join(MEDIA_DIR, path.basename(media.filename)), { force: true }, () => {});
  res.json({ ok: true });
});

// ── Guide file (the PDF the emails link to) ─────────────────────────────────

const GUIDE_DIR = path.join(UPLOAD_DIR, 'guide');
fs.mkdirSync(GUIDE_DIR, { recursive: true });
const guideUpload = multer({
  storage: multer.diskStorage({ destination: GUIDE_DIR, filename: (_req, _file, cb) => cb(null, `guide-${uuidv4().slice(0, 8)}.pdf`) }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});

const removeHostedGuide = (url: string) => {
  try {
    const p = new URL(url).pathname;
    if (p.startsWith('/uploads/guide/')) fs.rm(path.join(GUIDE_DIR, path.basename(p)), { force: true }, () => {});
  } catch { /* not ours */ }
};

router.post('/guide', guideUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'אפשר להעלות רק קובץ PDF, עד 25MB' });
  const previous = (await getMarketingSettings()).guideUrl;
  // multer reads the multipart filename as latin1; Hebrew names need re-decoding.
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').replace(/\.pdf$/i, '');
  const settings = await saveMarketingSettings({ guideUrl: `${await getBaseUrl()}/uploads/guide/${req.file.filename}`, guideName: name });
  if (previous) removeHostedGuide(previous);
  res.status(201).json({ settings });
});

router.delete('/guide', async (_req, res) => {
  const previous = (await getMarketingSettings()).guideUrl;
  const settings = await saveMarketingSettings({ guideUrl: '', guideName: '' });
  if (previous) removeHostedGuide(previous);
  res.json({ settings });
});

// ── Settings / status ───────────────────────────────────────────────────────

router.get('/settings', async (_req, res) => {
  const [settings, domain, sent24h] = await Promise.all([getMarketingSettings(), sendingDomainStatus(), sentInLast24h()]);
  res.json({ settings, domain, quota: { dailyLimit: DAILY_LIMIT, sentLast24h: sent24h } });
});

router.put('/settings', async (req, res) => {
  res.json({ settings: await saveMarketingSettings(req.body || {}) });
});

// ── Templates ───────────────────────────────────────────────────────────────

router.get('/templates', async (_req, res) => {
  const saved = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
  const starters = Object.entries(STARTERS).map(([key, s]) => ({ key, label: s.label }));
  res.json({ starters, saved });
});

router.post('/templates', async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name || !req.body.design) return res.status(400).json({ error: 'חסר שם לתבנית' });
  res.status(201).json(await prisma.emailTemplate.create({ data: { name, design: req.body.design } }));
});

router.delete('/templates/:id', async (req, res) => {
  await prisma.emailTemplate.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Campaigns ───────────────────────────────────────────────────────────────

router.get('/campaigns', async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { kind: 'BROADCAST' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, subject: true, status: true, scheduledAt: true, sentAt: true, startedAt: true, audienceTags: true, createdAt: true, updatedAt: true },
  });
  const stats = await statsByCampaign(campaigns.map((c) => c.id));
  res.json(campaigns.map((c) => ({ ...c, stats: stats.get(c.id) || emptyStats })));
});

router.get('/welcome', async (_req, res) => {
  const welcome = await getWelcomeCampaign();
  const stats = await statsByCampaign([welcome.id]);
  res.json({ ...welcome, stats: stats.get(welcome.id) || emptyStats });
});

router.post('/welcome/status', async (req, res) => {
  const welcome = await getWelcomeCampaign();
  const active = !!req.body.active;
  if (active && !welcome.subject.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
  res.json(await prisma.campaign.update({ where: { id: welcome.id }, data: { status: active ? 'ACTIVE' : 'PAUSED' } }));
});

router.post('/campaigns', async (req, res) => {
  const s = await getMarketingSettings();
  const starterOptions = { brand: s.brand, logoUrl: s.logoUrl, senderName: s.senderName, businessName: s.businessName };
  let design: any;
  let base: Partial<{ subject: string; preheader: string | null; audienceTags: string[]; markAsAd: boolean; fromName: string | null }> = {};
  let name = str(req.body.name, 120) || 'קמפיין חדש';

  if (req.body.duplicateOf) {
    const src = await prisma.campaign.findUnique({ where: { id: String(req.body.duplicateOf) } });
    if (!src) return res.status(404).json({ error: 'הקמפיין המקורי לא נמצא' });
    design = src.design;
    base = { subject: src.subject, preheader: src.preheader, audienceTags: src.audienceTags, markAsAd: src.markAsAd, fromName: src.fromName };
    name = `${src.name} (עותק)`;
  } else if (req.body.templateId) {
    const t = await prisma.emailTemplate.findUnique({ where: { id: String(req.body.templateId) } });
    if (!t) return res.status(404).json({ error: 'התבנית לא נמצאה' });
    design = t.design;
  } else {
    const key = (req.body.starter in STARTERS ? req.body.starter : 'newsletter') as StarterKey;
    design = STARTERS[key].build(starterOptions);
  }
  const campaign = await prisma.campaign.create({ data: { name, design, ...base } });
  res.status(201).json(campaign);
});

router.get('/campaigns/:id', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  res.json(campaign);
});

const EDITABLE = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'];

router.put('/campaigns/:id', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  const b = req.body || {};
  const data: Prisma.CampaignUpdateInput = {};
  if (b.name !== undefined) data.name = str(b.name, 120) || campaign.name;
  if (EDITABLE.includes(campaign.status)) {
    if (b.subject !== undefined) data.subject = String(b.subject).slice(0, 200);
    if (b.preheader !== undefined) data.preheader = str(b.preheader, 200);
    if (b.fromName !== undefined) data.fromName = str(b.fromName, 60);
    if (b.markAsAd !== undefined) data.markAsAd = !!b.markAsAd;
    if (b.audienceTags !== undefined) data.audienceTags = cleanTags(b.audienceTags);
    if (b.design !== undefined && b.design && Array.isArray(b.design.blocks)) data.design = b.design;
  } else if (Object.keys(b).some((k) => k !== 'name')) {
    return res.status(400).json({ error: 'אי אפשר לערוך קמפיין שכבר נשלח. אפשר לשכפל אותו.' });
  }
  res.json(await prisma.campaign.update({ where: { id: campaign.id }, data }));
});

router.delete('/campaigns/:id', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.json({ ok: true });
  if (campaign.kind === 'WELCOME') return res.status(400).json({ error: 'את מייל הברוכים הבאים אפשר רק לכבות' });
  if (campaign.status === 'SENDING') return res.status(400).json({ error: 'הקמפיין נמצא בשליחה. קודם עוצרים אותו.' });
  await prisma.campaign.delete({ where: { id: campaign.id } });
  res.json({ ok: true });
});

// Account names default to a placeholder like "המאמן שלי"; previews should greet the real person.
const ownerName = (name: string | null | undefined, s: { senderName: string }) =>
  name && !/^המאמן/.test(name.trim()) ? name : s.senderName || 'ישראל ישראלי';

router.post('/campaigns/:id/preview', async (req: AuthRequest, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  const settings = await getMarketingSettings();
  const merged = {
    ...campaign,
    design: req.body.design ?? campaign.design,
    subject: req.body.subject ?? campaign.subject,
    preheader: req.body.preheader ?? campaign.preheader,
    markAsAd: req.body.markAsAd ?? campaign.markAsAd,
  };
  const coach = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true, email: true } });
  const sample = { name: str(req.body.sampleName, 80) ?? ownerName(coach?.name, settings), email: coach?.email ?? '', unsubToken: 'preview' };
  const built = buildForSend(merged, sample, null, await getBaseUrl(), settings);
  res.json({ subject: built.subject, html: built.html, text: built.text, fromName: merged.fromName || settings.senderName });
});

router.post('/campaigns/:id/test', async (req: AuthRequest, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  const emails = cleanTags(req.body.emails).map(normalizeEmail).filter((e) => EMAIL_RE.test(e)).slice(0, 5);
  if (!emails.length) return res.status(400).json({ error: 'יש לכתוב לפחות כתובת מייל אחת' });
  if (!campaign.subject.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
  const settings = await getMarketingSettings();
  const coach = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
  const base = await getBaseUrl();
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const email of emails) {
    const built = buildForSend(campaign, { name: ownerName(coach?.name, settings), email, unsubToken: 'preview' }, null, base, settings);
    try {
      await sendEmail(email, `[בדיקה] ${built.subject}`, built.html, [], {
        fromName: campaign.fromName || settings.senderName,
        replyTo: settings.replyTo || undefined,
        text: built.text,
      });
      results.push({ email, ok: true });
    } catch (err: any) {
      const noDomain = err instanceof EmailError && (err.status === 403 || err.status === 422) && fromEmailAddress().endsWith('@resend.dev');
      results.push({
        email,
        ok: false,
        error: noDomain
          ? 'עד שהדומיין יחובר, אפשר לשלוח בדיקה רק לכתובת המייל שלך'
          : 'השליחה נכשלה, נסו שוב בעוד דקה',
      });
    }
  }
  res.json({ results });
});

router.get('/campaigns/:id/audience', async (req, res) => {
  const tags = cleanTags(req.query.tags);
  res.json({ count: await prisma.contact.count({ where: audienceWhere(tags) }) });
});

router.post('/campaigns/:id/send', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign || campaign.kind !== 'BROADCAST') return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  if (campaign.status !== 'DRAFT') return res.status(400).json({ error: 'הקמפיין כבר נשלח או תוזמן' });
  if (!campaign.subject.trim()) return res.status(400).json({ error: 'חסר נושא למייל' });
  const domain = await sendingDomainStatus();
  if (!domain.ready) return res.status(400).json({ error: 'כדי לשלוח לנרשמים צריך קודם לחבר דומיין שליחה (בהגדרות הדיוור)' });
  const mktSettings = await getMarketingSettings();
  if (!mktSettings.address.trim()) {
    return res.status(400).json({ error: 'החוק מחייב כתובת עסק בתחתית המייל. הוסיפו אותה בהגדרות הדיוור.' });
  }
  let scheduledAt: Date | null = null;
  if (req.body.scheduledAt) {
    scheduledAt = new Date(req.body.scheduledAt);
    if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000) {
      return res.status(400).json({ error: 'מועד התזמון צריך להיות בעתיד' });
    }
  }
  try {
    const count = await startCampaign(campaign.id, scheduledAt);
    res.json({ ok: true, count, scheduledAt });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'השליחה נכשלה' });
  }
});

router.post('/campaigns/:id/cancel', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  if (campaign.status === 'SCHEDULED') {
    await prisma.campaignSend.deleteMany({ where: { campaignId: campaign.id, status: 'QUEUED' } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'DRAFT', scheduledAt: null } });
  } else if (campaign.status === 'SENDING') {
    await prisma.campaignSend.updateMany({ where: { campaignId: campaign.id, status: 'QUEUED' }, data: { status: 'SKIPPED', error: 'השליחה נעצרה' } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENT', sentAt: new Date() } });
  } else {
    return res.status(400).json({ error: 'אין מה לעצור' });
  }
  res.json({ ok: true });
});

router.get('/campaigns/:id/report', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'הקמפיין לא נמצא' });
  const [stats, sends, links] = await Promise.all([
    statsByCampaign([campaign.id]),
    prisma.campaignSend.findMany({
      where: { campaignId: campaign.id },
      orderBy: [{ clickedAt: { sort: 'desc', nulls: 'last' } }, { openedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 2000,
      include: { contact: { select: { id: true, name: true, email: true, status: true } } },
    }),
    prisma.$queryRaw<{ url: string; clicks: number; people: number }[]>`
      SELECT e.url, count(*)::int AS clicks, count(DISTINCT e."sendId")::int AS people
      FROM "CampaignEvent" e JOIN "CampaignSend" s ON s.id = e."sendId"
      WHERE s."campaignId" = ${campaign.id} AND e.type IN ('click', 'download') AND e.url IS NOT NULL
      GROUP BY e.url ORDER BY clicks DESC LIMIT 50`,
  ]);
  const [sent24h, domain] = await Promise.all([sentInLast24h(), sendingDomainStatus()]);
  res.json({
    campaign,
    stats: stats.get(campaign.id) || emptyStats,
    links,
    recipients: sends.map((s) => ({
      id: s.id, status: s.status, email: s.email, name: s.contact.name, contactId: s.contact.id, contactStatus: s.contact.status,
      sentAt: s.sentAt, openedAt: s.openedAt, clickedAt: s.clickedAt, downloadedAt: s.downloadedAt, unsubscribedAt: s.unsubscribedAt, opens: s.opens, clicks: s.clicks, error: s.error,
    })),
    queue: { dailyLimit: DAILY_LIMIT, sentLast24h: sent24h, domainReady: domain.ready },
  });
});

// ── Tracking: landing visits → sign-ups → guide email → opens → downloads ───

const SOURCE_NAMES: Record<string, string> = {
  share: 'שיתוף מהדף', whatsapp: 'וואטסאפ', wa: 'וואטסאפ', email: 'מייל', mail: 'מייל', newsletter: 'מייל',
  facebook: 'פייסבוק', fb: 'פייסבוק', instagram: 'אינסטגרם', ig: 'אינסטגרם', sms: 'SMS', qr: 'קוד QR', video: 'סרטון', direct: 'כניסה ישירה',
};
export function sourceLabel(source: string | null, referrer: string | null) {
  const s = (source || '').trim();
  if (s) return SOURCE_NAMES[s.toLowerCase()] || s;
  const r = (referrer || '').toLowerCase();
  if (!r) return 'כניסה ישירה';
  if (r.includes('whatsapp')) return 'וואטסאפ';
  if (r.includes('facebook') || r === 'fb.com') return 'פייסבוק';
  if (r.includes('instagram')) return 'אינסטגרם';
  if (/(^|\.)mail\.|outlook|walla/.test(r)) return 'מייל';
  if (r.includes('google.')) return 'גוגל';
  return r.replace(/^www\./, '');
}

router.get('/tracking', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 0;
  const from = days ? new Date(Date.now() - days * 24 * 3600_000) : new Date(0);
  const [settings, welcome] = await Promise.all([getMarketingSettings(), getWelcomeCampaign()]);

  const [visits, signups, welcomeRows, downloadRows, recent, people] = await Promise.all([
    prisma.pageVisit.findMany({ where: { createdAt: { gte: from } }, select: { visitorId: true, contactId: true, source: true, referrer: true, createdAt: true }, take: 50_000 }),
    prisma.contact.findMany({ where: { createdAt: { gte: from }, consentMethod: { in: ['checkbox', 'form'] } }, select: { id: true, createdAt: true } }),
    prisma.$queryRaw<{ sent: number; opened: number }[]>`
      SELECT count(*) FILTER (WHERE status IN ('SENT','DELIVERED','BOUNCED'))::int AS sent, count("openedAt")::int AS opened
      FROM "CampaignSend" WHERE "campaignId" = ${welcome.id} AND "createdAt" >= ${from}`,
    prisma.$queryRaw<{ downloaded: number }[]>`
      SELECT count(DISTINCT "contactId")::int AS downloaded FROM "CampaignSend" WHERE "downloadedAt" >= ${from}`,
    prisma.pageVisit.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { contact: { select: { id: true, name: true, email: true } } },
    }),
    prisma.$queryRaw<any[]>`
      SELECT c.id, c.name, c.email, c.status, c.source, c."createdAt",
        (SELECT count(*)::int FROM "PageVisit" v WHERE v."contactId" = c.id) AS visits,
        (SELECT max(v."createdAt") FROM "PageVisit" v WHERE v."contactId" = c.id) AS "lastVisit",
        (SELECT count(*)::int FROM "CampaignSend" s WHERE s."contactId" = c.id AND s.status IN ('SENT','DELIVERED','BOUNCED')) AS "emailsSent",
        (SELECT count(*)::int FROM "CampaignSend" s WHERE s."contactId" = c.id AND s."openedAt" IS NOT NULL) AS "emailsOpened",
        (SELECT max(s."openedAt") FROM "CampaignSend" s WHERE s."contactId" = c.id) AS "lastOpened",
        (SELECT min(s."downloadedAt") FROM "CampaignSend" s WHERE s."contactId" = c.id) AS "downloadedAt"
      FROM "Contact" c
      WHERE c."createdAt" >= ${from}
        OR EXISTS (SELECT 1 FROM "PageVisit" v WHERE v."contactId" = c.id AND v."createdAt" >= ${from})
        OR EXISTS (SELECT 1 FROM "CampaignSend" s WHERE s."contactId" = c.id AND s."createdAt" >= ${from})
      ORDER BY c."createdAt" DESC
      LIMIT 1000`,
  ]);

  // Sources: unique visitors per channel, and how many signed up after arriving through it.
  const signedUpAt = new Map(signups.map((s) => [s.id, s.createdAt.getTime()]));
  const bySource = new Map<string, { visitors: Set<string>; signups: Set<string> }>();
  for (const v of visits) {
    const label = sourceLabel(v.source, v.referrer);
    const row = bySource.get(label) || { visitors: new Set(), signups: new Set() };
    row.visitors.add(v.visitorId);
    const signedAt = v.contactId ? signedUpAt.get(v.contactId) : undefined;
    if (signedAt !== undefined && v.createdAt.getTime() <= signedAt) row.signups.add(v.contactId!);
    bySource.set(label, row);
  }
  const sources = [...bySource.entries()]
    .map(([source, r]) => ({ source, visitors: r.visitors.size, signups: r.signups.size }))
    .sort((a, b) => b.visitors - a.visitors);

  res.json({
    days,
    funnel: {
      visitors: new Set(visits.map((v) => v.visitorId)).size,
      visits: visits.length,
      signups: signups.length,
      guideSent: welcomeRows[0]?.sent ?? 0,
      opened: welcomeRows[0]?.opened ?? 0,
      downloaded: downloadRows[0]?.downloaded ?? 0,
    },
    sources,
    recent: recent.map((v) => ({ id: v.id, at: v.createdAt, page: v.page, source: sourceLabel(v.source, v.referrer), contact: v.contact })),
    people,
    setup: { welcomeId: welcome.id, welcomeActive: welcome.status === 'ACTIVE', guideUrl: settings.guideUrl, guideName: settings.guideName },
  });
});

router.post('/queue/run', async (_req, res) => {
  void processQueue();
  res.json({ ok: true });
});

export default router;

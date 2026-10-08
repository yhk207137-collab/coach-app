import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/email';
import { backupToSheets } from './sheets';

const SECRET_SETTING_KEYS = ['google_calendar_tokens'];

// Every table except credentials (password hashes, login codes, Google tokens).
export async function buildFullBackup() {
  const [
    users, clients, meetings, meetingSummaries, tags, tasks, payments, paymentRecords, documents,
    quotes, quoteItems, projects, subProjects, contracts, leads, leadActivities, invoices, invoiceItems,
    services, settings,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, clientId: true, createdAt: true } }),
    prisma.client.findMany({ orderBy: { fullName: 'asc' } }),
    prisma.meeting.findMany({ orderBy: { date: 'desc' } }),
    prisma.meetingSummary.findMany({ include: { tags: { select: { id: true } } } }),
    prisma.tag.findMany(),
    prisma.task.findMany(),
    prisma.payment.findMany(),
    prisma.paymentRecord.findMany(),
    prisma.document.findMany(),
    prisma.quote.findMany(),
    prisma.quoteItem.findMany(),
    prisma.project.findMany(),
    prisma.subProject.findMany(),
    prisma.contract.findMany(),
    prisma.lead.findMany(),
    prisma.leadActivity.findMany(),
    prisma.invoice.findMany(),
    prisma.invoiceItem.findMany(),
    prisma.service.findMany(),
    prisma.setting.findMany({ where: { key: { notIn: SECRET_SETTING_KEYS } } }),
  ]);

  const data = {
    users, clients, meetings, meetingSummaries, tags, tasks, payments, paymentRecords, documents,
    quotes, quoteItems, projects, subProjects, contracts, leads, leadActivities, invoices, invoiceItems,
    services, settings,
  };
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { exportedAt: new Date().toISOString(), version: 2, counts, ...data };
}

export function backupFileName(date = new Date()) {
  return `backup-${date.toISOString().slice(0, 10)}.json`;
}

export async function emailBackup() {
  const coaches = await prisma.user.findMany({ where: { role: 'COACH' }, select: { email: true } });
  if (coaches.length === 0) throw new Error('No coach user to send the backup to');

  const backup = await buildFullBackup();
  const file = Buffer.from(JSON.stringify(backup, null, 2), 'utf8');
  const c = backup.counts;
  const date = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#1e293b;">גיבוי יומי – ${date}</h2>
      <p style="color:#475569;">מצורף קובץ גיבוי מלא של כל הנתונים במערכת. שמור את המייל הזה — אפשר לשחזר ממנו את המערכת.</p>
      <table style="border-collapse:collapse; font-size:14px; color:#334155;">
        <tr><td style="padding:4px 12px;">לקוחות</td><td><b>${c.clients}</b></td></tr>
        <tr><td style="padding:4px 12px;">פגישות</td><td><b>${c.meetings}</b></td></tr>
        <tr><td style="padding:4px 12px;">משימות</td><td><b>${c.tasks}</b></td></tr>
        <tr><td style="padding:4px 12px;">תשלומים</td><td><b>${c.payments}</b></td></tr>
        <tr><td style="padding:4px 12px;">פרויקטים</td><td><b>${c.projects}</b></td></tr>
        <tr><td style="padding:4px 12px;">לידים</td><td><b>${c.leads}</b></td></tr>
        <tr><td style="padding:4px 12px;">הצעות מחיר</td><td><b>${c.quotes}</b></td></tr>
        <tr><td style="padding:4px 12px;">חוזים</td><td><b>${c.contracts}</b></td></tr>
      </table>
    </div>
  `;
  for (const { email } of coaches) {
    await sendEmail(email, `גיבוי יומי – ליוי שיווק ופרסום – ${date}`, html, [{ filename: backupFileName(), content: file }]);
  }
  return { sentTo: coaches.map((u) => u.email), counts: backup.counts, sizeKB: Math.round(file.length / 1024) };
}

export async function runNightlyBackup() {
  try {
    const r = await emailBackup();
    console.log('[BACKUP] Emailed backup to', r.sentTo.join(', '), `(${r.sizeKB}KB)`);
  } catch (e: any) {
    console.error('[BACKUP] Email backup failed:', e?.message || e);
  }
  try {
    const url = await backupToSheets();
    console.log('[BACKUP] Google Sheets backup done:', url);
  } catch (e: any) {
    console.error('[BACKUP] Google Sheets backup skipped:', e?.message || e);
  }
}

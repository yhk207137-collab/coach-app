import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !key) throw new Error('Google Service Account credentials not configured');

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

function now() {
  return new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

export async function backupToSheets(): Promise<string> {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_BACKUP_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_BACKUP_ID not configured');

  const [clients, meetings, payments] = await Promise.all([
    prisma.client.findMany({ include: { payments: true, _count: { select: { meetings: true, tasks: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.meeting.findMany({ include: { client: { select: { fullName: true } } }, orderBy: { date: 'desc' }, take: 500 }),
    prisma.payment.findMany({ include: { client: { select: { fullName: true } }, history: true }, orderBy: { updatedAt: 'desc' } }),
  ]);

  const statusMap: Record<string, string> = { ACTIVE: 'פעיל', FROZEN: 'מוקפא', ENDED: 'הסתיים' };

  // --- Clients sheet ---
  const clientRows: any[][] = [
    ['שם מלא', 'מייל', 'טלפון', 'עסק', 'תחום', 'סטטוס', 'תאריך התחלה', 'פגישות', 'משימות', 'סכום עסקה', 'שולם', 'יתרה'],
  ];
  for (const c of clients) {
    const p = c.payments[0];
    clientRows.push([
      c.fullName, c.email, c.phone ?? '', c.businessName ?? '', c.businessField ?? '',
      statusMap[c.status] ?? c.status,
      new Date(c.startDate).toLocaleDateString('he-IL'),
      c._count.meetings, c._count.tasks,
      p?.totalAmount ?? '', p?.paidAmount ?? '',
      p ? (p.totalAmount - p.paidAmount) : '',
    ]);
  }

  // --- Meetings sheet ---
  const meetingRows: any[][] = [
    ['תאריך', 'לקוח', 'סוג', 'משך (דקות)', 'הערות'],
  ];
  for (const m of meetings) {
    meetingRows.push([
      new Date(m.date).toLocaleString('he-IL'),
      m.client?.fullName ?? '',
      m.type, m.duration, m.notes ?? '',
    ]);
  }

  // --- Payments sheet ---
  const paymentRows: any[][] = [
    ['לקוח', 'סכום עסקה', 'שולם', 'יתרה', 'תאריך תשלום הבא', 'רשומות תשלום'],
  ];
  for (const p of payments) {
    const balance = p.totalAmount - p.paidAmount;
    const historyStr = p.history
      .map(r => `${r.isPaid ? '✓' : '⏳'} ₪${r.amount} (${new Date(r.isPaid ? r.date : (r.scheduledDate ?? r.date)).toLocaleDateString('he-IL')})`)
      .join(' | ');
    paymentRows.push([
      p.client?.fullName ?? '',
      p.totalAmount, p.paidAmount, balance,
      p.nextPaymentDate ? new Date(p.nextPaymentDate).toLocaleDateString('he-IL') : '',
      historyStr,
    ]);
  }

  // Helper: clear & write a named sheet tab
  async function writeSheet(title: string, rows: any[][]) {
    // Check if sheet tab exists, if not create it
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = meta.data.sheets?.find(s => s.properties?.title === title);

    if (!existing) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      });
    }

    // Clear and write
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${title}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
  }

  await writeSheet('לקוחות', clientRows);
  await writeSheet('פגישות', meetingRows);
  await writeSheet('תשלומים', paymentRows);

  // Write a summary/metadata row
  await writeSheet('גיבוי', [
    ['גיבוי אחרון', 'לקוחות', 'פגישות', 'תשלומים'],
    [now(), clients.length, meetings.length, payments.length],
  ]);

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

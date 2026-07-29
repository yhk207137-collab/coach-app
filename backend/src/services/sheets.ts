import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TOKENS_KEY = 'google_calendar_tokens';
const SHEET_ID_KEY = 'google_backup_sheet_id';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getAuthorizedClient() {
  const row = await prisma.setting.findUnique({ where: { key: TOKENS_KEY } });
  if (!row) throw new Error('Google לא מחובר — חבר תחילה מדף ההגדרות');

  const client = createOAuth2Client();
  const tokens = JSON.parse(row.value);
  client.setCredentials(tokens);

  client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await prisma.setting.upsert({
      where: { key: TOKENS_KEY },
      create: { key: TOKENS_KEY, value: JSON.stringify(merged) },
      update: { value: JSON.stringify(merged) },
    });
  });

  return client;
}

async function getOrCreateSpreadsheet(auth: any): Promise<string> {
  // Check if we already created a backup sheet
  const stored = await prisma.setting.findUnique({ where: { key: SHEET_ID_KEY } });
  if (stored) return stored.value;

  // Create a new spreadsheet
  const drive = google.drive({ version: 'v3', auth });
  const file = await drive.files.create({
    requestBody: {
      name: 'גיבוי – מערכת אימון עסקי',
      mimeType: 'application/vnd.google-apps.spreadsheet',
    },
    fields: 'id',
  });

  const id = file.data.id!;
  await prisma.setting.upsert({
    where: { key: SHEET_ID_KEY },
    create: { key: SHEET_ID_KEY, value: id },
    update: { value: id },
  });

  return id;
}

function now() {
  return new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

export async function backupToSheets(): Promise<string> {
  const auth = await getAuthorizedClient();
  const spreadsheetId = await getOrCreateSpreadsheet(auth);
  const sheets = google.sheets({ version: 'v4', auth });

  const [clients, meetings, payments] = await Promise.all([
    prisma.client.findMany({ include: { payments: true, _count: { select: { meetings: true, tasks: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.meeting.findMany({ include: { client: { select: { fullName: true } } }, orderBy: { date: 'desc' }, take: 500 }),
    prisma.payment.findMany({ include: { client: { select: { fullName: true } }, history: true }, orderBy: { updatedAt: 'desc' } }),
  ]);

  const statusMap: Record<string, string> = { ACTIVE: 'פעיל', FROZEN: 'מוקפא', ENDED: 'הסתיים' };

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

  const meetingRows: any[][] = [
    ['תאריך', 'לקוח', 'סוג', 'משך (דקות)', 'הערות'],
  ];
  for (const m of meetings) {
    meetingRows.push([
      new Date(m.date).toLocaleString('he-IL'),
      m.client?.fullName ?? '', m.type, m.duration, m.notes ?? '',
    ]);
  }

  const paymentRows: any[][] = [
    ['לקוח', 'סכום עסקה', 'שולם', 'יתרה', 'תאריך תשלום הבא'],
  ];
  for (const p of payments) {
    paymentRows.push([
      p.client?.fullName ?? '', p.totalAmount, p.paidAmount,
      p.totalAmount - p.paidAmount,
      p.nextPaymentDate ? new Date(p.nextPaymentDate).toLocaleDateString('he-IL') : '',
    ]);
  }

  // Get existing sheet tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTabs = meta.data.sheets?.map(s => s.properties?.title) ?? [];

  const tabsToCreate = ['לקוחות', 'פגישות', 'תשלומים', 'גיבוי'].filter(t => !existingTabs.includes(t));
  if (tabsToCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: tabsToCreate.map(title => ({ addSheet: { properties: { title } } })),
      },
    });
  }

  async function writeSheet(title: string, rows: any[][]) {
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${title}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${title}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
  }

  await writeSheet('לקוחות', clientRows);
  await writeSheet('פגישות', meetingRows);
  await writeSheet('תשלומים', paymentRows);
  await writeSheet('גיבוי', [
    ['גיבוי אחרון', 'לקוחות', 'פגישות', 'תשלומים'],
    [now(), clients.length, meetings.length, payments.length],
  ]);

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

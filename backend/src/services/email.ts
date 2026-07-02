import nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendClientWelcomeEmail(email: string, name: string) {
  if (!process.env.SMTP_USER) return;
  const transport = createTransport();
  await transport.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: `ברוך הבא למערכת הליווי העסקי`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שלום ${name},</h2>
        <p>ברוך הבא למערכת הליווי העסקי האישי שלנו.</p>
        <p>תוכל להתחבר לאזור האישי שלך ולצפות בפגישות, משימות וסיכומים.</p>
        <p>בברכה,<br/>${process.env.FROM_NAME}</p>
      </div>
    `,
  });
}

export async function sendMeetingConfirmation(email: string, name: string, meeting: any) {
  if (!process.env.SMTP_USER) return;
  const transport = createTransport();
  const dateStr = format(new Date(meeting.date), "EEEE, d בMMMM yyyy בשעה HH:mm", { locale: he });

  await transport.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: `אישור פגישה – ${dateStr}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שלום ${name},</h2>
        <p>פגישה נקבעה עבורך:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td><strong>תאריך ושעה:</strong></td><td>${dateStr}</td></tr>
          <tr><td><strong>משך:</strong></td><td>${meeting.duration} דקות</td></tr>
          <tr><td><strong>סוג הפגישה:</strong></td><td>${meeting.type}</td></tr>
          ${meeting.notes ? `<tr><td><strong>הערות:</strong></td><td>${meeting.notes}</td></tr>` : ''}
        </table>
        <p>בברכה,<br/>${process.env.FROM_NAME}</p>
      </div>
    `,
  });
}

export async function sendMeetingReminder(email: string, name: string, meeting: any) {
  if (!process.env.SMTP_USER) return;
  const transport = createTransport();
  const dateStr = format(new Date(meeting.date), "EEEE, d בMMMM yyyy בשעה HH:mm", { locale: he });

  await transport.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: `תזכורת: פגישה מחר – ${dateStr}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שלום ${name},</h2>
        <p>תזכורת: יש לך פגישה מחר.</p>
        <p><strong>${dateStr}</strong></p>
        <p>בברכה,<br/>${process.env.FROM_NAME}</p>
      </div>
    `,
  });
}

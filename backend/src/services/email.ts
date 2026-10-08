import { sendEmail } from '../lib/email';

const fromName = () => process.env.FROM_NAME || 'ליוי שיווק ופרסום';

function formatDate(date: Date): string {
  return date.toLocaleString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  });
}

export async function sendClientWelcomeEmail(email: string, name: string) {
  await sendEmail(email, 'ברוך הבא למערכת הליווי העסקי', `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>שלום ${name},</h2>
      <p>ברוך הבא למערכת הליווי העסקי האישי שלנו.</p>
      <p>תוכל להתחבר לאזור האישי שלך ולצפות בפגישות, משימות וסיכומים.</p>
      <p>בברכה,<br/>${fromName()}</p>
    </div>
  `);
}

export async function sendMeetingConfirmation(email: string, name: string, meeting: any) {
  const dateStr = formatDate(new Date(meeting.date));
  await sendEmail(email, `אישור פגישה – ${dateStr}`, `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>שלום ${name},</h2>
      <p>פגישה נקבעה עבורך:</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td><strong>תאריך ושעה:</strong></td><td>${dateStr}</td></tr>
        <tr><td><strong>משך:</strong></td><td>${meeting.duration} דקות</td></tr>
        <tr><td><strong>סוג הפגישה:</strong></td><td>${meeting.type}</td></tr>
        ${meeting.notes ? `<tr><td><strong>הערות:</strong></td><td>${meeting.notes}</td></tr>` : ''}
      </table>
      <p>בברכה,<br/>${fromName()}</p>
    </div>
  `);
}

export async function sendMeetingReminder(email: string, name: string, meeting: any) {
  const dateStr = formatDate(new Date(meeting.date));
  await sendEmail(email, `תזכורת: פגישה מחר – ${dateStr}`, `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>שלום ${name},</h2>
      <p>תזכורת: יש לך פגישה מחר.</p>
      <p><strong>${dateStr}</strong></p>
      <p>בברכה,<br/>${fromName()}</p>
    </div>
  `);
}

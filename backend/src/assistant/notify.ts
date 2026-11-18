// Delivers something the assistant starts on its own (a reminder, the morning brief) to the owner:
// on WhatsApp when it is linked, always into the chat window, and as a Windows notification on this computer.
import { spawn } from 'child_process';
import { db } from './store';

type Sender = (text: string) => Promise<boolean>;
let whatsappSender: Sender | null = null;
export const setWhatsappSender = (s: Sender) => (whatsappSender = s);

function windowsToast(title: string, body: string) {
  if (process.platform !== 'win32' || process.env.ASSISTANT_NO_TOAST === '1') return;
  const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 240);
  const xml = `<toast><visual><binding template="ToastGeneric"><text>${esc(title)}</text><text>${esc(body)}</text></binding></visual><audio src="ms-winsoundevent:Notification.Reminder"/></toast>`;
  const script = [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null',
    '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$x.LoadXml('${xml.replace(/'/g, "''")}')`,
    '$t = [Windows.UI.Notifications.ToastNotification]::new($x)',
    // PowerShell's own app id, so Windows shows the toast without registering an app.
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($t)",
  ].join('; ');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], { stdio: 'ignore', windowsHide: true }).on('error', () => undefined);
}

/** Returns where it went, for logs and tests. */
export async function deliverToOwner(title: string, text: string) {
  await db.assistantMessage.create({ data: { role: 'assistant', text } });
  let whatsapp = false;
  if (whatsappSender) whatsapp = await whatsappSender(text).catch(() => false);
  windowsToast(title, text.replace(/\*/g, ''));
  return { whatsapp };
}

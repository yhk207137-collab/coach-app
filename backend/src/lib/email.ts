import nodemailer from 'nodemailer';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export let lastSentEmail: { id?: string; to: string; subject: string; at: string } | null = null;

export async function getResendDeliveryStatus(id: string) {
  const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${process.env.SMTP_PASS}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Resend API ${r.status}: ${await r.text()}`);
  const data: any = await r.json();
  return { lastEvent: data.last_event as string, from: data.from as string, createdAt: data.created_at as string };
}

export async function sendEmail(to: string, subject: string, html: string, attachments: EmailAttachment[] = []) {
  const key = process.env.SMTP_PASS;
  if (!key) throw new Error('Email not configured (SMTP_PASS missing)');
  const fromName = process.env.FROM_NAME || 'ליוי שיווק ופרסום';
  const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const host = process.env.SMTP_HOST || 'smtp.resend.com';

  // Railway blocks outbound SMTP on non-Pro plans, so Resend is called over HTTPS instead.
  if (host.includes('resend')) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
        attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`Resend API ${r.status}: ${await r.text()}`);
    const { id } = (await r.json()) as { id?: string };
    lastSentEmail = { id, to, subject, at: new Date().toISOString() };
    console.log('[EMAIL] Accepted by Resend:', id, '→', to);
    return;
  }

  const port = parseInt(process.env.SMTP_PORT || '587');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: key },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  await transport.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html, attachments });
}

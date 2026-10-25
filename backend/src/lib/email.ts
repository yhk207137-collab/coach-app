import nodemailer from 'nodemailer';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailOptions {
  fromName?: string;
  replyTo?: string;
  text?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export class EmailError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export let lastSentEmail: { id?: string; to: string; subject: string; at: string } | null = null;

const resendKey = () => process.env.SMTP_PASS;
export const fromEmailAddress = () => process.env.FROM_EMAIL || 'onboarding@resend.dev';
const usesResend = () => (process.env.SMTP_HOST || 'smtp.resend.com').includes('resend');

async function resendFetch(path: string, init: RequestInit = {}) {
  return fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
}

export async function getResendDeliveryStatus(id: string) {
  const r = await resendFetch(`/emails/${encodeURIComponent(id)}`);
  if (!r.ok) throw new EmailError(`Resend API ${r.status}: ${await r.text()}`, r.status);
  const data: any = await r.json();
  return { lastEvent: data.last_event as string, from: data.from as string, createdAt: data.created_at as string };
}

let domainCache: { at: number; value: { name: string; status: string }[] | null } | null = null;

// Domains registered in Resend; null when the API key cannot list them (sending-only key).
export async function listSendingDomains() {
  if (domainCache && Date.now() - domainCache.at < 5 * 60_000) return domainCache.value;
  let value: { name: string; status: string }[] | null = null;
  try {
    const r = await resendFetch('/domains');
    if (r.ok) {
      const data: any = await r.json();
      value = (data.data || []).map((d: any) => ({ name: d.name, status: d.status }));
    }
  } catch { /* network problem: treat as unknown */ }
  domainCache = { at: Date.now(), value };
  return value;
}

export async function sendingDomainStatus() {
  const from = fromEmailAddress();
  const domain = from.split('@')[1]?.toLowerCase() || '';
  if (!resendKey()) return { ready: false, from, domain, reason: 'no-key' as const };
  if (domain === 'resend.dev') return { ready: false, from, domain, reason: 'no-domain' as const };
  const domains = await listSendingDomains();
  const match = domains?.find((d) => d.name.toLowerCase() === domain);
  if (domains && !match) return { ready: false, from, domain, reason: 'not-added' as const };
  if (match && match.status !== 'verified') return { ready: false, from, domain, reason: 'not-verified' as const };
  return { ready: true, from, domain, reason: 'ok' as const };
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments: EmailAttachment[] = [],
  options: EmailOptions = {}
): Promise<string | undefined> {
  if (!resendKey()) throw new EmailError('Email not configured (SMTP_PASS missing)');
  const fromName = options.fromName || process.env.FROM_NAME || 'ליוי שיווק ופרסום';
  const fromEmail = fromEmailAddress();

  // Railway blocks outbound SMTP on non-Pro plans, so Resend is called over HTTPS instead.
  if (usesResend()) {
    const r = await resendFetch('/emails', {
      method: 'POST',
      headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {},
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        ...(options.headers ? { headers: options.headers } : {}),
        ...(attachments.length
          ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }
          : {}),
      }),
    });
    if (!r.ok) throw new EmailError(`Resend API ${r.status}: ${await r.text()}`, r.status);
    const { id } = (await r.json()) as { id?: string };
    lastSentEmail = { id, to, subject, at: new Date().toISOString() };
    console.log('[EMAIL] Accepted by Resend:', id, '→', to);
    return id;
  }

  const port = parseInt(process.env.SMTP_PORT || '587');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: resendKey() },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  const info = await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`, to, subject, html, attachments,
    text: options.text, replyTo: options.replyTo, headers: options.headers,
  });
  return info.messageId;
}

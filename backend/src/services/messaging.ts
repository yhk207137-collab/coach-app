// Text messages to people's phones (SMS or WhatsApp). The provider is chosen by env MESSAGE_PROVIDER.
// - "test": nothing leaves the server; messages are kept in testOutbox (local end-to-end tests).
// - unset: no provider connected yet. The caller gets ok:false and the owner gets a ready WhatsApp draft instead.

export interface MessageResult { ok: boolean; provider: string; id?: string; error?: string }

export const testOutbox: { to: string; text: string; at: Date }[] = [];

export const messageProvider = () => (process.env.MESSAGE_PROVIDER || '').trim().toLowerCase();
export const messagingConnected = () => !!messageProvider();

// Israeli numbers in one form: 9725XXXXXXXX. Anything else keeps its digits.
export function phoneDigits(phone: string | null | undefined) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return d;
}

export function isIsraeliMobile(phone: string) {
  return /^9725\d{8}$/.test(phoneDigits(phone));
}

export async function sendTextMessage(to: string, text: string, now = new Date()): Promise<MessageResult> {
  const provider = messageProvider();
  if (!provider) return { ok: false, provider: 'none', error: 'לא מחובר ספק הודעות' };
  if (provider === 'test') {
    testOutbox.push({ to: phoneDigits(to), text, at: now });
    console.log(`[MESSAGE:test] → ${phoneDigits(to)} @ ${now.toISOString()}\n${text}`);
    return { ok: true, provider, id: `test-${testOutbox.length}` };
  }
  return { ok: false, provider, error: `ספק לא מוכר: ${provider}` };
}

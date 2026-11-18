// WhatsApp Cloud API (Meta): send replies to the owner and fetch media they send.
import crypto from 'crypto';

// WHATSAPP_GRAPH_URL only for local tests against a fake server.
const GRAPH = process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com/v23.0';

export const waConfigured = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_OWNER_NUMBER);

// Israeli numbers in any common form ("054-1234567", "+972 54...") become 9725XXXXXXXX.
export function normalizePhone(raw: string) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

export const isOwner = (from: string) =>
  !!process.env.WHATSAPP_OWNER_NUMBER && normalizePhone(from) === normalizePhone(process.env.WHATSAPP_OWNER_NUMBER);

// Meta signs each webhook with the app secret; anything unsigned or forged is dropped.
export function validSignature(rawBody: Buffer | undefined, header: string | undefined) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !rawBody || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graph(path: string, body: unknown) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// WhatsApp caps a text at 4096 characters; long answers go out in parts, split on paragraph breaks.
function chunks(text: string, max = 3800) {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export async function sendText(to: string, text: string) {
  for (const part of chunks(text)) {
    await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body: part, preview_url: true },
    });
  }
}

// Blue ticks plus "typing…" while the assistant works. Cosmetic, so failures are ignored.
export async function markReadAndTyping(messageId: string) {
  try {
    await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    });
  } catch {
    /* not important */
  }
}

export async function downloadMedia(mediaId: string): Promise<{ data: Buffer; mime: string }> {
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`media lookup ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return { data: Buffer.from(await file.arrayBuffer()), mime: mime_type };
}

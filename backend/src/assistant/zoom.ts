// Zoom through a Server-to-Server OAuth app in the owner's Zoom account.
const configured = () => !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
export const zoomConfigured = configured;

let cached: { token: string; until: number } | null = null;

async function token() {
  if (!configured()) throw new Error('זום עדיין לא מחובר.');
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!)}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } }
  );
  if (!res.ok) throw new Error(`Zoom login ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, until: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Zoom ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

// start: Israel local time, YYYY-MM-DDTHH:mm
export async function createZoomMeeting(topic: string, start: string, durationMinutes: number) {
  const m: any = await api('/users/me/meetings', {
    method: 'POST',
    body: JSON.stringify({
      topic,
      type: 2,
      start_time: start.length === 16 ? `${start}:00` : start,
      timezone: 'Asia/Jerusalem',
      duration: durationMinutes,
      settings: { join_before_host: false, waiting_room: true },
    }),
  });
  return { id: m.id, joinUrl: m.join_url as string, password: m.password as string | undefined };
}

export async function listZoomMeetings() {
  const data: any = await api('/users/me/meetings?type=upcoming&page_size=30');
  return (data?.meetings || []).map((m: any) => ({ id: m.id, topic: m.topic, start: m.start_time, joinUrl: m.join_url }));
}

export async function deleteZoomMeeting(id: string) {
  await api(`/meetings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

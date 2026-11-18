// The assistant's clock: sends due reminders and the morning brief. Nothing goes out on Shabbat / Yom Tov.
import type { HostOptions } from './host';
import { db, kvGet, kvSet } from './store';
import { deliverToOwner } from './notify';
import { writeMorningBrief } from './brain';
import { readSettings } from './tools';
import { isQuietTime, israelDay, israelHHMM, nextOccurrence } from './time';

let running = false;

/** One pass of the clock. Exported for tests (with a fixed `now`). */
export async function schedulerTick(host: HostOptions, now = new Date()) {
  if (running) return;
  running = true;
  try {
    if (isQuietTime(now)) return;

    const due = await db.assistantReminder.findMany({ where: { status: 'WAITING', dueAt: { lte: now } }, orderBy: { dueAt: 'asc' } });
    for (const r of due) {
      // Claim it first, so a slow send can never deliver it twice.
      const claimed = await db.assistantReminder.updateMany({ where: { id: r.id, status: 'WAITING' }, data: { status: 'SENDING' } });
      if (!claimed.count) continue;
      await deliverToOwner('תזכורת', `⏰ *תזכורת:* ${r.text}`);
      const next = r.repeat !== 'none' ? nextOccurrence(r.dueAt, r.repeat, now) : null;
      await db.assistantReminder.update({
        where: { id: r.id },
        data: next ? { status: 'WAITING', dueAt: next, sentAt: now } : { status: 'SENT', sentAt: now },
      });
    }

    const s = await readSettings();
    const today = israelDay(now);
    const time = israelHHMM(now);
    const lateBy = (() => {
      const [h, m] = s.morningBriefTime.split(':').map(Number);
      const [nh, nm] = time.split(':').map(Number);
      return nh * 60 + nm - (h * 60 + m);
    })();
    // Sent once a day, at its time or up to 3 hours late (e.g. the computer was off).
    if (s.morningBrief && lateBy >= 0 && lateBy <= 180 && (await kvGet('brief_last')) !== today) {
      await kvSet('brief_last', today);
      const brief = await writeMorningBrief(host, now);
      if (brief) await deliverToOwner('סיכום בוקר', brief);
    }
  } catch (err: any) {
    console.error('[ASSISTANT] scheduler:', err?.message || err);
  } finally {
    running = false;
  }
}

export function startScheduler(host: HostOptions) {
  if (process.env.ASSISTANT_NO_SCHEDULER === '1') return;
  setInterval(() => schedulerTick(host).catch(() => undefined), 30_000);
  setTimeout(() => schedulerTick(host).catch(() => undefined), 5_000);
}

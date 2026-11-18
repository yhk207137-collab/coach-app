// The assistant's hands. Read-only tools are shared with sub-agents; anything that reaches
// another person in the owner's name becomes a pending action that only the owner's "yes" releases.
import { z } from 'zod';
import type { HostTool } from './host';
import { db, kvGet, kvSet } from './store';
import * as g from './google';
import { afterQuiet, fromIsraelLocal, isQuietTime, nextOccurrence, showWhen } from './time';

export const DEFAULT_DAILY_LIMIT = 60;
export async function readSettings() {
  return {
    morningBrief: (await kvGet('brief_on')) !== '0',
    morningBriefTime: (await kvGet('brief_time')) || '07:30',
    dailyLimit: Number((await kvGet('daily_limit')) || process.env.ASSISTANT_DAILY_LIMIT || DEFAULT_DAILY_LIMIT),
  };
}
import { createZoomMeeting, deleteZoomMeeting, listZoomMeetings, zoomConfigured } from './zoom';

const LOCAL = 'Israel local time, format YYYY-MM-DDTHH:mm';
type Out = { content: { type: 'text'; text: string }[]; isError?: boolean };

const clip = (s: string) => (s.length > 20000 ? s.slice(0, 20000) + '…(קוצר)' : s);
const ok = (v: unknown): Out => ({ content: [{ type: 'text', text: clip(typeof v === 'string' ? v : JSON.stringify(v)) }] });
const fail = (err: any): Out => ({ content: [{ type: 'text', text: `שגיאה: ${String(err?.message || err).slice(0, 500)}` }], isError: true });

export interface ToolSpec {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  readOnly: boolean;
  run: (input: any) => Promise<unknown>;
}

// ── Pending actions ─────────────────────────────────────────────────────────

async function prepare(kind: string, summary: string, payload: unknown) {
  const p = await db.assistantPending.create({ data: { kind, summary, payload: JSON.stringify(payload) } });
  return {
    status: 'waiting_for_owner_approval',
    pendingId: p.id,
    instruction:
      'Show the owner exactly what will happen (full email text, or time and guests) and ask for a yes. Do not call approve_pending until the owner replies.',
  };
}

async function createEventWithLink(input: any) {
  let location = input.location;
  let description = input.description || '';
  let zoomId: string | undefined;
  if (input.meetingLink === 'zoom') {
    const zm = await createZoomMeeting(input.title, input.start, input.durationMinutes);
    zoomId = String(zm.id);
    location = zm.joinUrl;
    description = `קישור לזום: ${zm.joinUrl}${zm.password ? `\nסיסמה: ${zm.password}` : ''}${description ? `\n\n${description}` : ''}`;
  }
  try {
    return await g.createEvent({
    title: input.title,
    start: input.start,
    durationMinutes: input.durationMinutes,
    attendees: input.attendees,
    location,
    description: description || undefined,
    googleMeet: input.meetingLink === 'google_meet',
  });
  } catch (err) {
    // No calendar event means no invite: don't leave an orphan Zoom meeting behind.
    if (zoomId) await deleteZoomMeeting(zoomId).catch(() => undefined);
    throw err;
  }
}

// ── The tool set ────────────────────────────────────────────────────────────

export function buildTools(hostTools: HostTool[], turnStartedAt: Date): ToolSpec[] {
  const runPending = async (kind: string, payload: any) => {
    switch (kind) {
      case 'mail_send':
        return g.sendMail(payload);
      case 'calendar_create':
        return createEventWithLink(payload);
      case 'calendar_move':
        return g.moveEvent(payload.eventId, payload.start, payload.durationMinutes);
      case 'calendar_delete':
        return g.deleteEvent(payload.eventId);
      case 'host': {
        const t = hostTools.find((h) => h.name === payload.tool);
        if (!t) throw new Error(`host tool ${payload.tool} no longer exists`);
        return t.run(payload.input);
      }
    }
    throw new Error(`unknown pending kind ${kind}`);
  };

  const own: ToolSpec[] = [
    // read
    {
      name: 'calendar_list',
      description: "List events in the owner's Google Calendar between two dates.",
      shape: { from: z.string().describe('YYYY-MM-DD or ' + LOCAL), to: z.string().describe('YYYY-MM-DD or ' + LOCAL) },
      readOnly: true,
      run: (i) => g.listEvents(i.from, i.to),
    },
    {
      name: 'mail_search',
      description: "Search the owner's Gmail with Gmail search syntax (e.g. 'is:unread newer_than:2d'). Returns sender, subject, date, snippet and id.",
      shape: { query: z.string(), max: z.number().int().optional().describe('Up to 25, default 10') },
      readOnly: true,
      run: (i) => g.searchMail(i.query, i.max || 10),
    },
    {
      name: 'mail_read',
      description: 'Read one email in full by its id.',
      shape: { id: z.string() },
      readOnly: true,
      run: (i) => g.readMail(i.id),
    },
    {
      name: 'zoom_list',
      description: "List the owner's upcoming Zoom meetings.",
      shape: {},
      readOnly: true,
      run: async () => ((await zoomConfigured()) ? listZoomMeetings() : { error: 'זום עוד לא מחובר' }),
    },

    // act
    {
      name: 'calendar_create',
      description:
        "Add an event to the owner's calendar. With attendees Google emails them an invite in his name, so it is only prepared and needs his yes.",
      shape: {
        title: z.string(),
        start: z.string().describe(LOCAL),
        durationMinutes: z.number().int(),
        attendees: z.array(z.string()).optional().describe('Guest emails'),
        location: z.string().optional(),
        description: z.string().optional(),
        meetingLink: z.enum(['none', 'zoom', 'google_meet']).optional(),
      },
      readOnly: false,
      run: async (i) => {
        if (i.attendees?.length) {
          const link = i.meetingLink === 'zoom' ? ' + קישור זום' : i.meetingLink === 'google_meet' ? ' + קישור Meet' : '';
          return prepare('calendar_create', `הזמנה ל"${i.title}" ב-${i.start.replace('T', ' ')} (${i.durationMinutes} דק') ל: ${i.attendees.join(', ')}${link}`, i);
        }
        return { done: true, event: await createEventWithLink(i) };
      },
    },
    {
      name: 'calendar_move',
      description: 'Move an event to a new time. If it has guests they are notified, so it needs his yes.',
      shape: { eventId: z.string(), start: z.string().describe(LOCAL), durationMinutes: z.number().int().optional() },
      readOnly: false,
      run: async (i) => {
        const ev = await g.eventHasGuests(i.eventId);
        if (ev.guests.length) return prepare('calendar_move', `הזזת "${ev.title}" מ-${ev.startText} ל-${i.start.replace('T', ' ')}; יקבלו עדכון: ${ev.guests.join(', ')}`, i);
        await g.moveEvent(i.eventId, i.start, i.durationMinutes);
        return { done: true };
      },
    },
    {
      name: 'calendar_delete',
      description: 'Delete an event. With guests they get a cancellation, so it needs his yes.',
      shape: { eventId: z.string() },
      readOnly: false,
      run: async (i) => {
        const ev = await g.eventHasGuests(i.eventId);
        if (ev.guests.length) return prepare('calendar_delete', `ביטול "${ev.title}" (${ev.startText}); יקבלו הודעת ביטול: ${ev.guests.join(', ')}`, i);
        await g.deleteEvent(i.eventId);
        return { done: true };
      },
    },
    {
      name: 'zoom_create',
      description: "Create a Zoom meeting in the owner's account and get the join link (nobody is notified).",
      shape: { topic: z.string(), start: z.string().describe(LOCAL), durationMinutes: z.number().int() },
      readOnly: false,
      run: async (i) => ({ done: true, meeting: await createZoomMeeting(i.topic, i.start, i.durationMinutes) }),
    },
    {
      name: 'mail_draft',
      description: "Save an email as a draft in the owner's Gmail (not sent).",
      shape: { to: z.string(), subject: z.string(), body: z.string(), cc: z.string().optional(), replyToId: z.string().optional() },
      readOnly: false,
      run: async (i) => ({ done: true, ...(await g.createDraft(i)) }),
    },
    {
      name: 'mail_send',
      description: "Send an email from the owner's Gmail. Only PREPARES it: he sees the full text on WhatsApp and must answer yes.",
      shape: { to: z.string(), subject: z.string(), body: z.string(), cc: z.string().optional(), replyToId: z.string().optional() },
      readOnly: false,
      run: (i) => prepare('mail_send', `מייל אל ${i.to}${i.cc ? ` (העתק: ${i.cc})` : ''}\nנושא: ${i.subject || '(תשובה)'}\n\n${i.body}`, i),
    },
    {
      name: 'mail_mark_read',
      description: 'Mark an email as read.',
      shape: { id: z.string() },
      readOnly: false,
      run: async (i) => {
        await g.markMailRead(i.id);
        return { done: true };
      },
    },
    {
      name: 'google_connect_link',
      description: 'Get a one-time link (valid 15 minutes) for the owner to connect or reconnect his Google calendar and Gmail. Send it to him as is.',
      shape: {},
      readOnly: false,
      run: async () => ({ link: await g.googleConnectLink() }),
    },
    // ── Reminders ──
    {
      name: 'reminder_set',
      description:
        'Set a reminder for the owner. It arrives on WhatsApp (and on his computer) at that time. Times are Israel local. Reminders that fall on Shabbat or Yom Tov are moved to right after it ends — tell him when that happens.',
      shape: {
        text: z.string().describe('What to remind him, in Hebrew, written as the reminder he will read'),
        at: z.string().describe(LOCAL),
        repeat: z.enum(['none', 'daily', 'weekly', 'monthly']).optional().describe('Default none'),
      },
      readOnly: false,
      run: async (i) => {
        const wanted = fromIsraelLocal(i.at);
        if (wanted.getTime() < Date.now() - 60e3) return { error: 'This time has already passed. Ask him for a future time.' };
        const repeat = i.repeat || 'none';
        // A one-time reminder that falls on Shabbat comes right after it; a repeating one skips to its next regular time.
        const dueAt = !isQuietTime(wanted) ? wanted : repeat === 'none' ? afterQuiet(wanted) : nextOccurrence(wanted, repeat, wanted) || afterQuiet(wanted);
        const r = await db.assistantReminder.create({ data: { text: String(i.text).trim(), dueAt, repeat } });
        return { done: true, id: r.id, when: showWhen(dueAt), movedBecauseOfShabbat: dueAt.getTime() !== wanted.getTime() };
      },
    },
    {
      name: 'reminder_list',
      description: 'List the reminders that are still waiting.',
      shape: {},
      readOnly: true,
      run: async () =>
        (await db.assistantReminder.findMany({ where: { status: 'WAITING' }, orderBy: { dueAt: 'asc' } })).map((r) => ({
          id: r.id,
          text: r.text,
          when: showWhen(r.dueAt),
          repeat: r.repeat,
        })),
    },
    {
      name: 'reminder_cancel',
      description: 'Cancel a waiting reminder (also stops a repeating one).',
      shape: { id: z.string() },
      readOnly: false,
      run: async (i) => {
        const n = await db.assistantReminder.updateMany({ where: { id: i.id, status: 'WAITING' }, data: { status: 'CANCELLED' } });
        return n.count ? { done: true } : { error: 'אין תזכורת כזו שממתינה' };
      },
    },

    // ── Personal tasks ──
    {
      name: 'task_add',
      description: "Add an item to the owner's personal to-do list.",
      shape: { title: z.string(), dueDay: z.string().optional().describe('YYYY-MM-DD, optional') },
      readOnly: false,
      run: async (i) => {
        const title = String(i.title || '').trim();
        if (!title) return { error: 'empty task' };
        const t = await db.assistantTask.create({ data: { title, dueDay: i.dueDay || null } });
        return { done: true, id: t.id };
      },
    },
    {
      name: 'task_list',
      description: "The owner's personal to-do list. Open items by default; includeDone shows the last week's finished ones too.",
      shape: { includeDone: z.boolean().optional() },
      readOnly: true,
      run: async (i) => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 3600e3);
        const rows = await db.assistantTask.findMany({
          where: i.includeDone ? { OR: [{ done: false }, { doneAt: { gte: weekAgo } }] } : { done: false },
          orderBy: [{ done: 'asc' }, { dueDay: 'asc' }, { createdAt: 'asc' }],
        });
        return rows.map((t) => ({ id: t.id, title: t.title, dueDay: t.dueDay, done: t.done }));
      },
    },
    {
      name: 'task_done',
      description: 'Mark a personal task as done (or not done with done=false).',
      shape: { id: z.string(), done: z.boolean().optional() },
      readOnly: false,
      run: async (i) => {
        const done = i.done !== false;
        const n = await db.assistantTask.updateMany({ where: { id: i.id }, data: { done, doneAt: done ? new Date() : null } });
        return n.count ? { done: true } : { error: 'אין משימה כזו' };
      },
    },
    {
      name: 'task_delete',
      description: 'Delete a personal task.',
      shape: { id: z.string() },
      readOnly: false,
      run: async (i) => {
        const n = await db.assistantTask.deleteMany({ where: { id: i.id } });
        return n.count ? { done: true } : { error: 'אין משימה כזו' };
      },
    },

    // ── Morning brief and daily limit ──
    {
      name: 'assistant_settings',
      description:
        'Change how the assistant works for him: the morning brief (on/off and time, Israel local HH:mm) and the daily limit of messages it handles (protects his Claude plan quota). Call with no fields to read the current values.',
      shape: {
        morningBrief: z.boolean().optional(),
        morningBriefTime: z.string().optional().describe('HH:mm'),
        dailyLimit: z.number().int().optional().describe('Messages per day, 5 to 500'),
      },
      readOnly: false,
      run: async (i) => {
        if (i.morningBrief !== undefined) await kvSet('brief_on', i.morningBrief ? '1' : '0');
        if (i.morningBriefTime) {
          if (!/^\d{2}:\d{2}$/.test(i.morningBriefTime)) return { error: 'time must be HH:mm' };
          await kvSet('brief_time', i.morningBriefTime);
        }
        if (i.dailyLimit !== undefined) await kvSet('daily_limit', String(Math.min(500, Math.max(5, i.dailyLimit))));
        return await readSettings();
      },
    },
    {
      name: 'memory_save',
      description: 'Remember a lasting fact about the owner, his people, preferences or how he likes things done. One short fact per call, in Hebrew.',
      shape: { fact: z.string(), topic: z.string().optional().describe('e.g. העדפות, אנשים, עבודה, משפחה') },
      readOnly: false,
      run: async (i) => {
        const fact = String(i.fact || '').trim();
        if (fact.length < 3) return { error: 'Nothing to save: write the fact itself.' };
        return { done: true, id: (await db.assistantMemory.create({ data: { fact, topic: i.topic || 'כללי' } })).id };
      },
    },
    {
      name: 'memory_forget',
      description: 'Delete a remembered fact that is wrong or that he asked you to forget.',
      shape: { id: z.string() },
      readOnly: false,
      run: async (i) => {
        await db.assistantMemory.delete({ where: { id: i.id } }).catch(() => null);
        return { done: true };
      },
    },
    {
      name: 'approve_pending',
      description: "Carry out a prepared action after the owner clearly said yes in a NEW message. Never in the same turn that prepared it.",
      shape: { id: z.string() },
      readOnly: false,
      run: async (i) => {
        const p = await db.assistantPending.findUnique({ where: { id: i.id } });
        if (!p || p.status !== 'WAITING') return { error: 'אין פעולה כזו שממתינה לאישור' };
        // The yes must come in a message the owner sent after the action was prepared.
        if (p.createdAt >= turnStartedAt) return { error: 'The owner has not answered yet. Ask him and wait for his reply.' };
        if (turnStartedAt.getTime() - p.createdAt.getTime() > 24 * 3600e3) return { error: 'Prepared over a day ago. Prepare it again and ask him.' };
        try {
          const result = await runPending(p.kind, JSON.parse(p.payload));
          await db.assistantPending.update({ where: { id: p.id }, data: { status: 'DONE', resolvedAt: new Date() } });
          return { done: true, result };
        } catch (err: any) {
          await db.assistantPending.update({ where: { id: p.id }, data: { status: 'FAILED', resolvedAt: new Date() } });
          return { error: String(err?.message || err) };
        }
      },
    },
    {
      name: 'cancel_pending',
      description: 'Cancel a prepared action he declined or changed.',
      shape: { id: z.string() },
      readOnly: false,
      run: async (i) => {
        await db.assistantPending.updateMany({ where: { id: i.id, status: 'WAITING' }, data: { status: 'CANCELLED', resolvedAt: new Date() } });
        return { done: true };
      },
    },
  ];

  // The socket: tools a host app plugs in when the assistant is embedded in it.
  const fromHost: ToolSpec[] = hostTools.map((h) => ({
    name: `app_${h.name}`,
    description: h.description,
    shape: h.input,
    readOnly: h.kind === 'read',
    run: (i) =>
      h.kind === 'needs_approval'
        ? prepare('host', h.summary ? h.summary(i) : `${h.description}: ${JSON.stringify(i)}`, { tool: h.name, input: i })
        : h.run(i),
  }));

  return [...own, ...fromHost];
}

export async function runSafely(spec: ToolSpec, input: any): Promise<Out> {
  try {
    return ok(await spec.run(input));
  } catch (err) {
    console.error(`[ASSISTANT] tool ${spec.name} failed:`, (err as any)?.message || err);
    return fail(err);
  }
}

// The assistant's hands. Read-only tools are shared with sub-agents; anything that reaches
// another person in the owner's name becomes a pending action that only the owner's "yes" releases.
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../lib/prisma';
import { collectAlerts } from '../alerts';
import * as g from './google';
import { createZoomMeeting, listZoomMeetings, zoomConfigured } from './zoom';

type Tool = Anthropic.Beta.BetaTool;
type Input = Record<string, any>;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'integer', description });
const LOCAL = 'Israel local time, format YYYY-MM-DDTHH:mm';

// ── Read-only (owner + sub-agents) ──────────────────────────────────────────

export const READ_TOOLS: Tool[] = [
  {
    name: 'calendar_list',
    description: "List events in the owner's Google Calendar between two dates (inclusive of from, exclusive of to).",
    input_schema: obj({ from: str('YYYY-MM-DD or ' + LOCAL), to: str('YYYY-MM-DD or ' + LOCAL) }, ['from', 'to']),
  },
  {
    name: 'mail_search',
    description:
      "Search the owner's Gmail with Gmail search syntax (e.g. 'is:unread newer_than:2d', 'from:dani subject:הצעה'). Returns sender, subject, date, snippet and id.",
    input_schema: obj({ query: str('Gmail search query'), max: num('How many, up to 25. Default 10.') }, ['query']),
  },
  {
    name: 'mail_read',
    description: 'Read one email in full by its id (from mail_search).',
    input_schema: obj({ id: str('Gmail message id') }, ['id']),
  },
  {
    name: 'zoom_list',
    description: "List the owner's upcoming Zoom meetings.",
    input_schema: obj({}),
  },
  {
    name: 'crm_find_client',
    description:
      "Find clients in the owner's CRM by name, business, email or phone. Returns contact details, notes, upcoming meetings and open tasks.",
    input_schema: obj({ query: str('Part of a name, business, email or phone') }, ['query']),
  },
  {
    name: 'crm_needs_attention',
    description:
      "Everything the CRM says needs the owner's attention now: late payments, invoices, tasks, meetings without summary, quotes, contracts, leads, projects.",
    input_schema: obj({}),
  },
  {
    name: 'crm_tasks',
    description: 'Open CRM tasks, optionally only for one client id.',
    input_schema: obj({ clientId: str('Optional client id') }),
  },
];

// ── Acting (owner agent only) ───────────────────────────────────────────────

export const ACT_TOOLS: Tool[] = [
  {
    name: 'calendar_create',
    description:
      "Add an event to the owner's calendar. With attendees, Google emails them an invite in the owner's name, so the call only prepares it and the owner must approve.",
    input_schema: obj(
      {
        title: str('Event title, in Hebrew unless asked otherwise'),
        start: str(LOCAL),
        durationMinutes: num('Length in minutes'),
        attendees: { type: 'array', items: { type: 'string' }, description: 'Guest email addresses (optional)' },
        location: str('Optional place or link'),
        description: str('Optional notes'),
        meetingLink: { type: 'string', enum: ['none', 'zoom', 'google_meet'], description: 'Add a video link. Default none.' },
      },
      ['title', 'start', 'durationMinutes']
    ),
  },
  {
    name: 'calendar_move',
    description: 'Move an event to a new time (keeps its length unless durationMinutes is given). If it has guests, they are notified, so it needs approval.',
    input_schema: obj({ eventId: str('Event id from calendar_list'), start: str(LOCAL), durationMinutes: num('Optional new length') }, ['eventId', 'start']),
  },
  {
    name: 'calendar_delete',
    description: 'Delete an event. If it has guests they get a cancellation, so it needs approval; otherwise it is deleted at once.',
    input_schema: obj({ eventId: str('Event id from calendar_list') }, ['eventId']),
  },
  {
    name: 'zoom_create',
    description: "Create a Zoom meeting in the owner's account and get its join link (nobody is notified).",
    input_schema: obj({ topic: str('Meeting topic'), start: str(LOCAL), durationMinutes: num('Length in minutes') }, ['topic', 'start', 'durationMinutes']),
  },
  {
    name: 'mail_draft',
    description: "Save an email as a draft in the owner's Gmail (not sent). Use when the owner wants to look at it first.",
    input_schema: obj(
      { to: str('Recipient email'), subject: str('Subject (may be empty when replying)'), body: str('Plain-text body'), cc: str('Optional cc'), replyToId: str('Optional: id of the email being answered') },
      ['to', 'subject', 'body']
    ),
  },
  {
    name: 'mail_send',
    description:
      "Send an email from the owner's Gmail. This only PREPARES it: the owner sees the full text on WhatsApp and must answer yes before it goes out.",
    input_schema: obj(
      { to: str('Recipient email'), subject: str('Subject (may be empty when replying)'), body: str('Plain-text body, signed as the owner'), cc: str('Optional cc'), replyToId: str('Optional: id of the email being answered') },
      ['to', 'subject', 'body']
    ),
  },
  {
    name: 'mail_mark_read',
    description: 'Mark an email as read.',
    input_schema: obj({ id: str('Gmail message id') }, ['id']),
  },
  {
    name: 'crm_add_task',
    description: 'Add a task in the CRM for a client.',
    input_schema: obj({ clientId: str('Client id from crm_find_client'), title: str('Task'), dueDate: str('Optional YYYY-MM-DD'), description: str('Optional details') }, ['clientId', 'title']),
  },
  {
    name: 'crm_complete_task',
    description: 'Mark a CRM task as done.',
    input_schema: obj({ taskId: str('Task id') }, ['taskId']),
  },
  {
    name: 'crm_add_client_note',
    description: "Append a dated note to a client's notes in the CRM.",
    input_schema: obj({ clientId: str('Client id'), note: str('The note') }, ['clientId', 'note']),
  },
  {
    name: 'memory_save',
    description:
      'Remember a lasting fact about the owner, their preferences, people, or how they like things done. Save only what will matter in later conversations, one fact per call, in Hebrew.',
    input_schema: obj({ fact: str('The fact, one short sentence'), topic: str('Short topic, e.g. העדפות, אנשים, עבודה, משפחה') }, ['fact']),
  },
  {
    name: 'memory_forget',
    description: 'Delete a remembered fact that is wrong or no longer true.',
    input_schema: obj({ id: str('Memory id') }, ['id']),
  },
  {
    name: 'approve_pending',
    description:
      "Carry out a prepared action after the owner clearly said yes to it in a NEW message (e.g. 'כן', 'שלח', 'מאשר'). Never call it in the same turn that prepared the action.",
    input_schema: obj({ id: str('Pending action id') }, ['id']),
  },
  {
    name: 'cancel_pending',
    description: 'Cancel a prepared action the owner declined or changed.',
    input_schema: obj({ id: str('Pending action id') }, ['id']),
  },
];

export const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));

// ── Pending actions ─────────────────────────────────────────────────────────

async function prepare(kind: string, summary: string, payload: unknown) {
  const p = await prisma.assistantPending.create({ data: { kind, summary, payload: JSON.stringify(payload) } });
  return {
    status: 'waiting_for_owner_approval',
    pendingId: p.id,
    instruction:
      'Show the owner exactly what will happen (full email text, or time and guests) and ask for a yes. Do not call approve_pending until the owner replies.',
  };
}

async function runPending(kind: string, payload: any) {
  switch (kind) {
    case 'mail_send':
      return g.sendMail(payload);
    case 'calendar_create':
      return createEventWithLink(payload);
    case 'calendar_move':
      return g.moveEvent(payload.eventId, payload.start, payload.durationMinutes);
    case 'calendar_delete':
      return g.deleteEvent(payload.eventId);
    default:
      throw new Error(`unknown pending kind ${kind}`);
  }
}

async function createEventWithLink(input: Input) {
  let location = input.location;
  let description = input.description || '';
  if (input.meetingLink === 'zoom') {
    const z = await createZoomMeeting(input.title, input.start, input.durationMinutes);
    location = z.joinUrl;
    description = `קישור לזום: ${z.joinUrl}${z.password ? `\nסיסמה: ${z.password}` : ''}${description ? `\n\n${description}` : ''}`;
  }
  return g.createEvent({
    title: input.title,
    start: input.start,
    durationMinutes: input.durationMinutes,
    attendees: input.attendees,
    location,
    description: description || undefined,
    googleMeet: input.meetingLink === 'google_meet',
  });
}

// ── Execution ───────────────────────────────────────────────────────────────

const ACTIVE_TASK = { status: { not: 'COMPLETED' as const } };

export async function runTool(name: string, input: Input, turnStartedAt: Date): Promise<unknown> {
  switch (name) {
    case 'calendar_list':
      return g.listEvents(input.from, input.to);
    case 'mail_search':
      return g.searchMail(input.query, input.max || 10);
    case 'mail_read':
      return g.readMail(input.id);
    case 'zoom_list':
      if (!zoomConfigured()) return { error: 'זום עדיין לא מחובר' };
      return listZoomMeetings();
    case 'crm_find_client': {
      const q = String(input.query || '').trim();
      const digits = q.replace(/\D/g, '');
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { businessName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-7) } }] : []),
          ],
        },
        take: 5,
        include: {
          meetings: { where: { date: { gte: new Date() } }, orderBy: { date: 'asc' }, take: 3 },
          tasks: { where: ACTIVE_TASK, take: 10 },
        },
      });
      return clients.map((c) => ({
        id: c.id,
        name: c.fullName,
        business: c.businessName,
        email: c.email,
        phone: c.phone,
        status: c.status,
        type: c.clientType,
        notes: c.notes?.slice(-2000),
        upcomingMeetings: c.meetings.map((m) => ({ id: m.id, date: m.date, minutes: m.duration, type: m.type })),
        openTasks: c.tasks.map((t) => ({ id: t.id, title: t.title, due: t.dueDate })),
      }));
    }
    case 'crm_needs_attention': {
      const alerts = await collectAlerts();
      return alerts.slice(0, 30).map((a) => ({ severity: a.severity, kind: a.kind, title: a.title, detail: a.detail, amount: a.amount, soon: a.soon }));
    }
    case 'crm_tasks': {
      const tasks = await prisma.task.findMany({
        where: { ...ACTIVE_TASK, ...(input.clientId ? { clientId: input.clientId } : {}) },
        orderBy: [{ dueDate: 'asc' }],
        take: 40,
        include: { client: { select: { fullName: true } } },
      });
      return tasks.map((t) => ({ id: t.id, title: t.title, client: t.client.fullName, due: t.dueDate, status: t.status }));
    }

    case 'calendar_create': {
      if (input.attendees?.length) {
        const link = input.meetingLink === 'zoom' ? ' + קישור זום' : input.meetingLink === 'google_meet' ? ' + קישור Meet' : '';
        return prepare('calendar_create', `הזמנה ל"${input.title}" ב-${input.start.replace('T', ' ')} (${input.durationMinutes} דק') ל: ${input.attendees.join(', ')}${link}`, input);
      }
      return { done: true, event: await createEventWithLink(input) };
    }
    case 'calendar_move': {
      const ev = await g.eventHasGuests(input.eventId);
      if (ev.guests.length) return prepare('calendar_move', `הזזת "${ev.title}" מ-${ev.startText} ל-${input.start.replace('T', ' ')}; יקבלו עדכון: ${ev.guests.join(', ')}`, input);
      await g.moveEvent(input.eventId, input.start, input.durationMinutes);
      return { done: true };
    }
    case 'calendar_delete': {
      const ev = await g.eventHasGuests(input.eventId);
      if (ev.guests.length) return prepare('calendar_delete', `ביטול "${ev.title}" (${ev.startText}); יקבלו הודעת ביטול: ${ev.guests.join(', ')}`, input);
      await g.deleteEvent(input.eventId);
      return { done: true };
    }
    case 'zoom_create':
      return { done: true, meeting: await createZoomMeeting(input.topic, input.start, input.durationMinutes) };
    case 'mail_draft':
      return { done: true, ...(await g.createDraft(input as g.MailInput)) };
    case 'mail_send':
      return prepare('mail_send', `מייל אל ${input.to}${input.cc ? ` (העתק: ${input.cc})` : ''}\nנושא: ${input.subject || '(תשובה)'}\n\n${input.body}`, input);
    case 'mail_mark_read':
      await g.markMailRead(input.id);
      return { done: true };

    case 'crm_add_task': {
      const t = await prisma.task.create({
        data: {
          clientId: input.clientId,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T09:00:00+02:00`) : undefined,
        },
      });
      return { done: true, taskId: t.id };
    }
    case 'crm_complete_task':
      await prisma.task.update({ where: { id: input.taskId }, data: { status: 'COMPLETED' } });
      return { done: true };
    case 'crm_add_client_note': {
      const c = await prisma.client.findUnique({ where: { id: input.clientId } });
      if (!c) return { error: 'לקוח לא נמצא' };
      const stamp = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short' }).format(new Date());
      await prisma.client.update({ where: { id: c.id }, data: { notes: `${c.notes ? c.notes + '\n' : ''}[${stamp}] ${input.note}` } });
      return { done: true };
    }

    case 'memory_save': {
      const m = await prisma.assistantMemory.create({ data: { fact: input.fact, topic: input.topic || 'כללי' } });
      return { done: true, id: m.id };
    }
    case 'memory_forget':
      await prisma.assistantMemory.delete({ where: { id: input.id } }).catch(() => null);
      return { done: true };

    case 'approve_pending': {
      const p = await prisma.assistantPending.findUnique({ where: { id: input.id } });
      if (!p || p.status !== 'WAITING') return { error: 'אין פעולה כזו שממתינה לאישור' };
      // The yes must come in a message the owner sent after the action was prepared.
      if (p.createdAt >= turnStartedAt) return { error: 'The owner has not answered yet. Ask them and wait for their reply.' };
      if (turnStartedAt.getTime() - p.createdAt.getTime() > 24 * 3600e3) return { error: 'This was prepared over a day ago. Prepare it again and ask the owner.' };
      try {
        const result = await runPending(p.kind, JSON.parse(p.payload));
        await prisma.assistantPending.update({ where: { id: p.id }, data: { status: 'DONE', resolvedAt: new Date() } });
        return { done: true, result };
      } catch (err: any) {
        await prisma.assistantPending.update({ where: { id: p.id }, data: { status: 'FAILED', resolvedAt: new Date() } });
        return { error: String(err?.message || err) };
      }
    }
    case 'cancel_pending':
      await prisma.assistantPending.updateMany({ where: { id: input.id, status: 'WAITING' }, data: { status: 'CANCELLED', resolvedAt: new Date() } });
      return { done: true };
  }
  return { error: `unknown tool ${name}` };
}

import { prisma } from '../lib/prisma';

// Clients who pay per meeting: each meeting adds its price to what they owe once it has taken place.
// Intro meetings are never charged on their own; the owner is asked each time.

export const isIntroMeeting = (type: string) => /היכרות|הכרות/.test(type);

export type NewMeetingBilling =
  | { outcome: 'charged'; amount: number }
  | { outcome: 'pending'; amount: number }
  | { outcome: 'ask'; price: number | null }
  | { outcome: 'needs-price' }
  | { outcome: 'none' };

export async function chargeMeeting(id: string, amount: number) {
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.findUnique({ where: { id }, select: { clientId: true } });
    if (!meeting) return false;
    // The status check stops a second charge when the clock and a click meet.
    const { count } = await tx.meeting.updateMany({
      where: { id, OR: [{ chargeStatus: null }, { chargeStatus: { in: ['PENDING', 'SKIPPED'] } }] },
      data: { chargeStatus: 'CHARGED', chargedAmount: amount },
    });
    if (!count) return false;
    await tx.payment.upsert({
      where: { clientId: meeting.clientId },
      update: { totalAmount: { increment: amount } },
      create: { clientId: meeting.clientId, totalAmount: amount },
    });
    return true;
  });
}

// Takes a charge back off the balance; the meeting returns to "not decided".
export async function resetMeetingCharge(id: string) {
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.findUnique({ where: { id }, select: { clientId: true, chargeStatus: true, chargedAmount: true } });
    if (!meeting) return false;
    await tx.meeting.update({ where: { id }, data: { chargeStatus: null, chargedAmount: null } });
    if (meeting.chargeStatus === 'CHARGED' && meeting.chargedAmount) {
      await tx.payment.updateMany({ where: { clientId: meeting.clientId }, data: { totalAmount: { decrement: meeting.chargedAmount } } });
    }
    return true;
  });
}

export async function billNewMeeting(
  meeting: { id: string; date: Date; type: string },
  client: { clientType: string; sessionPrice: number | null },
  now = new Date()
): Promise<NewMeetingBilling> {
  if (client.clientType !== 'SESSION') return { outcome: 'none' };
  if (isIntroMeeting(meeting.type)) return { outcome: 'ask', price: client.sessionPrice };
  if (!client.sessionPrice) return { outcome: 'needs-price' };
  if (meeting.date <= now) {
    await chargeMeeting(meeting.id, client.sessionPrice);
    return { outcome: 'charged', amount: client.sessionPrice };
  }
  await prisma.meeting.update({ where: { id: meeting.id }, data: { chargeStatus: 'PENDING' } });
  return { outcome: 'pending', amount: client.sessionPrice };
}

// Setting a price queues the client's upcoming meetings; past ones wait for the owner's decision.
export async function setSessionPrice(clientId: string, price: number | null, now = new Date()) {
  const client = await prisma.client.update({ where: { id: clientId }, data: { sessionPrice: price } });
  if (!price) {
    await prisma.meeting.updateMany({ where: { clientId, chargeStatus: 'PENDING' }, data: { chargeStatus: null } });
    return client;
  }
  const upcoming = await prisma.meeting.findMany({ where: { clientId, chargeStatus: null, date: { gt: now } }, select: { id: true, type: true } });
  const ids = upcoming.filter((m) => !isIntroMeeting(m.type)).map((m) => m.id);
  if (ids.length) await prisma.meeting.updateMany({ where: { id: { in: ids } }, data: { chargeStatus: 'PENDING' } });
  return client;
}

// Runs every minute: a meeting whose time has come is added to the balance, at the price set today.
export async function chargeDueMeetings(now = new Date()) {
  const due = await prisma.meeting.findMany({
    where: { chargeStatus: 'PENDING', date: { lte: now } },
    select: { id: true, client: { select: { clientType: true, sessionPrice: true } } },
  });
  for (const m of due) {
    if (m.client.clientType === 'SESSION' && m.client.sessionPrice) await chargeMeeting(m.id, m.client.sessionPrice);
    else await prisma.meeting.update({ where: { id: m.id }, data: { chargeStatus: null } });
  }
}

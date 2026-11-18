// The assistant's own storage: only its own tables (Assistant*), never the host app's data.
// It brings its own Prisma client so the module can be lifted into another app as is.
import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();

export async function kvGet(key: string) {
  return (await db.assistantKV.findUnique({ where: { key } }))?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  await db.assistantKV.upsert({ where: { key }, create: { key, value }, update: { value } });
}
export async function kvDelete(key: string) {
  await db.assistantKV.deleteMany({ where: { key } });
}

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.COACH_EMAIL || 'coach@example.com';
  const password = process.env.COACH_PASSWORD || 'Coach1234!';
  const name = process.env.COACH_NAME || 'המאמן שלי';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Coach user already exists');
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, password: hash, name, role: 'COACH' },
  });
  console.log(`Coach user created: ${email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

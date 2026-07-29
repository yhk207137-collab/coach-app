import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.RESET_EMAIL || 'yhk207137@gmail.com';
  const newPassword = process.env.RESET_PASSWORD || 'Admin1234!';

  const hash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.update({
    where: { email },
    data: { password: hash },
  });
  console.log(`Password reset for: ${user.email}`);
  console.log(`New password: ${newPassword}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

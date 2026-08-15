const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const env = require('../src/config/env');

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });
  console.log(`Admin foydalanuvchi tayyor: ${username}`);

  if (!env.asadbekAmocrmUserId) {
    console.warn('ASADBEK_AMOCRM_USER_ID .env faylida sozlanmagan, sotuvchi yaratilmadi.');
  } else {
    await prisma.salesperson.upsert({
      where: { amocrmUserId: env.asadbekAmocrmUserId },
      update: { name: env.asadbekName, active: true },
      create: { name: env.asadbekName, amocrmUserId: env.asadbekAmocrmUserId, active: true },
    });
    console.log(`Sotuvchi tayyor: ${env.asadbekName} (amoCRM ID: ${env.asadbekAmocrmUserId})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

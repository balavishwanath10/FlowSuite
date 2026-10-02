import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const plans = [
  {
    name: 'Free',
    priceInPaise: 0,
    seatLimit: 3,
    projectLimit: 2,
    apiRequestLimit: 1000,
    advancedAnalytics: false,
  },
  {
    name: 'Starter',
    priceInPaise: 49900,
    seatLimit: 10,
    projectLimit: 20,
    apiRequestLimit: 10000,
    advancedAnalytics: false,
  },
  {
    name: 'Professional',
    priceInPaise: 99900,
    seatLimit: 50,
    projectLimit: null,
    apiRequestLimit: 100000,
    advancedAnalytics: true,
  },
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
  }

  console.log('Subscription plans seeded successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
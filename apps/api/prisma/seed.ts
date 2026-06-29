import { OrderStatus, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@oddsforge.com" },
    update: {},
    create: {
      email: "alice@oddsforge.com",
      passwordHash,
      wallet: {
        create: { available: 100000n }
      }
    }
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@oddsforge.com" },
    update: {},
    create: {
      email: "bob@oddsforge.com",
      passwordHash,
      wallet: {
        create: { available: 100000n }
      }
    }
  });

  const market1 = await prisma.market.upsert({
    where: { id: "seed-market-1" },
    update: {},
    create: {
      id: "seed-market-1",
      question: "Will Bitcoin exceed $100k by end of 2025?"
    }
  });

  await prisma.market.upsert({
    where: { id: "seed-market-2" },
    update: {},
    create: {
      id: "seed-market-2",
      question: "Will India win the 2025 Cricket World Cup?"
    }
  });

  await prisma.market.upsert({
    where: { id: "seed-market-3" },
    update: {},
    create: {
      id: "seed-market-3",
      question: "Will GPT-5 be released before July 2025?"
    }
  });

  // Alice: BUY YES price 65 quantity 20 on market 1
  const aliceCost = BigInt(65) * BigInt(20);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: {
        userId: alice.id,
        marketId: market1.id,
        side: "BUY",
        outcome: "YES",
        price: 65,
        quantity: 20,
        status: OrderStatus.OPEN
      }
    });

    if (!existing) {
      const aliceWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: alice.id } });
      await tx.wallet.update({
        where: { userId: alice.id },
        data: {
          available: aliceWallet.available - aliceCost,
          reserved: aliceWallet.reserved + aliceCost
        }
      });
      await tx.order.create({
        data: {
          userId: alice.id,
          marketId: market1.id,
          side: "BUY",
          outcome: "YES",
          price: 65,
          quantity: 20,
          status: OrderStatus.OPEN
        }
      });
    }
  });

  // Bob: BUY NO price 40 quantity 15 on market 1
  const bobCost = BigInt(40) * BigInt(15);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: {
        userId: bob.id,
        marketId: market1.id,
        side: "BUY",
        outcome: "NO",
        price: 40,
        quantity: 15,
        status: OrderStatus.OPEN
      }
    });

    if (!existing) {
      const bobWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bob.id } });
      await tx.wallet.update({
        where: { userId: bob.id },
        data: {
          available: bobWallet.available - bobCost,
          reserved: bobWallet.reserved + bobCost
        }
      });
      await tx.order.create({
        data: {
          userId: bob.id,
          marketId: market1.id,
          side: "BUY",
          outcome: "NO",
          price: 40,
          quantity: 15,
          status: OrderStatus.OPEN
        }
      });
    }
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

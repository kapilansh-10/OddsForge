import { OrderStatus, Outcome, Prisma, Side } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

function isSide(value: unknown): value is Side {
  return value === Side.BUY || value === Side.SELL;
}

function isOutcome(value: unknown): value is Outcome {
  return value === Outcome.YES || value === Outcome.NO;
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const { marketId, side, outcome, price, quantity } = req.body as {
      marketId?: string;
      side?: unknown;
      outcome?: unknown;
      price?: number;
      quantity?: number;
    };

    if (!marketId) {
      res.status(400).json({ error: "Market is required" });
      return;
    }

    if (!isSide(side)) {
      res.status(400).json({ error: "Side must be BUY or SELL" });
      return;
    }

    if (side !== Side.BUY) {
      res.status(400).json({ error: "SELL orders are not supported yet" });
      return;
    }

    if (!isOutcome(outcome)) {
      res.status(400).json({ error: "Outcome must be YES or NO" });
      return;
    }

    if (typeof price !== "number" || !Number.isInteger(price) || price < 1 || price > 99) {
      res.status(400).json({ error: "Price must be an integer from 1 to 99" });
      return;
    }

    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      res.status(400).json({ error: "Quantity must be a positive integer" });
      return;
    }

    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const market = await tx.market.findUnique({
          where: { id: marketId },
          select: { id: true }
        });

        if (!market) {
          return { error: "Market not found" as const };
        }

        const wallet = await tx.wallet.findUnique({
          where: { userId }
        });

        if (!wallet) {
          return { error: "Wallet not found" as const };
        }

        const cost = BigInt(price) * BigInt(quantity);

        if (wallet.available < cost) {
          return { error: "Insufficient funds" as const };
        }

        const before = wallet.available;
        const after = before - cost;

        await tx.wallet.update({
          where: { userId },
          data: {
            available: after,
            reserved: wallet.reserved + cost
          }
        });

        await tx.ledgerEntry.create({
          data: {
            userId,
            type: "ORDER_RESERVED",
            amount: cost,
            before,
            after,
            meta: {
              marketId,
              side,
              outcome,
              price,
              quantity
            }
          }
        });

        const order = await tx.order.create({
          data: {
            userId,
            marketId,
            side,
            outcome,
            price,
            quantity,
            status: OrderStatus.OPEN
          }
        });

        return { order };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if ("error" in result) {
      const status = result.error === "Insufficient funds" ? 400 : 404;
      res.status(status).json({ error: result.error });
      return;
    }

    res.status(201).json({ order: result.order });
  } catch (error) {
    res.status(500).json({ error: "Failed to create order" });
    console.error(error);
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        market: {
          select: {
            question: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
    console.error(error);
  }
});

export default router;

import { OrderStatus, Outcome, Prisma, Side } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { matchOrder } from "../matching/engine";
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

        if (side === Side.BUY) {
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
        }

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

        await matchOrder(order.id, tx);

        const finalOrder = await tx.order.findUniqueOrThrow({
          where: { id: order.id }
        });

        return { order: finalOrder };
      },
      { timeout: 30000 }
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

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const order = await tx.order.findUnique({
          where: { id: req.params.id as string }
        });

        if (!order) {
          return { error: "Order not found" as const };
        }

        if (order.userId !== userId) {
          return { error: "Forbidden" as const };
        }

        if (order.status !== OrderStatus.OPEN && order.status !== OrderStatus.PARTIAL) {
          return { error: "Only OPEN or PARTIAL orders can be canceled" as const };
        }

        const refund = BigInt(order.quantity - order.filled) * BigInt(order.price);

        const wallet = await tx.wallet.findUnique({
          where: { userId }
        });

        if (!wallet) {
          return { error: "Wallet not found" as const };
        }

        const before = wallet.available;
        const after = before + refund;

        await tx.wallet.update({
          where: { userId },
          data: {
            available: after,
            reserved: wallet.reserved - refund
          }
        });

        await tx.ledgerEntry.create({
          data: {
            userId,
            type: "ORDER_CANCELED",
            amount: refund,
            before,
            after,
            meta: {
              orderId: order.id,
              marketId: order.marketId,
              side: order.side,
              outcome: order.outcome,
              price: order.price,
              quantity: order.quantity,
              filled: order.filled
            }
          }
        });

        const canceled = await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELED }
        });

        return { order: canceled };
      },
      { timeout: 30000 }
    );

    if ("error" in result) {
      const err = result.error;
      const status =
        err === "Order not found" || err === "Wallet not found" ? 404
        : err === "Forbidden" ? 403
        : 400;
      res.status(status).json({ error: err });
      return;
    }

    res.json({ order: result.order });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel order" });
    console.error(error);
  }
});

export default router;

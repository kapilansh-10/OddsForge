import { MarketStatus, Outcome, Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  const { question } = req.body as { question?: string };

  if (!question) {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  try {
    const market = await prisma.market.create({
      data: {
        question
      }
    });

    res.status(201).json({ market });
  } catch {
    res.status(500).json({ error: "Failed to create market" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const markets = await prisma.market.findMany({
      select: {
        id: true,
        question: true,
        status: true,
        resolvedTo: true,
        createdAt: true,
        closedAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({ markets });
  } catch {
    res.status(500).json({ error: "Failed to fetch markets" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const market = await prisma.market.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    res.json({ market });
  } catch {
    res.status(500).json({ error: "Failed to fetch market" });
  }
});

router.patch("/:id/resolve", requireAuth, async (req, res) => {
  const { outcome } = req.body as { outcome?: unknown };

  if (outcome !== "YES" && outcome !== "NO") {
    res.status(400).json({ error: "Outcome must be YES or NO" });
    return;
  }

  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const market = await tx.market.findUnique({
          where: { id: req.params.id as string }
        });

        if (!market) {
          return { error: "Market not found" as const };
        }

        if (market.status === MarketStatus.RESOLVED) {
          return { error: "Market is already resolved" as const };
        }

        const winningPositions = await tx.position.findMany({
          where: { marketId: market.id, outcome: outcome as Outcome }
        });

        for (const position of winningPositions) {
          const payout = BigInt(position.shares) * 100n;

          const wallet = await tx.wallet.findUnique({
            where: { userId: position.userId }
          });

          if (!wallet) continue;

          const before = wallet.available;
          const after = before + payout;

          await tx.wallet.update({
            where: { userId: position.userId },
            data: { available: after }
          });

          await tx.ledgerEntry.create({
            data: {
              userId: position.userId,
              type: "MARKET_PAYOUT",
              amount: payout,
              before,
              after,
              meta: {
                marketId: market.id,
                outcome,
                shares: position.shares
              }
            }
          });
        }

        const resolved = await tx.market.update({
          where: { id: market.id },
          data: { status: MarketStatus.RESOLVED, resolvedTo: outcome as Outcome }
        });

        return { market: resolved };
      },
      { timeout: 30000 }
    );

    if ("error" in result) {
      const status = result.error === "Market not found" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    res.json({ market: result.market });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve market" });
    console.error(error);
  }
});

export default router;

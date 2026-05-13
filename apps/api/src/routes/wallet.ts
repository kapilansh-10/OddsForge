import { Prisma, Wallet } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

function serializeWallet(wallet: Wallet) {
  return {
    ...wallet,
    available: wallet.available.toString(),
    reserved: wallet.reserved.toString()
  };
}

router.post("/deposit", requireAuth, async (req, res) => {
  try {
    const { amount } = req.body as { amount?: number };

    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
      res.status(400).json({ error: "Amount must be a positive integer" });
      return;
    }

    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const updatedWallet = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const wallet = await tx.wallet.findUnique({
          where: { userId }
        });

        if (!wallet) {
          return null;
        }

        const depositAmount = BigInt(amount);
        const before = wallet.available;
        const after = before + depositAmount;

        const nextWallet = await tx.wallet.update({
          where: { userId },
          data: {
            available: after
          }
        });

        await tx.ledgerEntry.create({
          data: {
            userId,
            type: "DEPOSIT",
            amount: depositAmount,
            before,
            after
          }
        });

        return nextWallet;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (!updatedWallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    res.json({ wallet: serializeWallet(updatedWallet) });
  } catch (error) {
    res.status(500).json({ error: "Failed to deposit funds" });
    console.error(error);
  }
});

router.get("/balance", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: {
        available: true,
        reserved: true
      }
    });

    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    res.json({
      available: wallet.available.toString(),
      reserved: wallet.reserved.toString()
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wallet balance" });
    console.error(error);
  }
});

export default router;

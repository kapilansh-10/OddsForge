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

export default router;

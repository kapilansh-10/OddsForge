"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.post("/", auth_1.requireAuth, async (req, res) => {
    const { question } = req.body;
    if (!question) {
        res.status(400).json({ error: "Question is required" });
        return;
    }
    try {
        const market = await prisma_1.prisma.market.create({
            data: {
                question
            }
        });
        res.status(201).json({ market });
    }
    catch {
        res.status(500).json({ error: "Failed to create market" });
    }
});
router.get("/", async (_req, res) => {
    try {
        const markets = await prisma_1.prisma.market.findMany({
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
    }
    catch {
        res.status(500).json({ error: "Failed to fetch markets" });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const market = await prisma_1.prisma.market.findUnique({
            where: {
                id: req.params.id
            }
        });
        if (!market) {
            res.status(404).json({ error: "Market not found" });
            return;
        }
        res.json({ market });
    }
    catch {
        res.status(500).json({ error: "Failed to fetch market" });
    }
});
exports.default = router;

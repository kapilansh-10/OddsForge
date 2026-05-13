"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
function isSide(value) {
    return value === client_1.Side.BUY || value === client_1.Side.SELL;
}
function isOutcome(value) {
    return value === client_1.Outcome.YES || value === client_1.Outcome.NO;
}
router.post("/", auth_1.requireAuth, async (req, res) => {
    try {
        const { marketId, side, outcome, price, quantity } = req.body;
        if (!marketId) {
            res.status(400).json({ error: "Market is required" });
            return;
        }
        if (!isSide(side)) {
            res.status(400).json({ error: "Side must be BUY or SELL" });
            return;
        }
        if (side !== client_1.Side.BUY) {
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
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const market = await tx.market.findUnique({
                where: { id: marketId },
                select: { id: true }
            });
            if (!market) {
                return { error: "Market not found" };
            }
            const wallet = await tx.wallet.findUnique({
                where: { userId }
            });
            if (!wallet) {
                return { error: "Wallet not found" };
            }
            const cost = BigInt(price) * BigInt(quantity);
            if (wallet.available < cost) {
                return { error: "Insufficient funds" };
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
                    status: client_1.OrderStatus.OPEN
                }
            });
            return { order };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        if ("error" in result) {
            const status = result.error === "Insufficient funds" ? 400 : 404;
            res.status(status).json({ error: result.error });
            return;
        }
        res.status(201).json({ order: result.order });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create order" });
        console.error(error);
    }
});
router.get("/", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const orders = await prisma_1.prisma.order.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch orders" });
        console.error(error);
    }
});
exports.default = router;

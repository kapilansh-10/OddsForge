"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
function serializeWallet(wallet) {
    return {
        ...wallet,
        available: wallet.available.toString(),
        reserved: wallet.reserved.toString()
    };
}
router.post("/deposit", auth_1.requireAuth, async (req, res) => {
    try {
        const { amount } = req.body;
        if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
            res.status(400).json({ error: "Amount must be a positive integer" });
            return;
        }
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const updatedWallet = await prisma_1.prisma.$transaction(async (tx) => {
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
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        if (!updatedWallet) {
            res.status(404).json({ error: "Wallet not found" });
            return;
        }
        res.json({ wallet: serializeWallet(updatedWallet) });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to deposit funds" });
        console.error(error);
    }
});
router.get("/balance", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const wallet = await prisma_1.prisma.wallet.findUnique({
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
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch wallet balance" });
        console.error(error);
    }
});
exports.default = router;

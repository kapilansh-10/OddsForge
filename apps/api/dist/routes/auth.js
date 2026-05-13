"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
function signToken(payload) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT secret is not configured");
    }
    return jsonwebtoken_1.default.sign(payload, jwtSecret, { expiresIn: "7d" });
}
router.post("/register", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
    }
    try {
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        const user = await prisma_1.prisma.$transaction(async (tx) => {
            const createdUser = await tx.user.create({
                data: {
                    email,
                    passwordHash
                }
            });
            await tx.wallet.create({
                data: {
                    userId: createdUser.id
                }
            });
            return createdUser;
        });
        const token = signToken({ userId: user.id, email: user.email });
        res.status(201).json({ token });
    }
    catch (error) {
        if (error instanceof Error && error.message === "JWT secret is not configured") {
            res.status(500).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: "Failed to register user" });
        console.error(error);
    }
});
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
    }
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email }
        });
        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        const isPasswordValid = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        const token = signToken({ userId: user.id, email: user.email });
        res.json({ token });
    }
    catch (error) {
        if (error instanceof Error && error.message === "JWT secret is not configured") {
            res.status(500).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: "Failed to log in" });
    }
});
exports.default = router;

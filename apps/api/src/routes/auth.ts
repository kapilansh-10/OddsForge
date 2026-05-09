import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const router = Router();

function signToken(payload: { userId: string; email: string }): string {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT secret is not configured");
  }

  return jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
}

router.post("/register", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  } catch (error) {
    if (error instanceof Error && error.message === "JWT secret is not configured") {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Failed to register user" });
    console.error(error);
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email });

    res.json({ token });
  } catch (error) {
    if (error instanceof Error && error.message === "JWT secret is not configured") {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Failed to log in" });
  }
});

export default router;

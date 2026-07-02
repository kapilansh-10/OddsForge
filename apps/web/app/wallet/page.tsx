"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import socket from "@/lib/socket";
import { useAuthStore } from "@/lib/store";
import { useRequireAuth } from "@/lib/auth";

interface Balance {
  available: string;
  reserved: string;
}

function centsToDollars(cents: string): string {
  return (parseInt(cents, 10) / 100).toFixed(2);
}

export default function WalletPage() {
  const token = useRequireAuth();
  const userId = useAuthStore((s) => s.userId);

  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState<number>(10);
  const [depositing, setDepositing] = useState(false);
  const [depositMessage, setDepositMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await api.get("/wallet/balance");
      setBalance(res.data);
    } catch {
      setError("Failed to load balance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchBalance();
  }, [token, fetchBalance]);

  useEffect(() => {
    if (!token || !userId) return;

    socket.connect();
    socket.emit("join-user", { userId });

    socket.on("wallet-update", () => {
      fetchBalance();
    });

    return () => {
      socket.off("wallet-update");
      socket.disconnect();
    };
  }, [token, userId, fetchBalance]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepositMessage(null);
    setDepositing(true);

    try {
      await api.post("/wallet/deposit", { amount: Math.round(amount * 100) });
      setDepositMessage({ type: "success", text: `Deposited $${amount.toFixed(2)}` });
      await fetchBalance();
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
      ) {
        setDepositMessage({ type: "error", text: (err as { response: { data: { error: string } } }).response.data.error });
      } else {
        setDepositMessage({ type: "error", text: "Deposit failed" });
      }
    } finally {
      setDepositing(false);
    }
  };

  if (!token) return null;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6">Wallet</h1>

      {loading && <p className="text-zinc-400">Loading balance...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {balance && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
            <p className="text-xs text-zinc-400 mb-1">Available</p>
            <p className="text-2xl font-mono text-white">
              ${centsToDollars(balance.available)}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
            <p className="text-xs text-zinc-400 mb-1">Reserved</p>
            <p className="text-2xl font-mono text-zinc-400">
              ${centsToDollars(balance.reserved)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-700 rounded p-5">
        <h2 className="font-semibold mb-4">Deposit</h2>
        <form onSubmit={handleDeposit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Amount (USD)
            </label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:border-zinc-500"
            />
            <div className="flex gap-2 mt-2">
              {[10, 50, 100, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className="px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                >
                  +${preset}
                </button>
              ))}
            </div>
          </div>

          {depositMessage && (
            <p
              className={`text-sm ${
                depositMessage.type === "success" ? "text-green-400" : "text-red-400"
              }`}
            >
              {depositMessage.text}
            </p>
          )}

          <button
            type="submit"
            disabled={depositing}
            className="w-full bg-white text-black font-medium py-2 rounded hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {depositing ? "Depositing..." : "Deposit"}
          </button>
        </form>
      </div>
    </div>
  );
}

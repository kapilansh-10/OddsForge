"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";

interface Market {
  id: string;
  question: string;
  status: "OPEN" | "CLOSED" | "RESOLVED";
  createdAt: string;
}

const statusStyle: Record<Market["status"], string> = {
  OPEN: "text-green-400 bg-green-500/10 border-green-500/30",
  CLOSED: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  RESOLVED: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
};

export default function MarketsPage() {
  const token = useRequireAuth();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchMarkets = async () => {
    try {
      const res = await api.get("/markets");
      setMarkets(res.data.markets);
    } catch {
      setError("Failed to load markets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchMarkets();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.post("/markets", { question });
      setQuestion("");
      setShowForm(false);
      await fetchMarkets();
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
      ) {
        setCreateError((err as { response: { data: { error: string } } }).response.data.error);
      } else {
        setCreateError("Failed to create market");
      }
    } finally {
      setCreating(false);
    }
  };

  if (!token) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Markets</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-white text-black text-sm font-medium rounded hover:bg-zinc-200 transition-colors"
        >
          {showForm ? "Cancel" : "Create Market"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 bg-zinc-900 border border-zinc-700 rounded space-y-3"
        >
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              placeholder="Will X happen by Y?"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:border-zinc-500"
            />
          </div>
          {createError && <p className="text-red-400 text-sm">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-white text-black text-sm font-medium rounded hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {loading && <p className="text-zinc-400">Loading markets...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && markets.length === 0 && (
        <p className="text-zinc-400">No markets yet. Create one above.</p>
      )}

      <div className="grid gap-3">
        {markets.map((market) => (
          <Link
            key={market.id}
            href={`/markets/${market.id}`}
            className="block p-4 bg-zinc-900 border border-zinc-700 rounded hover:border-zinc-500 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-white font-medium">{market.question}</p>
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded border ${statusStyle[market.status]}`}
              >
                {market.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

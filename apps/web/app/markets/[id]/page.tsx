"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import socket from "@/lib/socket";
import { useAuthStore } from "@/lib/store";
import { useRequireAuth } from "@/lib/auth";

interface Order {
  id: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  filled: number;
  status: "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED";
}

interface Market {
  id: string;
  question: string;
  status: string;
}

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";

const orderStatusStyle: Record<Order["status"], string> = {
  OPEN: "text-blue-400",
  PARTIAL: "text-yellow-400",
  FILLED: "text-green-400",
  CANCELLED: "text-zinc-500",
};

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;

  const token = useRequireAuth();
  const userId = useAuthStore((s) => s.userId);

  const [market, setMarket] = useState<Market | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const [yesPrice, setYesPrice] = useState<number | null>(null);
  const [noPrice, setNoPrice] = useState<number | null>(null);

  const [side, setSide] = useState<Side>("BUY");
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [price, setPrice] = useState<number>(50);
  const [quantity, setQuantity] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [orderMessage, setOrderMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get("/orders");
      const all: Order[] = res.data.orders;
      setOrders(all.filter((o) => (o as unknown as { marketId: string }).marketId === marketId));
    } catch {
      // silently fail on order re-fetch
    } finally {
      setOrdersLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    if (!token) return;

    const fetchMarket = async () => {
      try {
        const res = await api.get(`/markets/${marketId}`);
        setMarket(res.data);
      } catch {
        setMarketError("Market not found");
      } finally {
        setMarketLoading(false);
      }
    };

    fetchMarket();
    fetchOrders();
  }, [token, marketId, fetchOrders]);

  useEffect(() => {
    if (!token || !userId) return;

    socket.connect();
    socket.emit("join-market", { marketId });
    socket.emit("join-user", { userId });

    socket.on("price-update", (data: { outcome: Outcome; price: number }) => {
      if (data.outcome === "YES") setYesPrice(data.price);
      if (data.outcome === "NO") setNoPrice(data.price);
    });

    socket.on("order-update", () => {
      fetchOrders();
    });

    return () => {
      socket.emit("leave-market", { marketId });
      socket.off("price-update");
      socket.off("order-update");
      socket.disconnect();
    };
  }, [token, userId, marketId, fetchOrders]);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderMessage(null);
    setSubmitting(true);

    try {
      await api.post("/orders", { marketId, side, outcome, price, quantity });
      setOrderMessage({ type: "success", text: "Order placed successfully" });
      await fetchOrders();
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
      ) {
        setOrderMessage({ type: "error", text: (err as { response: { data: { error: string } } }).response.data.error });
      } else {
        setOrderMessage({ type: "error", text: "Failed to place order" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) return null;

  if (marketLoading) {
    return <p className="text-zinc-400">Loading market...</p>;
  }

  if (marketError || !market) {
    return <p className="text-red-400">{marketError ?? "Market not found"}</p>;
  }

  const cost = price * quantity;

  return (
    <div className="space-y-8">
      {/* Top section */}
      <div>
        <h1 className="text-2xl font-bold mb-4">{market.question}</h1>
        <div className="flex gap-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 min-w-[120px]">
            <p className="text-xs text-zinc-400 mb-1">YES</p>
            <p className="text-2xl font-mono text-green-400">
              {yesPrice !== null ? yesPrice : "--"}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 min-w-[120px]">
            <p className="text-xs text-zinc-400 mb-1">NO</p>
            <p className="text-2xl font-mono text-red-400">
              {noPrice !== null ? noPrice : "--"}
            </p>
          </div>
        </div>
      </div>

      {/* Order form */}
      <div className="bg-zinc-900 border border-zinc-700 rounded p-5">
        <h2 className="font-semibold mb-4">Place Order</h2>
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          {/* Side toggle */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Side</label>
            <div className="flex gap-2">
              {(["BUY", "SELL"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`px-4 py-1.5 rounded text-sm font-medium border transition-colors ${
                    side === s
                      ? s === "BUY"
                        ? "bg-green-500 border-green-500 text-black"
                        : "bg-red-500 border-red-500 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Outcome toggle */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Outcome</label>
            <div className="flex gap-2">
              {(["YES", "NO"] as Outcome[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={`px-4 py-1.5 rounded text-sm font-medium border transition-colors ${
                    outcome === o
                      ? o === "YES"
                        ? "bg-green-500 border-green-500 text-black"
                        : "bg-red-500 border-red-500 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Price (1–99)
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Cost preview */}
          <p className="text-sm text-zinc-400">
            Cost preview:{" "}
            <span className="text-white font-mono">{cost}¢</span>
          </p>

          {orderMessage && (
            <p
              className={`text-sm ${
                orderMessage.type === "success" ? "text-green-400" : "text-red-400"
              }`}
            >
              {orderMessage.text}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black font-medium py-2 rounded hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Placing order..." : "Place Order"}
          </button>
        </form>
      </div>

      {/* My orders */}
      <div>
        <h2 className="font-semibold mb-4">My Orders</h2>

        {ordersLoading && <p className="text-zinc-400 text-sm">Loading orders...</p>}

        {!ordersLoading && orders.length === 0 && (
          <p className="text-zinc-400 text-sm">No orders yet for this market.</p>
        )}

        {!ordersLoading && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left pb-2 pr-4">Outcome</th>
                  <th className="text-left pb-2 pr-4">Side</th>
                  <th className="text-left pb-2 pr-4">Price</th>
                  <th className="text-left pb-2 pr-4">Qty</th>
                  <th className="text-left pb-2 pr-4">Filled</th>
                  <th className="text-left pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-zinc-800">
                    <td className="py-2 pr-4">{order.outcome}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          order.side === "BUY" ? "text-green-400" : "text-red-400"
                        }
                      >
                        {order.side}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{order.price}</td>
                    <td className="py-2 pr-4 font-mono">{order.quantity}</td>
                    <td className="py-2 pr-4 font-mono">{order.filled}</td>
                    <td className={`py-2 ${orderStatusStyle[order.status]}`}>
                      {order.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

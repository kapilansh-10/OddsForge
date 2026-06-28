"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function Navbar() {
  const router = useRouter();
  const { email, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    localStorage.removeItem("token");
    router.push("/auth/login");
  };

  return (
    <nav className="border-b border-zinc-800 bg-zinc-900">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/markets" className="font-bold text-lg tracking-tight">
          OddsForge
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/markets"
            className="text-zinc-400 hover:text-white transition-colors text-sm"
          >
            Markets
          </Link>
          <Link
            href="/wallet"
            className="text-zinc-400 hover:text-white transition-colors text-sm"
          >
            Wallet
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {email && (
            <span className="text-zinc-400 text-sm hidden sm:block">{email}</span>
          )}
          {email && (
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

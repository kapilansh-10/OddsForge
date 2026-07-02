import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market",
};

export default function MarketDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

export const metadata: Metadata = {
  title: {
    default: "OddsForge",
    template: "%s | OddsForge",
  },
  description: "A prediction market exchange. Trade on real-world outcomes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-[#0f0f0f] text-white min-h-screen antialiased flex flex-col">
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

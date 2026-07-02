import Link from "next/link";

const features = [
  {
    title: "Place Orders",
    description:
      "Buy and sell YES/NO shares at the price you choose across any open market.",
  },
  {
    title: "Real-time Matching",
    description:
      "Our matching engine fills orders instantly and streams live price updates as the book moves.",
  },
  {
    title: "Track Positions",
    description:
      "Monitor your open orders, fills, and wallet balance from a single dashboard.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="text-center py-20 sm:py-28">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          OddsForge
        </h1>
        <p className="mt-4 text-lg text-zinc-400 max-w-xl mx-auto">
          A prediction market exchange. Trade on real-world outcomes.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/markets"
            className="px-6 py-3 bg-white text-black font-medium rounded hover:bg-zinc-200 transition-colors"
          >
            Start Trading
          </Link>
          <a
            href="#features"
            className="px-6 py-3 border border-zinc-700 rounded text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="pb-20">
        <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {features.map(({ title, description }) => (
            <div
              key={title}
              className="bg-zinc-900 border border-zinc-700 rounded p-6"
            >
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-zinc-400">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

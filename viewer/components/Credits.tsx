import { Author } from "@/components/Bits";

/** The sources, in one box with the logos, as the bottom strip of Giga Maps. */
const SOURCES = [
  { what: "Works, amounts, years and beneficiaries", who: "IDB, «Overview Education Infrastructure», September 2026" },
  { what: "Schools and coordinates", who: "Ministry of Education school list, March 2024, as cleaned for CIMA" },
  { what: "Wealth index", who: "Meta Relative Wealth Index, HDX, 2021" },
  { what: "Settlement class", who: "WorldPop 2023, 1 km grid" },
  { what: "Districts", who: "IDB administrative boundaries" },
];

export default function Credits() {
  return (
    <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-white px-4 py-2"
      style={{ borderColor: "var(--rule)" }}>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/bid.png" alt="IDB" className="h-6 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/cima.png" alt="CIMA" className="h-6 w-auto" />
      </div>
      <dl className="flex flex-1 flex-wrap gap-x-5 gap-y-0.5 text-[10px] leading-tight" style={{ color: "var(--ink-3)" }}>
        {SOURCES.map((s) => (
          <div key={s.what}>
            <dt className="inline font-semibold" style={{ color: "var(--ink-2)" }}>{s.what}: </dt>
            <dd className="inline">{s.who}</dd>
          </div>
        ))}
      </dl>
      <Author />
    </footer>
  );
}

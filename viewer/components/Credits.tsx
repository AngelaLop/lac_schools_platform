import { Author } from "@/components/Bits";
import Info from "@/components/Info";

/** The sources, behind one "Sources" button in the bottom strip, as the bottom
 *  strip of Giga Maps: the text on the left, the logos on the right. */
const SOURCES = [
  { what: "Works, amounts, years and beneficiaries", who: "IDB, «Overview Education Infrastructure», September 2026" },
  { what: "Schools of the ICT works", who: "IDB, annex and bidding lots of the small ICT works, 2026" },
  { what: "Schools of the bathroom works", who: "IDB, Annex IX of the toilet group renovation, 2020" },
  { what: "Schools and coordinates", who: "Ministry of Education school list, March 2024, as cleaned for CIMA" },
  { what: "Wealth index", who: "Meta Relative Wealth Index, HDX, 2021" },
  { what: "Settlement class", who: "WorldPop 2023, 1 km grid" },
  { what: "Districts", who: "IDB administrative boundaries" },
];

export default function Credits() {
  return (
    // Desktop: one line, Sources | credit on the left and the logos on the
    // right. Phone: Sources and the logos on the first row, the credit alone
    // under them, last, like the signature of a note.
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-white px-4 py-2 max-md:py-2.5"
      style={{ borderColor: "var(--rule)" }}>
      <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>
        Sources
        <Info title="Sources">
          <dl className="space-y-1.5">
            {SOURCES.map((s) => (
              <div key={s.what}>
                <dt className="font-medium" style={{ color: "var(--ink)" }}>{s.what}</dt>
                <dd>{s.who}</dd>
              </div>
            ))}
          </dl>
        </Info>
      </span>
      {/* A thin rule, not a middle dot, between the two pieces of text. */}
      <span aria-hidden className="h-3.5 w-px max-md:hidden" style={{ background: "var(--rule)" }} />
      <span className="max-md:order-last max-md:w-full"><Author /></span>
      <div className="ml-auto flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/bid.png" alt="IDB" className="h-6 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/cima.png" alt="CIMA" className="h-6 w-auto" />
      </div>
    </footer>
  );
}

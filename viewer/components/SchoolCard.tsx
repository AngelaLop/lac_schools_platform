"use client";

import { Swatch } from "@/components/Bits";
import { AREA_LABEL, AREA_NOTE, int, moneyFull, type Dataset } from "@/lib/data";
import { programColor } from "@/lib/theme";

const QUINTILE_LABEL = ["", "the poorest fifth", "the second fifth", "the middle fifth", "the fourth fifth", "the richest fifth"];

// Plain wording of accessibility_platform/docs/coordinate_quality_spec.md §2.
const COORD_LABEL: Record<string, string> = {
  gps_validated: "Ministry coordinate, falls in its declared area",
  boundary_zone: "Ministry coordinate, within 5 km of the edge of its declared area",
  adm_mismatch: "Ministry coordinate, falls outside its declared area",
  geocoder_disagrees: "Ministry coordinate, an address search places it elsewhere",
  cluster_centroid: "Shared with other schools, likely a placeholder",
  gps_unverified: "Ministry coordinate, not validated",
};

export default function SchoolCard({ data, id, onClose }: { data: Dataset; id: string; onClose: () => void }) {
  const s = data.schools.find((x) => x.id === id);
  if (!s) return null;
  const works = data.interventions.filter((r) => s.ivs.includes(r.id));
  const order = data.country.programs;

  return (
    <div className="flex max-h-full flex-col overflow-hidden bg-white shadow-lg">
      <div className="flex items-start gap-3 px-4 py-3" style={{ background: "var(--line)", color: "#fff" }}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider opacity-70">
            {s.id} · {[s.adm2_name, s.district].filter(Boolean).join(", ")}
          </p>
          <h2 className="text-[20px] font-medium leading-tight">{s.name}</h2>
          <p className="text-[12px] opacity-80">
            {s.sector} · {s.levels.join(", ") || "level not recorded"}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="-mr-1 text-xl leading-none opacity-80 hover:opacity-100">×</button>
      </div>

      <div className="overflow-y-auto">
        {works.length === 0 && (
          <p className="px-4 py-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
            No IDB works recorded at this school in the IDB sheet.
          </p>
        )}
        {works.map((w) => (
          <div key={w.id} className="border-b px-4 py-3" style={{ borderColor: "var(--rule)" }}>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Swatch color={programColor(w.program, order)} />
              <strong>{w.program_name}</strong>
              <span style={{ color: "var(--ink-3)" }}>{w.program}</span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>As named by the IDB: {w.project}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <Fact label="Year" value={w.year ? String(w.year) : "–"} />
              <Fact label="Invested" value={w.amount != null ? moneyFull(w.amount, data.currency) : "–"} />
              <Fact label="Beneficiaries" value={w.beneficiaries != null ? int(w.beneficiaries) : w.beneficiaries_note ?? "–"} />
            </dl>
            {w.to_confirm && (
              <p className="mt-2 rounded-sm px-2 py-1 text-[11px]" style={{ background: "#fdf1e9", color: "#8a3f1c" }}>
                Placed on this school by the number in its name. Awaiting confirmation from the IDB.
              </p>
            )}
            {w.works.length > 0 && (
              <>
                <p className="mt-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>Works</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px]" style={{ color: "var(--ink-2)" }}>
                  {w.works.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            )}
          </div>
        ))}

        <div className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>Context</p>
          <Wealth data={data} rwi={s.rwi} q={s.rwi_q} />
          <dl className="mt-1 space-y-1 text-[12px]">
            <Row label="Settlement" value={s.area ? AREA_LABEL[s.area] : "–"} hint={s.area ? AREA_NOTE[s.area] : undefined} />
            <Row label="Coordinate" value={COORD_LABEL[s.coord ?? ""] ?? s.coord ?? "–"} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>{label}</dt>
      <dd className="num text-[13px] font-medium">{value}</dd>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3" title={hint}>
      <dt style={{ color: "var(--ink-3)" }}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/** Where the school stands among the country's schools on the Meta Relative
 *  Wealth Index: the quintile first, the raw value and its range as context. */
function Wealth({ data, rwi, q }: { data: Dataset; rwi: number | null; q: number | null }) {
  const values = data.schools.map((x) => x.rwi).filter((v): v is number => v != null);
  if (rwi == null || q == null) {
    return (
      <div className="mb-2 mt-1 text-[12px]">
        <p style={{ color: "var(--ink-3)" }}>Wealth quintile</p>
        <p>No index value: no Relative Wealth Index cell within 5 km of the school.</p>
      </div>
    );
  }
  return (
    <div className="mb-3 mt-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span style={{ color: "var(--ink-3)" }}>Wealth quintile</span>
        <span><strong className="num font-medium">Quintile {q} of 5</strong>, {QUINTILE_LABEL[q]}</span>
      </div>
      <div className="mt-1.5 flex gap-[2px]" role="img" aria-label={`Quintile ${q} of 5`}>
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="h-2 flex-1 rounded-[2px]"
            style={{ background: k === q ? "var(--line)" : "var(--rule)" }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px]" style={{ color: "var(--ink-3)" }}>
        <span>Poorest</span><span>Richest</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
        The {values.length} schools with an index value, split in five equal groups. Index at this school{" "}
        <span className="num">{rwi.toFixed(2)}</span>; the country&apos;s schools range from{" "}
        <span className="num">{Math.min(...values).toFixed(2)}</span> to <span className="num">{Math.max(...values).toFixed(2)}</span>.
        Meta Relative Wealth Index of the area around the school, not of its students.
      </p>
    </div>
  );
}

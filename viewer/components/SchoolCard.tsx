"use client";

import { Swatch } from "@/components/Bits";
import { AREA_LABEL, AREA_NOTE, int, moneyFull, type Dataset } from "@/lib/data";
import { programColor } from "@/lib/theme";

const QUINTILE_LABEL = ["", "poorest", "second poorest", "middle", "second richest", "richest"];

// Plain wording of accessibility_platform/docs/coordinate_quality_spec.md §2.
const COORD_LABEL: Record<string, string> = {
  gps_validated: "Ministry coordinate, falls in its declared area",
  boundary_zone: "Ministry coordinate, just outside its declared area (under 5 km from the edge); an address search agrees with it",
  adm_mismatch: "Ministry coordinate, falls outside its declared area",
  geocoder_disagrees: "Ministry coordinate; an address search places it far away or in another area",
  cluster_centroid: "Ministry coordinate shared with other schools; likely a placeholder",
  gps_unverified: "Ministry coordinate, not validated",
  list_coordinate: "Coordinate of the IDB list; the site is not in the ministry list",
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
          <p className="flex gap-2 text-[10px] uppercase tracking-wider">
            <span className="opacity-70">{[s.adm2_name, s.district].filter(Boolean).join(", ")}</span>
            <span className="opacity-50">{s.id}</span>
          </p>
          <h2 className="text-[20px] font-medium leading-tight">{s.name}</h2>
          <p className="text-[12px] opacity-80">
            {s.in_base ? `${s.sector} (${s.levels.join(", ") || "level not recorded"})` : "Not in the ministry list of schools"}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close the school card" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none opacity-80 hover:opacity-100">×</button>
      </div>

      <div className="overflow-y-auto">
        {works.length === 0 && (
          <p className="px-4 py-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
            No project at this school in the IDB sheet.
          </p>
        )}
        {works.map((w) => (
          <div key={w.id} className="border-b px-4 py-3" style={{ borderColor: "var(--rule)" }}>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Swatch color={programColor(w.program, order)} />
              <strong>{w.program_name}</strong>
              <span style={{ color: "var(--ink-3)" }}>{w.program}</span>
            </div>
            {w.list_source ? (
              <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                Listed as {w.project} in the {w.list_source}, {w.list_row}. Part of the project {projectName(data, w.parent)}.
              </p>
            ) : (
              <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>Name in the IDB sheet: {w.project}</p>
            )}
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <Fact label="Year" value={w.year ? String(w.year) : "–"} />
              <Fact label="Amount" value={w.amount != null ? moneyFull(w.amount, data.currency) : "–"} />
              <Fact label="Beneficiaries" value={w.beneficiaries != null ? int(w.beneficiaries) : w.beneficiaries_note ?? "–"} />
            </dl>
            {w.list_source && (
              <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
                {w.amount_note}. Beneficiaries are given for the whole project only.
              </p>
            )}
            {w.list_detail.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[12px]" style={{ color: "var(--ink-2)" }}>
                {w.list_detail.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            )}
            {w.list_note && (
              <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>How it was placed: {w.list_note}</p>
            )}
            {w.to_confirm && (
              <p className="mt-2 rounded-sm px-2 py-1 text-[11px]" style={{ background: "#fdf1e9", color: "#8a3f1c" }}>
                Placed on this school from its name. Awaiting confirmation from the IDB.
              </p>
            )}
            {w.works.length > 0 && (
              <>
                <p className="mt-3 text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>Works</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px]" style={{ color: "var(--ink-2)" }}>
                  {w.works.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            )}
          </div>
        ))}

        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>Context</p>
          {s.in_base ? (
            <>
              <Wealth data={data} rwi={s.rwi} q={s.rwi_q} cell={s.cell ?? false} />
              <dl className="mt-1 space-y-1 text-[12px]">
                <Row label="Settlement" value={s.area ? AREA_LABEL[s.area] : "–"} hint={s.area ? AREA_NOTE[s.area] : undefined} />
                <Row label="Coordinate" value={COORD_LABEL[s.coord ?? ""] ?? s.coord ?? "–"} />
              </dl>
            </>
          ) : (
            <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--ink-2)" }}>
              This site is not in the ministry list of schools (March 2024), so it has no wealth index or settlement
              class. It is placed at the coordinates of the IDB list.
            </p>
          )}
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
function Wealth({ data, rwi, q, cell }: { data: Dataset; rwi: number | null; q: number | null; cell: boolean }) {
  const values = data.schools.map((x) => x.rwi).filter((v): v is number => v != null);
  const size = data.schools.filter((x) => x.rwi_q === q).length;
  if (rwi == null || q == null) {
    return (
      <div className="mb-2 mt-1 text-[12px]">
        <p style={{ color: "var(--ink-3)" }}>Wealth quintile</p>
        <p>{cell
          ? "No index value: the nearest Relative Wealth Index point is more than 5 km from the school's 1 km cell."
          : "No index value: the school falls outside the populated 1 km cells of the grid."}</p>
      </div>
    );
  }
  return (
    <div className="mb-3 mt-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span style={{ color: "var(--ink-3)" }}>Wealth quintile</span>
        <span><strong className="num font-medium">Quintile {q} of 5</strong> ({QUINTILE_LABEL[q]})</span>
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
        Quintile cuts over the {values.length} schools with an index value; this group has {size}, as schools
        sharing a cell tie. Index at this school{" "}
        <span className="num">{rwi.toFixed(2)}</span>; the country&apos;s schools range from{" "}
        <span className="num">{Math.min(...values).toFixed(2)}</span> to <span className="num">{Math.max(...values).toFixed(2)}</span>.
        Meta Relative Wealth Index of the area around the school, not of its students.
      </p>
    </div>
  );
}

/** The name of a project in the IDB sheet, from its row id. */
function projectName(data: Dataset, id: string): string {
  return data.interventions.find((r) => r.id === id)?.project ?? id;
}

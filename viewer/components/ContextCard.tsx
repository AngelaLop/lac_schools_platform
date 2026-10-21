"use client";

import { FoldCard } from "@/components/Bits";
import Info from "@/components/Info";
import { AREA_LABEL, AREA_NOTE, activeSchools, compare, type Dataset, type Filter } from "@/lib/data";

const QUINTILES = [1, 2, 3, 4, 5];
const AREAS = ["urbana", "no_urbana", "dispersa"] as const;

/** Who the works reach: the schools with works against all schools, by wealth
 *  and by settlement. Its own card, folded by default, under the main panel. */
export default function ContextCard({ data, filter }: { data: Dataset; filter: Filter }) {
  const placed = activeSchools(data.interventions, filter);
  const rwi = compare(data.schools, placed, (s) => s.rwi_q, QUINTILES);
  const area = compare(data.schools, placed, (s) => s.area, [...AREAS]);

  return (
    <FoldCard title="Who the works reach" subtitle="Schools with works against all schools, by wealth and settlement">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium">
            Wealth quintile
            <Info title="Wealth quintile">
              <p>
                The Relative Wealth Index is an estimate by Meta&apos;s Data for Good team, with researchers at UC
                Berkeley, of how wealthy an area is compared with the rest of the same country. It is built from
                satellite imagery and connectivity data, trained on household surveys, in cells of 2.4 km. It is
                relative: it ranks places within Suriname and cannot be compared across countries. The file used
                here was published on HDX in 2021.
              </p>
              <p className="mt-2">
                Each school takes the value of the nearest cell. That describes the area around the school, not
                its students. Q1 is the poorest fifth of the country&apos;s schools with a value, Q5 the richest.
              </p>
              <p className="mt-2">
                {rwi.missingAll} schools sit more than 5 km from an index cell and have no value
                {rwi.missingIv ? `, ${rwi.missingIv} of them with works.` : "."}
              </p>
            </Info>
          </h3>
          <Compare rows={rwi.rows.map((r) => ({ label: r.key === 1 ? "Q1 poorest" : r.key === 5 ? "Q5 richest" : `Q${r.key}`, all: r.all, iv: r.iv }))}
            nAll={rwi.nAll} nIv={rwi.nIv} />
          {rwi.nIv > 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
              <strong className="num font-medium">{rwi.rows[0].iv + rwi.rows[1].iv}</strong> of {rwi.nIv} schools with works
              and an index value are in Q1 or Q2, the two poorest quintiles, against 40% of all schools.
            </p>
          )}

          <h3 className="mb-2 mt-4 flex items-center gap-1.5 text-[12px] font-medium">
            Settlement
            <Info title="Settlement">
              <p>
                WorldPop 2023 population, added up in cells of 1 km. Neighbouring populated cells are grouped into
                settlements, and each settlement is classed by its density and size:
              </p>
              <ul className="mt-2 space-y-1">
                {AREAS.map((k) => (
                  <li key={k}><strong className="font-medium" style={{ color: "var(--ink)" }}>{AREA_LABEL[k]}:</strong> {AREA_NOTE[k]}</li>
                ))}
              </ul>
              <p className="mt-2">
                Each school takes the class of the cell it sits in. Classification from the accessibility platform
                (pipeline/06_pop_grid.py, definitions.md).
                {area.missingAll ? ` ${area.missingAll} schools fall in a cell with no class and are left out.` : ""}
              </p>
            </Info>
          </h3>
          <Compare rows={area.rows.map((r) => ({ label: AREA_LABEL[r.key], all: r.all, iv: r.iv, title: AREA_NOTE[r.key] }))}
            nAll={area.nAll} nIv={area.nIv} />
    </FoldCard>
  );
}

/** Paired bars: share of all schools against share of schools with works. */
function Compare({ rows, nAll, nIv }: { rows: { label: string; all: number; iv: number; title?: string }[]; nAll: number; nIv: number }) {
  const pct = (x: number, n: number) => (n ? (100 * x) / n : 0);
  const max = Math.max(...rows.flatMap((r) => [pct(r.all, nAll), pct(r.iv, nIv)]), 1);
  return (
    <div>
      <div className="mb-1.5 flex gap-3 text-[11px]" style={{ color: "var(--ink-2)" }}>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--muted)" }} />All schools ({nAll})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--line)" }} />With works ({nIv})</span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[72px_1fr] items-center gap-2 text-[11px]" title={r.title}>
            <span style={{ color: "var(--ink-2)" }}>{r.label}</span>
            <div className="space-y-[2px]">
              <Bar w={pct(r.all, nAll) / max} color="var(--muted)" text={`${Math.round(pct(r.all, nAll))}%`} hint={`${r.all} of ${nAll} schools`} />
              <Bar w={pct(r.iv, nIv) / max} color="var(--line)" text={`${Math.round(pct(r.iv, nIv))}%`} hint={`${r.iv} of ${nIv} schools with works`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ w, color, text, hint }: { w: number; color: string; text: string; hint: string }) {
  return (
    <div className="flex items-center gap-1.5" title={hint}>
      <div className="h-2 rounded-r-[3px]" style={{ width: `${Math.max(w * 78, 0.5)}%`, background: color }} />
      <span className="num text-[10px]" style={{ color: "var(--ink-2)" }}>{text}</span>
    </div>
  );
}

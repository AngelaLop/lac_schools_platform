"use client";

import { useMemo } from "react";

import { Section, Swatch } from "@/components/Bits";
import OffMapInfo from "@/components/OffMapInfo";
import {
  applyFilter, byDistrict, byProgram, byYear, int, money, moneyFull, totals,
  type Dataset, type Filter,
} from "@/lib/data";
import { programColor } from "@/lib/theme";

interface Props {
  data: Dataset;
  filter: Filter;
  years: number[];
  district: string | null;
  onFilter: (f: Filter) => void;
  onDistrict: (adm1: string | null) => void;
  onSelect: (id: string) => void;
}

export default function Dashboard({ data, filter, years, district, onFilter, onDistrict, onSelect }: Props) {
  const { country, currency, programs } = data;
  const order = country.programs;
  const rows = useMemo(() => applyFilter(data.interventions, filter), [data, filter]);
  // The program chart answers "how much per program" for the chosen years, so
  // it ignores the program filter; the year chart ignores the year filter.
  const rowsAllPrograms = useMemo(() => applyFilter(data.interventions, { ...filter, program: null }), [data, filter]);
  const rowsAllYears = useMemo(
    () => applyFilter(data.interventions, { ...filter, year: Math.max(...years), only: false }), [data, filter, years]);
  const progs = byProgram(rowsAllPrograms, programs);
  const maxProg = Math.max(...progs.map((p) => p.amount), 1);
  const perYear = byYear(rowsAllYears, programs, years);
  const maxYear = Math.max(...perYear.map((y) => y.parts.reduce((a, p) => a + p.amount, 0)), 1);
  const districts = byDistrict(data.schools, rows);
  const last = Math.max(...years);
  const yearIn = (y: number) => (filter.only ? y === filter.year : y <= filter.year);


  return (
    <div className="flex flex-col">
      <div className="px-4 pb-2 pt-2.5">
        <h2 className="text-[13px] font-medium">Investment by</h2>
        <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>Click a year or a program to filter the map.</p>
      </div>
      {/* Years --------------------------------------------------------------- */}
      <Section title="Year" collapsible>
        <div className="flex h-24 items-end gap-[3px] [@media(max-height:820px)]:h-16">
          {perYear.map((y) => {
            const total = y.parts.reduce((a, p) => a + p.amount, 0);
            return (
              <button key={y.year} className="flex h-full flex-1 flex-col items-center justify-end"
                title={`${y.year}: ${moneyFull(total, currency)}`}
                onClick={() => onFilter(filter.only && filter.year === y.year
                  ? { ...filter, year: last, only: false }
                  : { ...filter, year: y.year, only: true })}>
                <div className="flex w-full flex-col-reverse gap-[2px]"
                  style={{ height: `${(100 * total) / maxYear}%`, opacity: yearIn(y.year) ? 1 : 0.25 }}>
                  {y.parts.filter((p) => p.amount > 0).map((p, i, arr) => (
                    <div key={p.code} style={{
                      flexGrow: p.amount, background: programColor(p.code, order),
                      borderRadius: i === arr.length - 1 ? "3px 3px 0 0" : 0,
                    }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex gap-[3px] text-center text-[10px]" style={{ color: "var(--ink-3)" }}>
          {perYear.map((y) => (
            <span key={y.year} className="num flex-1"
              style={{ fontWeight: filter.only && filter.year === y.year ? 600 : 400, color: filter.only && filter.year === y.year ? "var(--ink)" : undefined }}>
              {y.year}
            </span>
          ))}
        </div>
      </Section>

      {/* Programs ------------------------------------------------------------ */}
      <Section title="Program" collapsible>
        <ul className="space-y-1 [@media(max-height:820px)]:space-y-0.5">
          {progs.map((p) => {
            const on = filter.program == null || filter.program === p.code;
            return (
              <li key={p.code}>
                <button onClick={() => onFilter({ ...filter, program: filter.program === p.code ? null : p.code })}
                  className="w-full rounded-sm px-1 py-1 text-left hover:bg-[var(--panel)] [@media(max-height:820px)]:py-0.5"
                  style={{ opacity: on ? 1 : 0.4, background: filter.program === p.code ? "var(--panel)" : undefined }}>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1.5">
                      <Swatch color={programColor(p.code, order)} />
                      <strong className="font-medium">{p.name}</strong>
                      <span style={{ color: "var(--ink-3)" }}>{p.code} · {p.projects} {p.projects === 1 ? "project" : "projects"}</span>
                    </span>
                    <span className="num" style={{ color: "var(--ink-2)" }}>{money(p.amount, currency)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full [@media(max-height:820px)]:mt-0.5 [@media(max-height:820px)]:h-1.5" style={{ background: "var(--rule)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(100 * p.amount) / maxProg}%`, background: programColor(p.code, order) }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Districts ----------------------------------------------------------- */}
      <Section title="District" collapsible defaultOpen={false} note="Click a district to frame it on the map.">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
              <th className="pb-1 font-medium">District</th>
              <th className="pb-1 text-right font-medium">Schools</th>
              <th className="pb-1 text-right font-medium">With works</th>
              <th className="pb-1 text-right font-medium">Invested</th>
            </tr>
          </thead>
          <tbody>
            {districts.map((d) => (
              <tr key={d.adm1} onClick={() => onDistrict(district === d.adm1 ? null : d.adm1)}
                className="cursor-pointer border-t hover:bg-[var(--panel)]"
                style={{ borderColor: "var(--rule)", background: district === d.adm1 ? "var(--sea)" : undefined }}>
                <td className="py-1">{d.name}</td>
                <td className="num py-1 text-right">{d.schools}</td>
                <td className="num py-1 text-right">{d.iv || "–"}</td>
                <td className="num py-1 text-right">{d.amount ? money(d.amount, "") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Amounts in {currency}. Only works placed on a school are counted by district.
        </p>
      </Section>

      <SchoolList data={data} rows={rows} onSelect={onSelect} />

    </div>
  );
}

function Kpi({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div title={hint}>
      <p className="num text-[20px] font-medium leading-none" style={{ color: "var(--ink)" }}>{value}</p>
      <p className="mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

/** The schools with works, as a table view of the map. */
function SchoolList({ data, rows, onSelect }: { data: Dataset; rows: Dataset["interventions"]; onSelect: (id: string) => void }) {
  const bySchool = new Map(data.schools.map((s) => [s.id, s]));
  const placed = rows.filter((r) => r.school).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  return (
    <Section title={`Schools (list of ${new Set(placed.map((r) => r.school)).size})`} collapsible defaultOpen={false}
      note="Largest investment first. Click a school to open its card.">
      <ul className="space-y-1 text-[12px]">
        {placed.map((r) => {
          const s = bySchool.get(r.school!);
          return (
            <li key={r.id}>
              <button onClick={() => onSelect(r.school!)} className="flex w-full items-center justify-between gap-2 text-left hover:underline">
                <span className="flex items-center gap-1.5">
                  <Swatch color={programColor(r.program, data.country.programs)} size={8} />
                  {s?.name ?? r.project}
                </span>
                <span className="num shrink-0" style={{ color: "var(--ink-3)" }}>{r.year} · {money(r.amount ?? 0, "")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The headline figures for the current filter, under the title. */
export function Headline({ data, filter, years, onFilter }: {
  data: Dataset; filter: Filter; years: number[]; onFilter: (f: Filter) => void;
}) {
  const { currency, programs } = data;
  const t = totals(applyFilter(data.interventions, filter));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const period = filter.only ? `in ${filter.year}` : filter.year === last ? `${first}–${last}` : `${first} to ${filter.year}`;
  const progName = filter.program ? programs.find((p) => p.code === filter.program)?.name : null;
  return (
    <div className="px-4 pb-2.5 pt-2.5">
      <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--ink-3)" }}>
        Invested {period}{progName ? ` · ${progName}` : ""}
      </p>
      {/* A div, not a p: the info popup inside is a block. */}
      <div className="flex items-center gap-2">
        <span className="num text-[32px] font-medium leading-none" title={moneyFull(t.amount, currency)}>
          {money(t.amount, currency)}
        </span>
        <OffMapInfo data={data} filter={filter} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]" style={{ color: "var(--ink-2)" }}>
        <Kpi value={int(t.projects)} label="projects" />
        <Kpi value={int(t.schools)} label={`of ${int(data.schools.length)} schools`} hint="Schools with works, on the map, out of all the schools in the base." />
        <Kpi value={int(t.beneficiaries)} label="beneficiaries"
          hint="Sum of the figures in the IDB sheet. A student can be counted in more than one project, so this is not a count of people." />
      </div>
      {(filter.program || filter.only) && (
        <button onClick={() => onFilter({ year: last, only: false, program: null })}
          className="mt-2 text-[12px] underline" style={{ color: "var(--accent)" }}>
          Clear filters
        </button>
      )}
    </div>
  );
}

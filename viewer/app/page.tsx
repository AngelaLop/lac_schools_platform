"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Flag, Swatch } from "@/components/Bits";
import ContextCard from "@/components/ContextCard";
import Credits from "@/components/Credits";
import Dashboard, { Headline } from "@/components/Dashboard";
import SchoolCard from "@/components/SchoolCard";
import Sheet, { type Snap } from "@/components/Sheet";
import Timeline from "@/components/Timeline";
import { PLACEMENT_LABEL, activeSchools, applyFilter, loadDataset, money, type Dataset, type Filter } from "@/lib/data";
import { pinSvg } from "@/lib/pin";
import { PALETTE, programColor } from "@/lib/theme";

// MapLibre touches window on import, so the map loads on the client only.
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

/** One country per deployment for now; the country is a parameter from day one. */
const DEFAULT_COUNTRY = "SUR";

function readUrl() {
  const q = new URLSearchParams(window.location.search);
  return {
    country: q.get("country"), school: q.get("school"), district: q.get("district"),
    year: q.get("year"), only: q.get("only") === "1", program: q.get("program"),
  };
}

export default function Page() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ year: 0, only: false, program: null });
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);

  useEffect(() => {
    const u = readUrl();
    loadDataset((u.country ?? DEFAULT_COUNTRY).toUpperCase())
      .then((d) => {
        setData(d);
        const ys = d.interventions.map((r) => r.year).filter((y): y is number => y != null);
        setFilter({ year: u.year ? Number(u.year) : Math.max(...ys), only: u.only, program: u.program });
        if (u.school) setSelected(u.school);
        if (u.district) setDistrict(u.district);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // The state lives in the URL, so a view can be sent as a link.
  useEffect(() => {
    if (!data) return;
    const q = new URLSearchParams();
    if (data.country.iso3 !== DEFAULT_COUNTRY) q.set("country", data.country.iso3);
    if (selected) q.set("school", selected);
    if (district) q.set("district", district);
    q.set("year", String(filter.year));
    if (filter.only) q.set("only", "1");
    if (filter.program) q.set("program", filter.program);
    window.history.replaceState(null, "", `?${q}`);
  }, [data, selected, district, filter]);

  const years = useMemo(() => {
    if (!data) return [];
    const ys = data.interventions.map((r) => r.year).filter((y): y is number => y != null);
    const out = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push(y);
    return out;
  }, [data]);

  const active = useMemo(() => (data ? activeSchools(data.interventions, filter) : new Set<string>()), [data, filter]);
  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  const onFilter = useCallback((f: Filter) => setFilter(f), []);
  const onHome = useCallback(() => { setSelected(null); setDistrict(null); }, []);

  const isMobile = useIsMobile();
  const [snap, setSnap] = useState<Snap>("peek");
  // On a phone a school opens in the sheet, raised to half the screen.
  useEffect(() => { if (isMobile && selected) setSnap("half"); }, [isMobile, selected]);

  if (error) return <p className="p-6">Could not load the data: {error}</p>;
  if (!data) return <p className="p-6" style={{ color: "var(--ink-3)" }}>Loading…</p>;

  const onDistrict = (d: string | null) => { setSelected(null); setDistrict(d); };
  const map = (
    <>
      <Map data={data} active={active} selected={selected} district={district} onSelect={onSelect}
        onHome={onHome} />
      <Legend data={data} filter={filter} />
      <OffMapNotice data={data} filter={filter} />
    </>
  );

  // Phone: the map fills the screen, the title is a slim bar on top and the
  // panels live in a bottom sheet, as in a maps app.
  if (isMobile) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0">{map}</div>
        <header className="absolute inset-x-0 top-0 z-20 px-4 py-2" style={{ background: "var(--line)", color: "#fff" }}>
          <h1 className="brand text-[19px] leading-tight">{data.country.title}</h1>
          <p className="flex items-center gap-1.5 text-[12px]">
            <Flag iso3={data.country.iso3} height={11} />
            <strong className="font-medium">{data.country.name}</strong>
            <span className="truncate opacity-70">· {data.country.subtitle}</span>
          </p>
        </header>
        <Sheet snap={snap} onSnap={setSnap}>
          {selected ? (
            <SchoolCard data={data} id={selected} onClose={() => { setSelected(null); setSnap("peek"); }} />
          ) : (
            <div className="flex flex-col">
              <Timeline data={data} years={years} filter={filter} playing={playing} onFilter={onFilter} onPlaying={setPlaying} />
              <Headline data={data} filter={filter} years={years} onFilter={onFilter} />
              <div className="border-t" style={{ borderColor: "var(--rule)" }}>
                <Dashboard data={data} filter={filter} years={years} district={district} onFilter={onFilter}
                  onDistrict={(d) => { onDistrict(d); setSnap("peek"); }} onSelect={onSelect} />
              </div>
              <div className="flex flex-col gap-2 p-2" style={{ background: "var(--panel)" }}>
                <ContextCard data={data} filter={filter} />
                  </div>
              <Credits />
            </div>
          )}
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="relative flex-1">
        {/* Map ------------------------------------------------------------- */}
        <div className="absolute inset-0">{map}</div>

        {/* Left column: title and headline, the breakdown, and the context card */}
        <aside className="absolute bottom-3 left-3 top-3 z-20 flex w-[380px] flex-col gap-2">
          <div className="shrink-0 overflow-hidden bg-white shadow-lg">
            <header className="px-4 py-2.5" style={{ background: "var(--line)", color: "#fff" }}>
              <h1 className="brand text-[22px] leading-none">{data.country.title}</h1>
              <p className="mt-1 text-[12px]" style={{ color: "#9fdcec" }}>{data.country.subtitle}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px]">
                <span className="opacity-70">Country:</span>
                <Flag iso3={data.country.iso3} height={13} />
                <strong className="font-medium">{data.country.name}</strong>
              </p>
            </header>
            <Headline data={data} filter={filter} years={years} onFilter={onFilter} />
          </div>
          <div className="min-h-0 shrink overflow-y-auto bg-white shadow-lg">
            <Dashboard data={data} filter={filter} years={years} district={district} onFilter={onFilter}
              onDistrict={onDistrict} onSelect={onSelect} />
          </div>
          <div className="flex max-h-[50%] shrink-0 flex-col gap-2 overflow-y-auto">
            <ContextCard data={data} filter={filter} />
          </div>
        </aside>

        {/* School card ------------------------------------------------------ */}
        {selected && (
          <div className="absolute bottom-[96px] right-14 top-3 z-20 flex w-[360px] flex-col">
            <SchoolCard data={data} id={selected} onClose={() => setSelected(null)} />
          </div>
        )}

        {/* Timeline --------------------------------------------------------- */}
        <div className="absolute bottom-3 left-[404px] right-14 z-10">
          <Timeline data={data} years={years} filter={filter} playing={playing} onFilter={onFilter} onPlaying={setPlaying} />
        </div>
      </div>
      <Credits />
    </div>
  );
}

/** True under the md breakpoint (768 px), where the phone layout takes over. */
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  return mobile;
}

/** Each program with its count of schools under the current filter. */
function Legend({ data, filter }: { data: Dataset; filter: Filter }) {
  const rows = applyFilter(data.interventions, { ...filter, program: null });
  const onMap = new Set(data.schools.filter((s) => s.ivs.length).map((s) => s.program));
  const schools = (code: string) => new Set(rows.filter((r) => r.program === code && r.school).map((r) => r.school)).size;
  return (
    <div className="absolute left-[404px] top-3 z-10 bg-white/90 px-3 py-2 text-[11px] shadow-sm max-md:left-2 max-md:top-[64px] max-md:px-2 max-md:py-1.5 max-md:text-[10px]"
      style={{ color: "var(--ink-2)" }}>
      {data.programs.filter((p) => onMap.has(p.code)).map((p) => (
        <div key={p.code} className="flex items-center gap-1.5"
          style={{ opacity: filter.program && filter.program !== p.code ? 0.4 : 1 }}>
          <span className="inline-flex w-[10px] justify-center"
            dangerouslySetInnerHTML={{ __html: pinSvg(programColor(p.code, data.country.programs), 0.42) }} />
          {p.name} <span className="num" style={{ color: "var(--ink-3)" }}>({schools(p.code)} schools)</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Swatch color={PALETTE.school} size={6} />Other schools
        <span className="num" style={{ color: "var(--ink-3)" }}>({data.schools.filter((s) => !s.ivs.length).length})</span>
      </div>
    </div>
  );
}

/** When the filter holds works but none of them sits on one school, the map
 *  alone would look empty and wrong. Say what those works are instead. */
function OffMapNotice({ data, filter }: { data: Dataset; filter: Filter }) {
  const rows = applyFilter(data.interventions, filter);
  if (!rows.length || rows.some((r) => r.school)) return null;
  const when = filter.only ? `In ${filter.year}` : `Up to ${filter.year}`;
  return (
    <div className="absolute left-1/2 top-1/2 z-10 w-[360px] -translate-y-1/2 bg-white px-4 py-3 text-[12px] shadow-md max-md:left-2 max-md:right-2 max-md:w-auto md:-translate-x-1/4"
      style={{ color: "var(--ink-2)" }}>
      <p className="font-medium" style={{ color: "var(--ink)" }}>{when}, no work can be placed on one school</p>
      <ul className="mt-1 space-y-1">
        {rows.map((r) => (
          <li key={r.id}>
            {r.project} <span style={{ color: "var(--ink-3)" }}>· {r.program_name} · {money(r.amount ?? 0, data.currency)}</span>
            <span className="block text-[11px]" style={{ color: "var(--ink-3)" }}>{PLACEMENT_LABEL[r.placement]}.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

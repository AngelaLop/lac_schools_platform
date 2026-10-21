"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Flag, Swatch } from "@/components/Bits";
import ContextCard from "@/components/ContextCard";
import Credits from "@/components/Credits";
import Dashboard, { Headline } from "@/components/Dashboard";
import SchoolCard from "@/components/SchoolCard";
import Sheet, { type Snap } from "@/components/Sheet";
import {
  PLACEMENT_LABEL, activeSchools, applyFilter, isOwn, isPlanned, loadDataset, money, onMap,
  type Dataset, type Filter, type Intervention,
} from "@/lib/data";
import { iconSvg, pinSvg } from "@/lib/pin";
import { ACCENT, PALETTE, programColor } from "@/lib/theme";

// MapLibre touches window on import, so the map loads on the client only.
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

/** One country per deployment for now; the country is a parameter from day one. */
const DEFAULT_COUNTRY = "SUR";

function readUrl() {
  const q = new URLSearchParams(window.location.search);
  return {
    country: q.get("country"), school: q.get("school"), district: q.get("district"),
    year: q.get("year"), only: q.get("only") === "1", program: q.get("program"),
    layers: q.get("layers")?.split(",").filter(Boolean) ?? [],
  };
}

export default function Page() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ year: 0, only: false, program: null, district: null });
  const [selected, setSelected] = useState<string | null>(null);
  // The school lists shown as icon layers; off by default, so the map opens
  // on the schools with a project of their own.
  const [layers, setLayers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const u = readUrl();
    loadDataset((u.country ?? DEFAULT_COUNTRY).toUpperCase())
      .then((d) => {
        setData(d);
        const ys = d.interventions.map((r) => r.year).filter((y): y is number => y != null);
        setFilter({ year: u.year ? Number(u.year) : Math.max(...ys), only: u.only, program: u.program, district: u.district });
        if (u.school) setSelected(u.school);
        setLayers(new Set(u.layers));
      })
      .catch((e) => setError(String(e)));
  }, []);

  // The state lives in the URL, so a view can be sent as a link.
  useEffect(() => {
    if (!data) return;
    const q = new URLSearchParams();
    if (data.country.iso3 !== DEFAULT_COUNTRY) q.set("country", data.country.iso3);
    if (selected) q.set("school", selected);
    if (filter.district) q.set("district", filter.district);
    q.set("year", String(filter.year));
    if (filter.only) q.set("only", "1");
    if (filter.program) q.set("program", filter.program);
    if (layers.size) q.set("layers", [...layers].join(","));
    window.history.replaceState(null, "", `?${q}`);
  }, [data, selected, filter, layers]);

  const years = useMemo(() => {
    if (!data) return [];
    const ys = data.interventions.map((r) => r.year).filter((y): y is number => y != null);
    const out = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push(y);
    return out;
  }, [data]);

  // Pins: schools whose own projects pass the filter. Icons: per layer that is
  // on, the schools of its list that pass the filter.
  const active = useMemo(() => (data ? activeSchools(data.interventions.filter(isOwn), filter) : new Set<string>()), [data, filter]);
  const lists = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries([...layers].map((k) => [k, activeSchools(data.interventions.filter((r) => r.parent === k), filter)]));
  }, [data, filter, layers]);
  // The panel counts what the map can show: a school list whose layer is off
  // leaves the figures and the charts with its whole project, amount included.
  const view = useMemo(() => {
    if (!data) return null;
    const keys = new Set((data.country.list_layers ?? []).map((l) => l.key));
    const shown = (r: Intervention) => !keys.has(r.parent) || layers.has(r.parent);
    return { ...data, interventions: data.interventions.filter(shown), hidden: data.interventions.filter((r) => !shown(r)) };
  }, [data, layers]);
  const onToggle = useCallback((key: string) => setLayers((ls) => {
    const next = new Set(ls);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  const onFilter = useCallback((f: Filter) => setFilter(f), []);
  const onHome = useCallback(() => { setSelected(null); setFilter((f) => ({ ...f, district: null })); }, []);
  const onDistrict = useCallback((d: string | null) => { setSelected(null); setFilter((f) => ({ ...f, district: d })); }, []);

  const isMobile = useIsMobile();
  const [snap, setSnap] = useState<Snap>("peek");
  // On a phone a school opens in the sheet, raised to half the screen.
  useEffect(() => { if (isMobile && selected) setSnap("half"); }, [isMobile, selected]);

  if (error) return <p className="p-6">Could not load the data: {error}</p>;
  if (!data) return <p className="p-6" style={{ color: "var(--ink-3)" }}>Loading…</p>;

  const map = (
    <>
      <Map data={data} active={active} lists={lists} selected={selected} district={filter.district} onSelect={onSelect}
        onHome={onHome} />
      <Legend data={data} filter={filter} layers={layers} lists={lists} onToggle={onToggle} />
    </>
  );

  // Phone: the map fills the screen, the title is a slim bar on top and the
  // panels live in a bottom sheet, as in a maps app.
  if (isMobile) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 px-4 py-2" style={{ background: "var(--line)", color: "#fff" }}>
          <BrandPin height={34} />
          <div className="min-w-0">
            <h1 className="brand flex items-center gap-2 text-[19px] leading-tight">
              {data.country.title}
              <Flag iso3={data.country.iso3} height={11} />
            </h1>
            <p className="truncate text-[12px]" style={{ color: "#9fdcec" }}>{data.country.subtitle}</p>
          </div>
        </header>
        <div className="absolute inset-0">{map}</div>
        <OffMapNotice data={data} filter={filter} layers={layers} className="absolute inset-x-2 top-[150px] z-10" />
        <Sheet snap={snap} onSnap={setSnap}>
          {selected ? (
            <SchoolCard data={data} id={selected} onClose={() => { setSelected(null); setSnap("peek"); }} />
          ) : (
            <div className="flex flex-col">
              <Headline data={view!} filter={filter} years={years} layers={layers} onFilter={onFilter} />
              <div className="border-t" style={{ borderColor: "var(--rule)" }}>
                <Dashboard data={view!} filter={filter} years={years} onFilter={onFilter}
                  onDistrict={(d) => { onDistrict(d); setSnap("peek"); }} onSelect={onSelect} />
              </div>
              <div className="border-t" style={{ borderColor: "var(--rule)" }}>
                <ContextCard data={view!} filter={filter} flat />
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
        {/* The panel comes first in the page, so the keyboard reaches it before the map. */}
        {/* Left column: one scroll for all its cards. The cards take the width
            left by the scrollbar, so a classic Windows scrollbar does not push
            them sideways into a second, horizontal one. */}
        <aside className="absolute bottom-3 left-3 top-3 z-20 w-[calc(380px*var(--ui))] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]">
          <div className="ui-scale flex w-full flex-col gap-2 pb-1">
            <div className="overflow-hidden bg-white shadow-lg">
              {/* As in Arctic Spills: the mark spans the title and the lines under it. */}
              <header className="flex items-center gap-3 px-4 py-2.5 [@media(max-height:738px)]:py-2" style={{ background: "var(--line)", color: "#fff" }}>
                <BrandPin height={46} />
                <div className="min-w-0">
                  <h1 className="brand text-[22px] leading-none">{data.country.title}</h1>
                  <p className="mt-1 text-[12px]" style={{ color: "#9fdcec" }}>{data.country.subtitle}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px]">
                    <Flag iso3={data.country.iso3} height={11} />
                    <strong className="font-medium">{data.country.name}</strong>
                  </p>
                </div>
              </header>
              <Headline data={view!} filter={filter} years={years} layers={layers} onFilter={onFilter} />
            </div>
            <div className="bg-white shadow-lg">
              <Dashboard data={view!} filter={filter} years={years} onFilter={onFilter}
                onDistrict={onDistrict} onSelect={onSelect} />
            </div>
            <ContextCard data={view!} filter={filter} />
          </div>
        </aside>

        <div className="absolute inset-0">{map}</div>

        {/* School card ------------------------------------------------------ */}
        {selected && (
          <div className="absolute bottom-3 right-14 top-3 z-20 flex w-[calc(360px*var(--ui))] flex-col">
            <div className="ui-scale flex max-h-full w-[360px] flex-col">
              <SchoolCard data={data} id={selected} onClose={() => setSelected(null)} />
            </div>
          </div>
        )}

        {/* The notice for a filter whose projects are not on the map. */}
        <div className="absolute bottom-3 left-[calc(380px*var(--ui)+24px)] right-14 z-10 flex flex-col gap-2">
          <div className="ui-scale"><OffMapNotice data={data} filter={filter} layers={layers} /></div>
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

/** The pins, one line per program with its count of schools under the
 *  current filter; then the school lists, each a layer turned on with its box,
 *  as the "Add selections" boxes of Arctic Spills. */
function Legend({ data, filter, layers, lists, onToggle }: {
  data: Dataset; filter: Filter; layers: Set<string>; lists: Record<string, Set<string>>; onToggle: (key: string) => void;
}) {
  const order = data.country.programs;
  const rows = applyFilter(data.interventions, { ...filter, program: null });
  const pinned = new Set(data.schools.filter((s) => s.own).map((s) => s.program));
  const schools = (code: string) => new Set(rows.filter((r) => isOwn(r) && r.program === code && r.school).map((r) => r.school)).size;
  const iconed = new Set(Object.values(lists).flatMap((s) => [...s]));
  const others = data.schools.filter((s) => s.in_base && !s.own && !iconed.has(s.id)).length;
  return (
    // The box sits at its place on the screen; its content is drawn at the interface scale.
    <div className="absolute left-[calc(380px*var(--ui)+24px)] top-3 z-10 max-md:left-2 max-md:top-[64px]">
    <div className="ui-scale bg-white/90 px-3 py-2 text-[11px] shadow-sm max-md:px-2 max-md:py-1.5"
      style={{ color: "var(--ink-2)" }}>
      {data.programs.map((p) => {
        // The school lists of the program sit under it, indented.
        const own = (data.country.list_layers ?? []).filter((l) => data.interventions.find((r) => r.id === l.key)?.program === p.code);
        if (!pinned.has(p.code) && !own.length) return null;
        return (
          <div key={p.code} className="mt-0.5 first:mt-0" style={{ opacity: filter.program && filter.program !== p.code ? 0.4 : 1 }}>
            <div className="flex items-center gap-1.5">
              {pinned.has(p.code) ? (
                <span className="inline-flex w-[12px] justify-center"
                  dangerouslySetInnerHTML={{ __html: pinSvg(programColor(p.code, order), 0.42) }} />
              ) : <span className="inline-block w-[12px]" />}
              {p.name}
              {pinned.has(p.code) && <span className="num" style={{ color: "var(--ink-3)" }}>({schools(p.code)} schools)</span>}
            </div>
            {own.map((l) => {
              const parent = data.interventions.find((r) => r.id === l.key);
              const n = new Set(rows.filter((r) => r.parent === l.key && r.school).map((r) => r.school)).size;
              const when = parent?.year ? (isPlanned(parent.year) ? `planned ${parent.year}` : String(parent.year)) : "";
              return (
                <label key={l.key} className="ml-[18px] mt-0.5 flex cursor-pointer items-center gap-1.5 max-md:min-h-9">
                  <input type="checkbox" checked={layers.has(l.key)} onChange={() => onToggle(l.key)}
                    className="h-3 w-3 accent-[var(--line)]" />
                  <span className="inline-flex w-[12px] justify-center"
                    dangerouslySetInnerHTML={{ __html: iconSvg(l.icon, programColor(p.code, order), 0.6) }} />
                  {l.label}
                  <span className="num" style={{ color: "var(--ink-3)" }}>({when ? `${when}, ` : ""}{n} schools)</span>
                </label>
              );
            })}
          </div>
        );
      })}
      <div className="mt-0.5 flex items-center gap-1.5">
        <Swatch color={PALETTE.school} size={6} />Other schools
        <span className="num" style={{ color: "var(--ink-3)" }}>({others})</span>
      </div>
    </div>
    </div>
  );
}

/** When the filter holds projects but none of them is on the map, the map
 *  alone would look empty and wrong. Say what those projects are, and which
 *  layer to turn on when their schools are in a list, in a band at the bottom. */
function OffMapNotice({ data, filter, layers, className = "" }: {
  data: Dataset; filter: Filter; layers: Set<string>; className?: string;
}) {
  const rows = applyFilter(data.interventions, filter);
  if (!rows.length || rows.some((r) => onMap(r, layers))) return null;
  const when = filter.only ? `In ${filter.year}` : `Up to ${filter.year}`;
  const hidden = (data.country.list_layers ?? []).filter((l) => rows.some((r) => r.parent === l.key && r.school));
  const sheet = rows.filter(isOwn);
  return (
    <div role="status" className={`bg-white px-4 py-2 text-[12px] shadow-md ${className}`} style={{ color: "var(--ink-2)" }}>
      <span className="font-medium" style={{ color: "var(--ink)" }}>{when}, no school on the map. </span>
      {hidden.length > 0 && (
        <span>Turn on {hidden.map((l) => l.label).join(" and ")} in the legend to see {hidden.length > 1 ? "their" : "its"} schools. </span>
      )}
      {sheet.filter((r) => !hidden.some((l) => l.key === r.id)).map((r, i) => (
        <span key={r.id}>
          {i > 0 && "; "}{r.project} ({r.program_name}, {money(r.amount ?? 0, data.currency)}, {PLACEMENT_LABEL[r.placement].toLowerCase()})
        </span>
      ))}
    </div>
  );
}

/** The mark of the viewer: a white school pin with the mortarboard in the
 *  accent blue of the Play button, which belongs to no program. */
function BrandPin({ height }: { height: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0"
      dangerouslySetInnerHTML={{ __html: pinSvg("#ffffff", height / 40, ACCENT) }} />
  );
}

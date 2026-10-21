// Types and aggregations over the files that scripts/03_viewer_data.py writes
// to public/data/{ISO}/. Every number on screen comes out of these functions.

import type * as GeoJSON from "geojson";

export type Placement = "school" | "pending" | "several_schools" | "not_a_school";

export interface Intervention {
  id: string;
  program: string;
  program_name: string;
  project: string;
  works: string[];
  year: number | null;
  amount: number | null;
  beneficiaries: number | null;
  beneficiaries_note: string | null;
  placement: Placement;
  school: string | null;
  to_confirm: boolean;
}

export interface Program {
  code: string;
  name: string;
}

export interface School {
  id: string;
  name: string;
  adm1: string | null;
  district: string | null;
  adm2_name: string | null;
  levels: string[];
  sector: string | null;
  area: "urbana" | "no_urbana" | "dispersa" | null;
  rwi: number | null;
  rwi_q: number | null;
  coord: string | null;
  ivs: string[];
  program: string | null;
  lon: number;
  lat: number;
}

export interface Country {
  iso3: string;
  name: string;
  title: string;
  subtitle: string;
  bbox: [number, number, number, number];
  /** Wider frame the map opens on before it flies to the country, as Arctic Spills does. */
  intro_bbox?: [number, number, number, number];
  programs: string[];
}

export interface Dataset {
  country: Country;
  currency: string;
  programs: Program[];
  interventions: Intervention[];
  schools: School[];
  schoolsGeo: GeoJSON.FeatureCollection;
  adm1Geo: GeoJSON.FeatureCollection;
  bathyGeo: GeoJSON.FeatureCollection | null;
}

export async function loadDataset(iso: string): Promise<Dataset> {
  const base = `/data/${iso}`;
  const get = (f: string) => fetch(`${base}/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const [country, iv, schoolsGeo, adm1Geo, bathyGeo] = await Promise.all([
    get("country.json"), get("interventions.json"), get("schools.geojson"), get("adm1.geojson"),
    // Optional: a country without sea bands still opens.
    get("bathymetry.geojson").catch(() => null),
  ]);
  const schools: School[] = schoolsGeo.features.map((f: GeoJSON.Feature<GeoJSON.Point>) => ({
    ...(f.properties as Omit<School, "lon" | "lat">),
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  return { country, currency: iv.currency, programs: iv.programs, interventions: iv.rows, schools, schoolsGeo, adm1Geo, bathyGeo };
}

// ---------------------------------------------------------------- aggregates --

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

/** What the map and every number on screen are filtered by. The timeline
 *  plays years cumulatively ("up to 2024"); a click on a year bar asks for that
 *  year alone; a click on a program keeps only its works. */
export interface Filter {
  year: number;
  only: boolean;
  program: string | null;
}

/** Rows that pass the filter; rows without a year pass any year. */
export function applyFilter(rows: Intervention[], f: Filter): Intervention[] {
  return rows.filter((r) =>
    (f.program == null || r.program === f.program) &&
    (r.year == null || (f.only ? r.year === f.year : r.year <= f.year)));
}

/** Schools with at least one work that passes the filter. */
export function activeSchools(rows: Intervention[], f: Filter): Set<string> {
  return new Set(applyFilter(rows, f).filter((r) => r.school).map((r) => r.school!));
}

export function totals(rows: Intervention[]) {
  return {
    amount: sum(rows.map((r) => r.amount)),
    projects: rows.length,
    schools: new Set(rows.filter((r) => r.school).map((r) => r.school)).size,
    beneficiaries: sum(rows.map((r) => r.beneficiaries)),
  };
}

export function byProgram(rows: Intervention[], programs: Program[]) {
  return programs.map((p) => {
    const mine = rows.filter((r) => r.program === p.code);
    return { ...p, amount: sum(mine.map((r) => r.amount)), projects: mine.length };
  });
}

export function byYear(rows: Intervention[], programs: Program[], years: number[]) {
  return years.map((y) => ({
    year: y,
    parts: programs.map((p) => ({
      code: p.code,
      amount: sum(rows.filter((r) => r.year === y && r.program === p.code).map((r) => r.amount)),
    })),
  }));
}

export const PLACEMENT_ORDER: Placement[] = ["school", "several_schools", "not_a_school", "pending"];

export function byPlacement(rows: Intervention[]) {
  return PLACEMENT_ORDER.map((k) => {
    const mine = rows.filter((r) => r.placement === k);
    return { key: k, projects: mine.length, amount: sum(mine.map((r) => r.amount)) };
  });
}

/** Share of schools in each group, for all schools and for those with works. */
export function compare<K extends string | number>(
  schools: School[], placed: Set<string>, key: (s: School) => K | null, keys: K[],
) {
  const all = schools.filter((s) => key(s) != null);
  const iv = all.filter((s) => placed.has(s.id));
  return {
    rows: keys.map((k) => ({
      key: k,
      all: all.filter((s) => key(s) === k).length,
      iv: iv.filter((s) => key(s) === k).length,
    })),
    nAll: all.length,
    nIv: iv.length,
    missingAll: schools.length - all.length,
    missingIv: schools.filter((s) => placed.has(s.id)).length - iv.length,
  };
}

export function byDistrict(schools: School[], rows: Intervention[]) {
  const bySchool = new Map(schools.map((s) => [s.id, s]));
  const out = new Map<string, { adm1: string; name: string; schools: number; iv: Set<string>; amount: number }>();
  for (const s of schools) {
    if (!s.adm1) continue;
    const d = out.get(s.adm1) ?? { adm1: s.adm1, name: s.district ?? s.adm1, schools: 0, iv: new Set(), amount: 0 };
    d.schools += 1;
    out.set(s.adm1, d);
  }
  for (const r of rows) {
    const s = r.school ? bySchool.get(r.school) : undefined;
    if (!s?.adm1) continue;
    const d = out.get(s.adm1)!;
    d.iv.add(s.id);
    d.amount += r.amount ?? 0;
  }
  return [...out.values()]
    .map((d) => ({ ...d, iv: d.iv.size }))
    .sort((a, b) => b.amount - a.amount || b.schools - a.schools);
}

// ---------------------------------------------------------------- formatting --

export function money(x: number, currency = "USD"): string {
  if (x >= 1e6) return `${currency} ${(x / 1e6).toFixed(1)} M`;
  if (x >= 1e3) return `${currency} ${Math.round(x / 1e3).toLocaleString("en-US")} k`;
  return `${currency} ${Math.round(x).toLocaleString("en-US")}`;
}

export function moneyFull(x: number, currency = "USD"): string {
  return `${currency} ${Math.round(x).toLocaleString("en-US")}`;
}

export const int = (x: number) => x.toLocaleString("en-US");

export const AREA_LABEL: Record<string, string> = {
  urbana: "Urban",
  no_urbana: "Non-urban",
  dispersa: "Dispersed",
};

/** Plain wording of the area classes, from accessibility_platform/definitions.md. */
export const AREA_NOTE: Record<string, string> = {
  urbana: "at least 300 people per km² and at least 5,000 people.",
  no_urbana: "below those thresholds, but at least 150 people per km² and between 200 and 5,000 people.",
  dispersa: "cells with under 200 people and under 150 people per km², which cannot be grouped; typically isolated rural communities.",
};

export const PLACEMENT_LABEL: Record<Placement, string> = {
  school: "One school, on the map",
  several_schools: "Many schools at once; the IDB has been asked for the lists",
  not_a_school: "Buildings that are not schools",
  pending: "A school the IDB still has to confirm",
};

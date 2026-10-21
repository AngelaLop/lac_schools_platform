// Types and aggregations over the files that scripts/03_viewer_data.py writes
// to public/data/{ISO}/. Every number on screen comes out of these functions.

import type * as GeoJSON from "geojson";

export type Placement = "school" | "pending" | "new_site" | "several_schools" | "not_a_school";

export interface Intervention {
  id: string;
  /** Row of the IDB sheet it comes from: itself, or the project whose school list it belongs to. */
  parent: string;
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
  /** Where the amount of a listed school comes from, or why it has none. */
  amount_note: string | null;
  /** For a school of an IDB list: the list, its row, what the list says and how it was placed. */
  list_source: string | null;
  list_row: string | null;
  list_detail: string[];
  list_note: string | null;
  /** On a project with a school list: what part of its amount the list does not split by school. */
  residual_note: string | null;
  /** District of the school the project sits on, set at load; null when it sits on none. */
  adm1: string | null;
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
  /** False when the school falls outside the populated 1 km cells of the grid; null for a list site. */
  cell: boolean | null;
  coord: string | null;
  ivs: string[];
  program: string | null;
  /** False for a site of an IDB list that is not in the ministry list; it has no context. */
  in_base: boolean;
  /** True when the school has a project of its own in the IDB sheet (a pin);
   *  false when it is only in the school lists (an icon layer). Set at load. */
  own: boolean;
  lon: number;
  lat: number;
}

/** A school list shown as its own layer of round icons, off by default. */
export interface ListLayer {
  /** The row of the IDB sheet whose school list it is. */
  key: string;
  label: string;
  icon: "drop" | "plug";
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
  list_layers?: ListLayer[];
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
  /** In the panel's view only: the rows of the school lists whose layer is off. */
  hidden?: Intervention[];
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
  // A pin takes the colour of the school's own projects, never of a list: a
  // school with only the bathroom list has no pin.
  const ownPrograms = new Map<string, string[]>();
  for (const r of iv.rows as Intervention[]) {
    if (r.school && isOwn(r)) ownPrograms.set(r.school, [...(ownPrograms.get(r.school) ?? []), r.program]);
  }
  const order: string[] = country.programs;
  const schools: School[] = schoolsGeo.features.map((f: GeoJSON.Feature<GeoJSON.Point>) => {
    const p = f.properties as Omit<School, "lon" | "lat" | "own">;
    const own = ownPrograms.get(p.id);
    return {
      ...p,
      own: own != null,
      program: own ? [...own].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] : null,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    };
  });
  const adm1Of = new Map(schools.map((s) => [s.id, s.adm1]));
  const interventions: Intervention[] = iv.rows.map((r: Intervention) => ({ ...r, adm1: r.school ? adm1Of.get(r.school) ?? null : null }));
  return { country, currency: iv.currency, programs: iv.programs, interventions, schools, schoolsGeo, adm1Geo, bathyGeo };
}

// ---------------------------------------------------------------- aggregates --

/** A row of the IDB sheet itself, not a school of one of its lists. */
export const isOwn = (r: Intervention) => r.id === r.parent;

/** Shown on the map: its own project (a pin), or a school of a list whose layer is on. */
export const onMap = (r: Intervention, layers: Set<string>) => r.school != null && (isOwn(r) || layers.has(r.parent));

/** Years after the current one hold planned works, not finished ones. */
export const isPlanned = (year: number) => year > new Date().getFullYear();

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

/** What the map and every number on screen are filtered by. The timeline
 *  plays years cumulatively ("up to 2024"); a click on a year bar asks for that
 *  year alone; a click on a program keeps only its works. */
export interface Filter {
  year: number;
  only: boolean;
  program: string | null;
  /** A district (adm1 code): only the projects at its schools count. */
  district: string | null;
}

/** Rows that pass the filter; rows without a year pass any year. */
export function applyFilter(rows: Intervention[], f: Filter): Intervention[] {
  return rows.filter((r) =>
    (f.program == null || r.program === f.program) &&
    (f.district == null || r.adm1 === f.district) &&
    (r.year == null || (f.only ? r.year === f.year : r.year <= f.year)));
}

/** Schools with at least one work that passes the filter. */
export function activeSchools(rows: Intervention[], f: Filter): Set<string> {
  return new Set(applyFilter(rows, f).filter((r) => r.school).map((r) => r.school!));
}

/** Projects are the rows of the IDB sheet: the schools of a list count once, with their project. */
const projects = (rows: Intervention[]) => new Set(rows.map((r) => r.parent)).size;

export function totals(rows: Intervention[]) {
  return {
    amount: sum(rows.map((r) => r.amount)),
    projects: projects(rows),
    schools: new Set(rows.filter((r) => r.school).map((r) => r.school)).size,
    beneficiaries: sum(rows.map((r) => r.beneficiaries)),
  };
}

export function byProgram(rows: Intervention[], programs: Program[]) {
  return programs.map((p) => {
    const mine = rows.filter((r) => r.program === p.code);
    return { ...p, amount: sum(mine.map((r) => r.amount)), projects: projects(mine) };
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

export const PLACEMENT_ORDER: Placement[] = ["school", "several_schools", "new_site", "not_a_school", "pending"];

export function byPlacement(rows: Intervention[]) {
  return PLACEMENT_ORDER.map((k) => {
    const mine = rows.filter((r) => r.placement === k);
    return { key: k, projects: projects(mine), amount: sum(mine.map((r) => r.amount)) };
  });
}

/** Share of schools in each group, for all schools and for those with works.
 *  Only schools of the ministry list count; the list sites have no context. */
export function compare<K extends string | number>(
  allSchools: School[], placed: Set<string>, key: (s: School) => K | null, keys: K[],
) {
  const schools = allSchools.filter((s) => s.in_base);
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
    // District totals count the schools of the ministry list.
    if (!s.adm1 || !s.in_base) continue;
    const d = out.get(s.adm1) ?? { adm1: s.adm1, name: s.district ?? s.adm1, schools: 0, iv: new Set(), amount: 0 };
    d.schools += 1;
    out.set(s.adm1, d);
  }
  for (const r of rows) {
    const s = r.school ? bySchool.get(r.school) : undefined;
    if (!s?.adm1) continue;
    const d = out.get(s.adm1);
    if (!d) continue;
    // A list site adds its amount but not to the count, which is out of the ministry list.
    if (s.in_base) d.iv.add(s.id);
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
  urbana: "a settlement of 5,000 people or more with an average density of at least 300 people per km².",
  no_urbana: "a settlement of 200 people or more that does not meet both urban thresholds.",
  dispersa: "cells under 150 people per km², or settlements under 200 people; typically isolated rural communities.",
};

export const PLACEMENT_LABEL: Record<Placement, string> = {
  school: "One school each, on the map",
  several_schools: "Projects over many schools: the part of the amount not split by school",
  not_a_school: "Buildings that are not schools",
  new_site: "New schools not yet built; the IDB will send their location",
  pending: "A school the IDB still has to confirm",
};

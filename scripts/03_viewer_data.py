"""Step 03: write the data files the viewer reads.

Reads the crosswalk from step 01, the school lists from step 01b, the school
base with its context (area class and Meta Relative Wealth Index, from
accessibility_platform), the IDB boundaries and the areas the country claims
(Natural Earth), and writes
viewer/public/data/{ISO}/:

  schools.geojson        every school of the base, with its context and, when
                         it has one, the intervention placed on it; plus the
                         sites of the IDB lists that are not in the base
  interventions.json     every row of the IDB sheet, placed or not, with the
                         reason when it is not on the map. A row with a school
                         list becomes one row per listed school, and the part
                         of its amount the list does not split by school stays
                         on the row itself, off the map
  adm1.geojson           district outlines, simplified, with the areas the
                         country claims joined to their district
  disputed.geojson       the claimed areas, marked as disputed (Natural Earth)
  borders.geojson        land borders: the country's own, claims included,
                         and its neighbours' (Natural Earth)
  bathymetry.geojson     sea depth bands around the country (Natural Earth)
  country.json           title, extent and program order for the viewer
  manifest.json          inputs with their sha256, and the counts written

Usage: uv run python scripts/03_viewer_data.py --country SUR
"""

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Polygon, box
from shapely.ops import polylabel, unary_union

ROOT = Path(__file__).resolve().parents[1]

# About 100 m at the equator: enough for a whole-country view, a tenth of the size.
SIMPLIFY_DEG = 0.001
# The sea is background: about 1 km is enough.
SIMPLIFY_SEA_DEG = 0.01
# About 1 km2: a piece of a claim smaller than this is a sliver between sources.
CLAIM_MIN_DEG2 = 1e-4
# About 3 km: the edge of the country this close to the sea is coast, not border.
# Natural Earth's sea is coarse; at 1 km, bits of coast still came out as border.
COAST_DEG = 0.03
# About 100 km2: smaller pieces of the country are coastal islands.
ISLAND_DEG2 = 0.01
# About 5 km: inlets of the sea narrower than twice this are estuaries.
ESTUARY_DEG = 0.05
# About 55 km: a piece of the edge shorter than this is coast left over.
BORDER_MIN_DEG = 0.5

# Where a row that is not on the map goes, and why.
PLACEMENT = {
    "aggregate": "several_schools",
    "not_a_school": "not_a_school",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clean(text) -> str | None:
    """The source carries U+FFFD and U+00B4 where an apostrophe was lost."""
    if pd.isna(text):
        return None
    return " ".join(str(text).replace("�", "'").replace("´", "'").split())


def works_items(text) -> list[str]:
    """Split the description of works on its bullets; one item when it has none."""
    if pd.isna(text):
        return []
    parts = re.split(r"\s*[•]\s*|\s+-\s+", str(text))
    return [p for p in (clean(x) for x in parts) if p]


def num(value):
    """JSON-safe value: NaN becomes null."""
    return None if pd.isna(value) else value


def load_interventions(iso: str, config: dict) -> pd.DataFrame:
    src = config["sources"]["interventions"]
    raw = pd.read_excel(ROOT / src["path"], sheet_name=src["sheet"], header=src["header_row"])
    raw = raw.dropna(subset=[src["columns"]["project_name"]]).reset_index(drop=True)
    raw["intervention_id"] = [f"{iso}-R{i + src['header_row'] + 2:03d}" for i in raw.index]
    raw = raw[["intervention_id", src["columns"]["works_description"]]].rename(
        columns={src["columns"]["works_description"]: "works"})
    cw = pd.read_csv(ROOT / "data" / "curation" / iso / "interventions_crosswalk.csv", dtype=str)
    return cw.merge(raw, on="intervention_id", how="left", validate="one_to_one")


def placement(r: pd.Series) -> str:
    if pd.notna(r["id_centro_final"]):
        return "school"
    # A school not yet built: the IDB has its location in the bidding documents.
    if r.get("decision_status") == "new_site":
        return "new_site"
    return PLACEMENT.get(r["status"], "pending")


def expand_lists(interventions: pd.DataFrame, lists: pd.DataFrame, config: dict) -> pd.DataFrame:
    """One row per listed school for the rows that have a school list (step
    01b). A listed school carries its own amount only when the list gives one
    (the bidding budget); the rest of the amount stays on the parent row, which
    keeps its beneficiaries and is not on the map."""
    specs = config["sources"].get("school_lists", {})
    out = []
    for r in interventions.to_dict("records"):
        r["parent"] = r["intervention_id"]
        mine = lists[lists["list_id"] == r["intervention_id"]]
        if mine.empty:
            out.append(r)
            continue
        label = specs[r["intervention_id"]]["label"]
        has_budget = mine["budget"].notna().any() if "budget" in mine else False
        for i, c in enumerate(mine.itertuples(), start=1):
            detail = []
            if pd.notna(c.works_source):
                detail.append(f"Works in the list: {c.works_source}")
            if pd.notna(c.condition_note):
                detail.append(f"Condition of the devices before the works ({int(c.condition)} of 4): {c.condition_note}")
            out.append({
                **r,
                "intervention_id": f"{r['intervention_id']}-{i:03d}",
                "project_name": c.name_source,
                "amount": c.budget if has_budget and pd.notna(c.budget) else None,
                "amount_note": ("Estimated budget per school in the bidding lots" if has_budget and pd.notna(c.budget)
                                else "The list gives no amount for this school"),
                "beneficiaries": None,
                "beneficiaries_note": None,
                "id_centro_final": c.id_final,
                "placement": "school" if pd.notna(c.id_final) else "pending",
                "list_source": label,
                "list_row": c.row_label,
                "list_detail": detail,
                "list_note": c.note,
            })
        split = mine["budget"].sum() if has_budget else 0.0
        if split > float(r["amount"]):
            raise SystemExit(f"{r['intervention_id']}: budgets per school ({split}) exceed the amount ({r['amount']})")
        placed = int(mine["id_final"].notna().sum())
        r["amount"] = round(float(r["amount"]) - split, 2)
        r["list_source"] = label
        r["residual_note"] = (
            f"{placed} of the {len(mine)} schools of the {label} are on the map. "
            + (f"The list splits USD {split:,.0f} by school; this is the rest of the amount. " if split
               else "The list gives no amount per school, so the whole amount stays here. ")
        ).strip()
        out.append(r)
    df = pd.DataFrame(out)
    for col in ("amount_note", "list_source", "list_row", "list_detail", "list_note", "residual_note"):
        if col not in df:
            df[col] = None
    return df


def claimed_areas(adm1: gpd.GeoDataFrame, spec: dict) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Join the areas the country claims to the district that holds them.

    The IDB boundaries stop at the line each neighbour administers. The claimed
    areas come from Natural Earth and are added to the district's polygon; the
    slivers where the two sources do not meet are filled. Returns the districts
    and what the viewer draws over the claimed areas:

      area     what the claims add to the district, hatched
      label    a point well inside each area, for its name and "Disputed area"
      defacto  the IDB edge the claims now lie beyond, dashed like a district line
    """
    ne = gpd.read_file(ROOT / spec["path"])
    ne = ne[ne["BRK_A3"].isin(spec["brk_a3"])].to_crs(adm1.crs)
    if len(ne) != len(spec["brk_a3"]):
        raise SystemExit(f"Claimed areas not found in {spec['path']}: {spec['brk_a3']}")
    before = unary_union(adm1.geometry)
    i = adm1.index[adm1["adm1"] == spec["adm1"]][0]
    district = adm1.at[i, "geometry"]
    joined = unary_union([district, *ne.geometry])
    # The district has no holes of its own, so every hole is a sliver between sources.
    adm1.at[i, "geometry"] = Polygon(joined.exterior)
    after = unary_union(adm1.geometry)
    pieces = []
    for part in getattr(adm1.at[i, "geometry"].difference(district), "geoms", []):
        # Slivers along the other borders, where the two sources differ by a few
        # hundred metres, stay unmarked.
        if part.area < CLAIM_MIN_DEG2:
            continue
        name = max(ne.itertuples(), key=lambda r: r.geometry.intersection(part).area).BRK_NAME
        pieces.append({"kind": "area", "name": name, "geometry": part})
    for name in ne["BRK_NAME"]:
        largest = max((p["geometry"] for p in pieces if p["name"] == name), key=lambda g: g.area)
        pieces.append({"kind": "label", "name": name, "geometry": polylabel(largest, 0.01)})
    areas = unary_union([p["geometry"] for p in pieces if p["kind"] == "area"])
    edge = before.boundary.intersection(after.buffer(-1e-5)).intersection(areas.buffer(1e-5))
    pieces.append({"kind": "defacto", "geometry": edge})
    out = gpd.GeoDataFrame(pieces, crs=adm1.crs)
    out["geometry"] = out.geometry.simplify(SIMPLIFY_DEG, preserve_topology=True)
    return adm1, out


def country_borders(adm1: gpd.GeoDataFrame, iso: str, spec: dict, sea_path: Path) -> gpd.GeoDataFrame:
    """The land borders the viewer draws instead of the basemap's.

    The country's own border is the outer edge of its districts, claims
    included, except where it meets the open sea (Natural Earth 0 m bathymetry);
    the islands of the coast have none. The borders between the other countries
    come from Natural Earth as they are.
    """
    lines = gpd.read_file(ROOT / spec["path"], bbox=tuple(spec["bbox"])).to_crs(adm1.crs)
    own = (lines["ADM0_A3_L"] == iso) | (lines["ADM0_A3_R"] == iso)
    country = unary_union(adm1.geometry)
    mainland = [p for p in getattr(country, "geoms", [country]) if p.area > ISLAND_DEG2]
    sea = unary_union(gpd.read_file(sea_path, bbox=country.bounds).to_crs(adm1.crs).geometry)
    # Natural Earth's sea runs some 50 km up the Corantijn and Marowijne
    # estuaries; without its narrow inlets it ends at their mouths.
    sea = sea.buffer(-ESTUARY_DEG).buffer(ESTUARY_DEG)
    border = unary_union([p.exterior for p in mainland]).difference(sea.buffer(COAST_DEG))
    # What is left of the coast comes out in short pieces; the borders are long.
    border = unary_union([g for g in getattr(border, "geoms", [border]) if g.length > BORDER_MIN_DEG])
    out = gpd.GeoDataFrame(
        [{"kind": "own", "geometry": border}]
        # Where a neighbour's line runs along the country's edge (Natural Earth
        # gives the claimed areas to the neighbours), the country's border is enough.
        + [{"kind": "other", "geometry": g.difference(country.buffer(2 * SIMPLIFY_DEG))}
           for g in lines[~own].geometry.clip(box(*spec["bbox"]))],
        crs=adm1.crs)
    out["geometry"] = out.geometry.simplify(SIMPLIFY_DEG, preserve_topology=True)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--country", required=True)
    args = parser.parse_args()
    iso = args.country.upper()
    config = json.loads((ROOT / "config" / "countries" / f"{iso}.json").read_text(encoding="utf-8"))
    out_dir = ROOT / "viewer" / "public" / "data" / iso
    out_dir.mkdir(parents=True, exist_ok=True)

    # --- boundaries -----------------------------------------------------------
    bnd = config["context"]["boundaries"]
    code = bnd["adm0_pcode"]
    adm1 = gpd.read_file(ROOT / bnd["path"].format(level=1))
    adm1 = adm1[adm1["ADM0_PCODE"] == code][["ADM1_PCODE", "ADM1_EN", "geometry"]]
    adm1 = adm1.rename(columns={"ADM1_PCODE": "adm1", "ADM1_EN": "name"}).reset_index(drop=True)
    claimed = config["context"].get("claimed_areas")
    if claimed:
        adm1, disputed = claimed_areas(adm1, claimed)
        disputed.to_file(out_dir / "disputed.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)
    borders = config["context"].get("country_borders")
    if borders:
        sea_0m = ROOT / config["context"]["bathymetry"]["path"] / "ne_10m_bathymetry_L_0.shp"
        country_borders(adm1, iso, borders, sea_0m).to_file(out_dir / "borders.geojson", driver="GeoJSON",
                                                            COORDINATE_PRECISION=5)
    adm1["geometry"] = adm1.geometry.simplify(SIMPLIFY_DEG, preserve_topology=True)
    adm1.to_file(out_dir / "adm1.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)
    adm1_name = dict(zip(adm1["adm1"], adm1["name"]))
    adm2 = gpd.read_file(ROOT / bnd["path"].format(level=2), columns=["ADM0_PCODE", "ADM2_PCODE", "ADM2_EN"],
                         ignore_geometry=True)
    adm2_name = dict(zip(adm2.loc[adm2["ADM0_PCODE"] == code, "ADM2_PCODE"],
                         adm2.loc[adm2["ADM0_PCODE"] == code, "ADM2_EN"]))

    # --- sea depth ------------------------------------------------------------
    # Natural Earth ships one file of nested polygons per depth. Each band is
    # drawn over the shallower ones, so the deepest visible band wins.
    sea = config["context"].get("bathymetry")
    if sea:
        bands = []
        for shp in sorted((ROOT / sea["path"]).glob("ne_10m_bathymetry_*.shp")):
            g = gpd.read_file(shp, bbox=tuple(sea["bbox"]))
            if len(g):
                g = g.clip(box(*sea["bbox"]))
                g["geometry"] = g.geometry.simplify(SIMPLIFY_SEA_DEG, preserve_topology=True)
                bands.append(g[["depth", "geometry"]])
        bath = gpd.GeoDataFrame(pd.concat(bands, ignore_index=True), crs=bands[0].crs).sort_values("depth")
        bath.to_file(out_dir / "bathymetry.geojson", driver="GeoJSON", COORDINATE_PRECISION=3)

    # --- schools --------------------------------------------------------------
    scols = config["sources"]["schools"]["columns"]
    base = pd.read_csv(ROOT / config["sources"]["schools"]["path"], dtype={scols["id"]: str})
    base = base[[scols["id"], scols["name"]]].rename(columns={scols["id"]: "id", scols["name"]: "name"})
    context = config["context"]["school_context"]
    ctx = pd.read_csv(ROOT / context["path"], dtype={context["key"]: str}).rename(columns={context["key"]: "id"})
    schools = base.merge(ctx, on="id", how="left", validate="one_to_one")
    # Quintiles of the wealth index among the schools that have one. A school
    # more than 5 km from any RWI cell carries none (06_pop_grid.py).
    has_rwi = schools["rwi"].notna()
    schools.loc[has_rwi, "rwi_quintile"] = pd.qcut(schools.loc[has_rwi, "rwi"], 5, labels=[1, 2, 3, 4, 5]).astype(int)

    interventions = load_interventions(iso, config)
    # The viewer shows the IDB's official code and acronym; the sheet's own
    # spelling stays in the crosswalk.
    official = {k: v for k, v in config["viewer"].get("program_official", {}).items() if isinstance(v, dict)}
    sheet_codes = interventions["program_code"]
    interventions["program_name"] = [official.get(c, {}).get("name", n)
                                     for c, n in zip(sheet_codes, interventions["program_name"])]
    interventions["program_code"] = [official.get(c, {}).get("code", c) for c in sheet_codes]
    interventions["placement"] = interventions.apply(placement, axis=1)
    lists_path = ROOT / "data" / "curation" / iso / "school_lists.csv"
    lists = pd.read_csv(lists_path, dtype={"id_final": str}) if lists_path.exists() else pd.DataFrame(columns=["list_id"])
    interventions = expand_lists(interventions, lists, config)
    # A school can carry several interventions (the Hanna's Lust fence, once the
    # IDB confirms which school got it, would be a second one).
    placed = interventions[interventions["placement"] == "school"]
    by_school = placed.groupby("id_centro_final")
    ivs = by_school["intervention_id"].agg(list).to_dict()
    programs = by_school["program_code"].agg(lambda s: sorted(set(s))).to_dict()

    features = []
    for s in schools.itertuples():
        levels = [lv for lv, flag in (("primary", s.nivel_primaria), ("lower secondary", s.nivel_secbaja),
                                      ("upper secondary", s.nivel_secalta)) if flag == 1]
        props = {
            "id": s.id,
            "name": clean(s.name),
            "adm1": num(s.adm1_pcode),
            "district": adm1_name.get(s.adm1_pcode),
            "adm2_name": adm2_name.get(s.adm2_pcode),
            "levels": levels,
            "sector": num(s.sector),
            "area": s.area_class if pd.notna(s.area_class) else None,
            "rwi": num(s.rwi),
            "rwi_q": int(s.rwi_quintile) if pd.notna(s.rwi_quintile) else None,
            # False when the school falls outside the populated 1 km cells of the
            # grid: it then has neither a wealth value nor a settlement class.
            "cell": bool(pd.notna(s.cell_id)),
            "coord": num(s.coordinate_quality),
            "ivs": ivs.get(s.id, []),
            # First program of the school, the one that colours its point.
            "program": programs[s.id][0] if s.id in programs else None,
            "in_base": True,
        }
        features.append({"type": "Feature", "properties": props,
                         "geometry": {"type": "Point", "coordinates": [round(s.longitud, 6), round(s.latitud, 6)]}})
    n_base = len(features)

    # Sites of the IDB lists that are not in the ministry list: placed at the
    # list's own coordinate, without context (step 01b, school_list_sites.json).
    sites_path = ROOT / "data" / "curation" / iso / "school_list_sites.json"
    sites = json.loads(sites_path.read_text(encoding="utf-8")) if sites_path.exists() else []
    if sites:
        pts = gpd.GeoDataFrame(sites, geometry=gpd.points_from_xy([x["lon"] for x in sites], [x["lat"] for x in sites]),
                               crs=adm1.crs)
        pts = gpd.sjoin(pts, adm1[["adm1", "geometry"]], how="left", predicate="within")
        for x in pts.itertuples():
            adm = x.adm1 if pd.notna(x.adm1) else None
            props = {"id": x.id, "name": clean(x.name), "adm1": adm, "district": adm1_name.get(adm), "adm2_name": None,
                     "levels": [], "sector": None, "area": None, "rwi": None, "rwi_q": None, "cell": None,
                     "coord": "list_coordinate", "ivs": ivs.get(x.id, []),
                     "program": programs[x.id][0] if x.id in programs else None, "in_base": False}
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": "Point", "coordinates": [round(x.lon, 6), round(x.lat, 6)]}})
    missing = set(placed["id_centro_final"]) - {f["properties"]["id"] for f in features}
    if missing:
        raise SystemExit(f"Interventions placed on ids with no point: {sorted(missing)}")
    (out_dir / "schools.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, allow_nan=False), encoding="utf-8")

    # --- interventions --------------------------------------------------------
    questions = json.loads((ROOT / "data" / "curation" / iso / "idb_questions.json").read_text(encoding="utf-8"))
    to_confirm = set(questions.get("to_confirm", []))
    rows = []
    for r in interventions.itertuples():
        rows.append({
            "id": r.intervention_id,
            # The row of the IDB sheet it comes from; itself unless it is a school of a list.
            "parent": r.parent,
            "program": r.program_code,
            "program_name": clean(r.program_name),
            "project": clean(r.project_name),
            "works": works_items(r.works),
            "year": int(r.year) if pd.notna(r.year) else None,
            "amount": float(r.amount) if pd.notna(r.amount) else None,
            "beneficiaries": int(float(r.beneficiaries)) if pd.notna(r.beneficiaries) else None,
            "beneficiaries_note": clean(r.beneficiaries_note),
            "placement": r.placement,
            "school": r.id_centro_final if pd.notna(r.id_centro_final) else None,
            # Assigned by the number in its name; the IDB has been asked to confirm.
            "to_confirm": r.intervention_id in to_confirm,
            "amount_note": clean(r.amount_note),
            "list_source": clean(r.list_source),
            "list_row": clean(r.list_row),
            "list_detail": r.list_detail if isinstance(r.list_detail, list) else [],
            "list_note": clean(r.list_note),
            "residual_note": clean(r.residual_note),
        })
    program_list = (interventions.groupby("program_code", sort=False)["program_name"].first().map(clean)
                .reset_index().rename(columns={"program_code": "code", "program_name": "name"})
                .to_dict("records"))
    (out_dir / "interventions.json").write_text(json.dumps(
        {"currency": config["sources"]["interventions"]["currency"], "programs": program_list, "rows": rows},
        ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")

    # --- manifest -------------------------------------------------------------
    inputs = [config["sources"]["interventions"]["path"], config["sources"]["schools"]["path"], context["path"],
              f"data/curation/{iso}/interventions_crosswalk.csv", bnd["path"].format(level=1)]
    if len(lists):
        inputs += [f"data/curation/{iso}/school_lists.csv", f"data/curation/{iso}/school_list_sites.json"]
        inputs += [spec[k]["manifest"] for spec in config["sources"]["school_lists"].values()
                   for k in ("annex", "bidding", "source") if k in spec]
    if sea:
        inputs.append(sea["manifest"])
    if claimed:
        inputs.append(claimed["manifest"])
    if borders:
        inputs.append(borders["manifest"])
    manifest = {
        "country": iso,
        "built_on": date.today().isoformat(),
        "inputs": [{"path": p, "sha256": sha256(ROOT / p)} for p in inputs],
        "counts": {
            "schools": n_base,
            "list_sites_not_in_base": len(features) - n_base,
            "schools_with_rwi": int(has_rwi.sum()),
            "interventions": len(rows),
            "by_placement": interventions["placement"].value_counts().to_dict(),
        },
    }
    viewer = {"iso3": iso, "name": config["name"],
              **{k: v for k, v in config["viewer"].items() if k != "program_official"}}
    (out_dir / "country.json").write_text(json.dumps(viewer, indent=1), encoding="utf-8")
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(json.dumps(manifest["counts"], indent=1))


if __name__ == "__main__":
    main()

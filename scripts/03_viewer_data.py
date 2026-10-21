"""Step 03: write the data files the viewer reads.

Reads the crosswalk from step 01, the school base with its context (area class
and Meta Relative Wealth Index, from accessibility_platform) and the IDB
boundaries, and writes viewer/public/data/{ISO}/:

  schools.geojson        every school of the base, with its context and, when
                         it has one, the intervention placed on it
  interventions.json     every row of the IDB sheet, placed or not, with the
                         reason when it is not on the map
  adm1.geojson           district outlines, simplified
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
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[1]

# About 100 m at the equator: enough for a whole-country view, a tenth of the size.
SIMPLIFY_DEG = 0.001
# The sea is background: about 1 km is enough.
SIMPLIFY_SEA_DEG = 0.01

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
    return PLACEMENT.get(r["status"], "pending")


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
    adm1["geometry"] = adm1.geometry.simplify(SIMPLIFY_DEG, preserve_topology=True)
    adm1 = adm1.rename(columns={"ADM1_PCODE": "adm1", "ADM1_EN": "name"})
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
    interventions["placement"] = interventions.apply(placement, axis=1)
    # A school can carry several interventions (Hanna's Lust has a fence and an expansion).
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
            "coord": num(s.coordinate_quality),
            "ivs": ivs.get(s.id, []),
            # First program of the school, the one that colours its point.
            "program": programs[s.id][0] if s.id in programs else None,
        }
        features.append({"type": "Feature", "properties": props,
                         "geometry": {"type": "Point", "coordinates": [round(s.longitud, 6), round(s.latitud, 6)]}})
    (out_dir / "schools.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, allow_nan=False), encoding="utf-8")

    # --- interventions --------------------------------------------------------
    questions = json.loads((ROOT / "data" / "curation" / iso / "idb_questions.json").read_text(encoding="utf-8"))
    to_confirm = set(questions.get("to_confirm", []))
    rows = []
    for r in interventions.itertuples():
        rows.append({
            "id": r.intervention_id,
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
    if sea:
        inputs.append(sea["manifest"])
    manifest = {
        "country": iso,
        "built_on": date.today().isoformat(),
        "inputs": [{"path": p, "sha256": sha256(ROOT / p)} for p in inputs],
        "counts": {
            "schools": len(features),
            "schools_with_rwi": int(has_rwi.sum()),
            "interventions": len(rows),
            "by_placement": interventions["placement"].value_counts().to_dict(),
        },
    }
    viewer = {"iso3": iso, "name": config["name"], **config["viewer"]}
    (out_dir / "country.json").write_text(json.dumps(viewer, indent=1), encoding="utf-8")
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(json.dumps(manifest["counts"], indent=1))


if __name__ == "__main__":
    main()

"""Step 01b: place on a school each entry of the IDB lists behind an aggregate project.

Some rows of the interventions sheet group many schools ('Small works in 113
schools', 'Improvement of 119 School Bathrooms'). When the IDB sends the list
of schools, this step gives each listed school an id of the school base and
writes data/curation/{ISO}/school_lists.csv, one row per listed school.

Two kinds of list, set in the country config under sources.school_lists:
  lots_xlsx    workbooks with one sheet per lot and the school code; a second
               workbook in the same order may add the budget per school
  transcribed  a hand transcription (CSV) of a list without codes; schools are
               matched by name within their district with the rules of step 01

Status of each row:
  code          the code of the list is in the school base
  code_fixed    the code of the list was wrong; the fix file gives the right one
  auto          matched by name, one candidate clearly ahead
  decided       matched by name, chosen by a person in the fix file
  annex_site    not in the school base; placed at the coordinates of the list,
                or at those the fix file gives ('site': 'coords')
  no_site       no school and no usable coordinate; left off the map

A row that needs a person and has no entry in the fix file stops the run.

Usage: uv run python scripts/01b_school_lists.py --country SUR
"""

import argparse
import importlib.util
import json
import math
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

# Step 01 holds the name rules; its file name starts with a digit, so it is
# loaded by path.
_spec = importlib.util.spec_from_file_location("crosswalk", ROOT / "scripts" / "01_crosswalk.py")
cw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cw)

# Condition classes printed under the bathroom tables (Annex IX, pages 4-8).
CONDITION = {
    1: "Between 50 and 100% of the installed devices are out of order or need replacement",
    2: "Less than 50% of the devices need replacement or were only partially installed",
    3: "All the devices work but need preventive maintenance",
    4: "All the devices work and show proper maintenance",
}


def check_manifest(src: dict) -> Path:
    path = ROOT / src["path"]
    manifest = json.loads((ROOT / src["manifest"]).read_text(encoding="utf-8"))
    digest = cw.sha256(path)
    if digest != manifest["sha256"]:
        sys.exit(f"{path.name}: sha256 {digest} does not match the manifest")
    return path


def dms(text) -> float | None:
    """'05 19 40 N' or '05 08 06.66 N' to decimal degrees; None when not valid."""
    if pd.isna(text):
        return None
    text = str(text).strip()
    hemi = text[-1].upper()
    parts = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", text[:-1])]
    if hemi not in "NSEW" or not parts or any(p >= 60 for p in parts[1:]):
        return None
    value = parts[0] + sum(p / 60 ** (i + 1) for i, p in enumerate(parts[1:]))
    return -value if hemi in "SW" else value


def km(lat1, lon1, lat2, lon2) -> float | None:
    if None in (lat1, lon1, lat2, lon2) or any(pd.isna(x) for x in (lat1, lon1, lat2, lon2)):
        return None
    dy = (lat1 - lat2) * 111.32
    dx = (lon1 - lon2) * 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
    return round(math.hypot(dx, dy), 2)


# --- readers ------------------------------------------------------------------

def read_lots(spec: dict) -> pd.DataFrame:
    """One row per school of the lot sheets, joined to the bidding workbook by
    sheet and position; the names must agree row by row."""
    cols = spec["columns"]

    def sheets(path: Path) -> pd.DataFrame:
        frames = []
        for sheet in pd.ExcelFile(path).sheet_names:
            if not sheet.lower().startswith(spec["sheet_prefix"]):
                continue
            df = pd.read_excel(path, sheet_name=sheet)
            df = df[df[cols["name"]].notna()].reset_index(drop=True)
            df["sheet"], df["pos"] = sheet, df.index + 1
            frames.append(df)
        return pd.concat(frames, ignore_index=True)

    annex = sheets(check_manifest(spec["annex"]))
    out = pd.DataFrame({
        "sheet": annex["sheet"],
        "pos": annex["pos"],
        "lot": annex["sheet"].str.extract(r"(\d+)")[0].astype(int),
        "name_source": annex[cols["name"]].astype(str).str.strip(),
        "code_source": annex[cols["code"]].astype(str).str.strip().replace("nan", pd.NA),
        "district_source": annex[cols["district"]].astype(str).str.strip().str.upper(),
        "address": annex[cols["address"]].astype(str).str.strip(),
        "lat_source": annex[cols["lat"]].astype(str).str.strip(),
        "lon_source": annex[cols["lon"]].astype(str).str.strip(),
    })
    if "bidding" in spec:
        bid = sheets(check_manifest(spec["bidding"]))
        merged = out.merge(bid[["sheet", "pos", cols["name"], cols["budget"], cols["type"]]], on=["sheet", "pos"],
                           how="left", validate="one_to_one")
        bad = merged[merged[cols["name"]].astype(str).str.strip() != merged["name_source"]]
        if len(bad):
            sys.exit(f"Bidding workbook out of step with the annex at: {bad[['sheet', 'pos']].values.tolist()}")
        out["budget"] = pd.to_numeric(merged[cols["budget"]], errors="coerce")
        out["works_source"] = merged[cols["type"]].astype(str).str.strip()
    out["key"] = out["sheet"] + "/" + out["pos"].astype(str)
    out["row_label"] = "Lot " + out["lot"].astype(str) + ", row " + out["pos"].astype(str)
    return out


def read_transcribed(spec: dict) -> pd.DataFrame:
    check_manifest(spec["source"])
    t = pd.read_csv(ROOT / spec["transcription"], dtype={"school_type": str})
    works = t["renovation"].map({1: "Renovation; COVID 19", 0: "COVID 19"})
    return pd.DataFrame({
        "key": t["nr"].astype(str),
        "row_label": "Lot " + t["lot"].astype(str) + ", NR " + t["nr"].astype(str),
        "lot": t["lot"],
        "pos": t["nr"],
        "name_source": t["school_name"],
        "code_source": pd.NA,
        "district_source": t["district"].str.upper(),
        "address": t["village"],
        "works_source": works,
        "condition": t["condition"],
        "condition_note": t["condition"].map(CONDITION),
    })


# --- placement ----------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--country", required=True)
    args = parser.parse_args()
    iso = args.country.upper()
    config = cw.load_config(iso)
    mcfg = config["matching"]

    schools = cw.load_schools(config["sources"]["schools"], mcfg)
    det_src = config["sources"]["school_details"]
    det = pd.read_excel(ROOT / det_src["path"])
    det = det.rename(columns={det_src["columns"]["id"]: "id", det_src["columns"]["district"]: "district"})
    det = det[["id", "district"]].drop_duplicates("id")
    det["district"] = det["district"].astype(str).str.strip().str.upper()
    schools = schools.merge(det, on="id", how="left")
    by_id = schools.set_index("id")

    rows = []
    extra_sites = {}
    unresolved = []
    for list_id, spec in config["sources"]["school_lists"].items():
        fixes = json.loads((ROOT / spec["fixes"]).read_text(encoding="utf-8"))
        fix_of = fixes["fixes"]
        note_of = fixes.get("notes", {})
        items = read_lots(spec) if spec["kind"] == "lots_xlsx" else read_transcribed(spec)
        for it in items.to_dict("records"):
            key = f"{list_id}/{it['key']}"
            fix = fix_of.get(key, {})
            if fix and fix.get("name") and fix["name"] != it["name_source"]:
                sys.exit(f"{key}: fix is for '{fix['name']}', the list has '{it['name_source']}'")
            r = {"list_id": list_id, **{k: v for k, v in it.items() if k != "key"}, "row_key": key}
            r["lat_list"], r["lon_list"] = dms(it.get("lat_source")), dms(it.get("lon_source"))
            note = fix.get("note") or note_of.get(key)

            if spec["kind"] == "transcribed":
                pool = schools[schools["district"] == it["district_source"]]
                ranked = cw.rank_candidates(it["name_source"], pool, mcfg)
                best, second = ranked[0], ranked[1]
                r.update({"proposed_id": best["id"], "proposed_name": best["name"], "score": best["score"],
                          "second_id": second["id"], "second_name": second["name"], "second_score": second["score"]})
                status, reason = cw.decide(ranked, mcfg)
                if status == "auto" and not fix:
                    r["status"], r["id_final"] = "auto", best["id"]
                    note = note or reason
                elif fix.get("site") == "coords":
                    # A school outside the base whose coordinates the fix file
                    # gives, with their source (for instance the raw ministry list).
                    r["status"], r["id_final"] = "annex_site", fix["id"]
                    r["lat_list"], r["lon_list"] = dms(fix["lat"]), dms(fix["lon"])
                    extra_sites[fix["id"]] = {"id": fix["id"], "name": it["name_source"], "lat": r["lat_list"],
                                              "lon": r["lon_list"], "list_id": list_id, "row_key": key}
                elif "id" in fix:
                    r["status"], r["id_final"] = "decided", fix["id"]
                elif fix.get("site") == "none":
                    r["status"] = "no_site"
                else:
                    unresolved.append(f"{key} {it['name_source']} -> {best['id']} {best['name']} ({reason})")
                    continue
            else:
                code = it["code_source"]
                if "id" in fix:
                    r["status"], r["id_final"] = "code_fixed", fix["id"]
                elif fix.get("site") == "annex":
                    if r["lat_list"] is None or r["lon_list"] is None:
                        sys.exit(f"{key}: placed at the list coordinates, but they are not valid")
                    site_id = code if pd.notna(code) else f"{list_id.split('-')[1]}-L{it['lot']}-{it['pos']:02d}"
                    r["status"], r["id_final"] = "annex_site", site_id
                    extra_sites[site_id] = {"id": site_id, "name": it["name_source"], "lat": r["lat_list"],
                                            "lon": r["lon_list"], "list_id": list_id, "row_key": key}
                elif fix.get("site") == "none":
                    r["status"] = "no_site"
                elif pd.notna(code) and code in by_id.index:
                    r["status"], r["id_final"] = "code", code
                else:
                    unresolved.append(f"{key} {it['name_source']}: code {code} not in the school base")
                    continue
            r["note"] = note
            rows.append(r)

    if unresolved:
        print("Rows that need a decision in the fix file:")
        print("\n".join(f"  {u}" for u in unresolved))
        sys.exit(1)

    out = pd.DataFrame(rows)
    # Where the row lands, and how far that is from the list's own coordinate.
    site_lat, site_lon, base_name, dist = [], [], [], []
    for r in out.itertuples():
        sid = r.id_final if pd.notna(r.id_final) else None
        if sid in by_id.index:
            s = by_id.loc[sid]
            site_lat.append(s["lat"]); site_lon.append(s["lon"]); base_name.append(s["name"])
        elif sid in extra_sites:
            s = extra_sites[sid]
            site_lat.append(s["lat"]); site_lon.append(s["lon"]); base_name.append(None)
        elif sid is not None:
            sys.exit(f"{r.row_key}: id {sid} is neither in the school base nor a list site")
        else:
            site_lat.append(None); site_lon.append(None); base_name.append(None)
        dist.append(km(r.lat_list, r.lon_list, site_lat[-1], site_lon[-1]))
    out["base_name"], out["lat"], out["lon"], out["km_list_to_site"] = base_name, site_lat, site_lon, dist
    out["in_base"] = out["id_final"].isin(by_id.index)

    out_path = ROOT / "data" / "curation" / iso / "school_lists.csv"
    out.to_csv(out_path, index=False, encoding="utf-8")
    sites_path = ROOT / "data" / "curation" / iso / "school_list_sites.json"
    sites_path.write_text(json.dumps(list(extra_sites.values()), indent=1, ensure_ascii=False), encoding="utf-8")

    print(out.groupby(["list_id", "status"]).size().to_string())
    far = out[out["km_list_to_site"] > 1]
    if len(far):
        print("List coordinate more than 1 km from the site used:")
        print(far[["row_key", "name_source", "id_final", "km_list_to_site"]].to_string(index=False))
    print(f"Wrote {out_path.relative_to(ROOT)} and {sites_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

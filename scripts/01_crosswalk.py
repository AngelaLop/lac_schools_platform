"""Step 01: propose a school id for each IDB intervention, matching by name.

Reads the country config (config/countries/{ISO}.json), the interventions sheet
and the school base, and writes data/curation/{ISO}/interventions_crosswalk.csv
with one row per intervention.

Status of each row:
  auto          one candidate clearly ahead (score and margin over thresholds)
  review        a person has to decide (low score, close second, numeral clash)
  not_a_school  the project is a building that is not a school
  aggregate     the project groups many schools; it cannot be placed as one point

Human decisions live in the decision_* columns. A re-run keeps them, keyed by
intervention_id, as long as the project name of that row has not changed.

Usage: uv run python scripts/01_crosswalk.py --country SUR
"""

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parents[1]

DECISION_COLS = ["decision_id_centro", "decision_status", "decision_note", "decided_by", "decided_on"]
ROMAN = {"1": "I", "2": "II", "3": "III", "4": "IV", "5": "V"}
ROMAN_TOKENS = set(ROMAN.values())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_config(iso: str) -> dict:
    with open(ROOT / "config" / "countries" / f"{iso}.json", encoding="utf-8") as f:
        return json.load(f)


# --- cleaning -----------------------------------------------------------------

def parse_amount(value) -> float | None:
    """Numbers pass through; text such as '$  280,098.79' is stripped to digits."""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    text = re.sub(r"[^\d.\-]", "", str(value))
    try:
        return round(float(text), 2)
    except ValueError:
        return None


def parse_count(value) -> tuple[int | None, str | None]:
    """Return (number, note). Text such as 'all the teachers' goes to the note."""
    if pd.isna(value):
        return None, None
    if isinstance(value, (int, float)):
        return int(value), None
    text = str(value).strip()
    if re.fullmatch(r"[\d,.\s]+", text):
        return int(re.sub(r"[^\d]", "", text)), None
    return None, text


def parse_year(value) -> int | None:
    if pd.isna(value):
        return None
    m = re.search(r"\d{4}", str(value))
    return int(m.group()) if m else None


# --- name normalization -------------------------------------------------------

def base_text(name: str) -> str:
    """Upper case, no accents, no apostrophes or replacement characters."""
    text = unicodedata.normalize("NFKD", str(name))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"['’�`]", "", text)
    return text.upper()


def school_type(name: str, types: dict[str, str]) -> tuple[str | None, str]:
    """Detect the school type token (O.S., MULO, ...) and remove it from the name."""
    for label, pattern in types.items():
        rx = re.compile(rf"(?<![A-Z]){pattern}(?![A-Z])")
        if rx.search(name):
            return label, rx.sub(" ", name, count=1)
    return None, name


def core_name(name: str, cfg: dict, strip_phrases: bool) -> tuple[str | None, str]:
    """Return (school type, core tokens) for matching."""
    text = base_text(name)
    if strip_phrases:
        # 'O.S Nieuw Amsterdam, Commewijne': the part after the comma is the district.
        text = text.split(",")[0]
        for phrase in cfg["strip_phrases"]:
            text = re.sub(phrase, " ", text, flags=re.IGNORECASE)
    stype, text = school_type(text, cfg["school_types"])
    text = re.sub(r"[^A-Z0-9 ]", " ", text)
    tokens = [ROMAN.get(t, t) for t in text.split()]
    # Spelling variants are folded after numerals, so 'IV' and 'I' are untouched.
    core = []
    for t in tokens:
        if t not in ROMAN_TOKENS:
            for old, new in cfg.get("spelling_equivalences", []):
                t = t.replace(old, new)
        core.append(t)
    return stype, " ".join(core)


def numerals(core: str) -> set[str]:
    return {t for t in core.split() if t in ROMAN_TOKENS}


def score_pair(a: str, b: str) -> float:
    """Mean of token_set (subset-tolerant) and token_sort (penalizes extra words)."""
    return (fuzz.token_set_ratio(a, b) + fuzz.token_sort_ratio(a, b)) / 2


# --- matching -----------------------------------------------------------------

def classify_non_match(project: str, cfg: dict) -> tuple[str, str] | None:
    for pattern in cfg["aggregate_patterns"]:
        if re.search(pattern, project, flags=re.IGNORECASE):
            return "aggregate", f"name refers to several schools ({pattern})"
    for pattern in cfg["non_school_patterns"]:
        if re.search(pattern, project, flags=re.IGNORECASE):
            return "not_a_school", f"name matches a non-school building ({pattern})"
    return None


def rank_candidates(project: str, schools: pd.DataFrame, cfg: dict) -> list[dict]:
    itype, icore = core_name(project, cfg, strip_phrases=True)
    inum = numerals(icore)
    ranked = []
    for row in schools.itertuples():
        score = score_pair(icore, row.core)
        notes = []
        if itype and row.stype and itype != row.stype:
            score -= 30
            notes.append(f"type {itype} vs {row.stype}")
        snum = numerals(row.core)
        if inum and snum and inum != snum:
            score -= 20
            notes.append(f"numeral {'/'.join(sorted(inum))} vs {'/'.join(sorted(snum))}")
        elif inum and not snum:
            notes.append(f"numeral {'/'.join(sorted(inum))} in project, none in school name")
        ranked.append({"id": row.id, "name": row.name, "score": round(score, 1), "notes": notes})
    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked


def decide(ranked: list[dict], cfg: dict) -> tuple[str, str]:
    best = ranked[0]
    second = ranked[1]["score"] if len(ranked) > 1 else 0
    margin = best["score"] - second
    if best["score"] < cfg["candidate_min_score"]:
        return "review", f"no candidate above {cfg['candidate_min_score']}"
    if best["notes"]:
        return "review", "; ".join(best["notes"])
    if best["score"] >= cfg["auto_min_score"] and margin >= cfg["auto_min_margin"]:
        return "auto", f"score {best['score']}, margin {margin:.1f}"
    if best["score"] < cfg["auto_min_score"]:
        return "review", f"score {best['score']} below {cfg['auto_min_score']}"
    return "review", f"second candidate close (margin {margin:.1f})"


# --- main ---------------------------------------------------------------------

def load_interventions(src: dict) -> pd.DataFrame:
    path = ROOT / src["path"]
    manifest = json.loads((ROOT / src["manifest"]).read_text(encoding="utf-8"))
    digest = sha256(path)
    if digest != manifest["sha256"]:
        sys.exit(f"{path.name}: sha256 {digest} does not match the manifest")
    raw = pd.read_excel(path, sheet_name=src["sheet"], header=src["header_row"])
    cols = src["columns"]
    raw = raw.dropna(subset=[cols["project_name"]]).reset_index(drop=True)
    # Spreadsheet row of each record: header_row is 0-based, +1 for 1-based, +1 past the header.
    first_row = src["header_row"] + 2
    out = pd.DataFrame({
        "excel_row": raw.index + first_row,
        "program_code": raw[cols["program_code"]].astype(str).str.replace(r"\s+", "", regex=True),
        "program_name": raw[cols["program_name"]].astype(str).str.strip(),
        "project_name": raw[cols["project_name"]].astype(str).str.strip(),
        "amount_raw": raw[cols["amount"]],
        "amount": raw[cols["amount"]].map(parse_amount),
        "year": raw[cols["year"]].map(parse_year).astype("Int64"),
    })
    counts = raw[cols["beneficiaries"]].map(parse_count)
    out["beneficiaries"] = pd.array([c[0] for c in counts], dtype="Int64")
    out["beneficiaries_note"] = [c[1] for c in counts]
    return out


def load_schools(src: dict, cfg: dict) -> pd.DataFrame:
    cols = src["columns"]
    df = pd.read_csv(ROOT / src["path"], dtype={cols["id"]: str})
    schools = pd.DataFrame({
        "id": df[cols["id"]],
        "name": df[cols["name"]].astype(str).str.strip(),
        "lat": df[cols["lat"]],
        "lon": df[cols["lon"]],
        "adm1": df[cols["adm1"]],
        "coordinate_quality": df[cols["coordinate_quality"]],
    })
    parsed = schools["name"].map(lambda n: core_name(n, cfg, strip_phrases=False))
    schools["stype"] = [p[0] for p in parsed]
    schools["core"] = [p[1] for p in parsed]
    return schools


def merge_decisions(new: pd.DataFrame, out_path: Path) -> pd.DataFrame:
    for col in DECISION_COLS:
        new[col] = pd.NA
    if not out_path.exists():
        return new
    old = pd.read_csv(out_path, dtype=str).set_index("intervention_id")
    for i, row in new.iterrows():
        key = row["intervention_id"]
        if key not in old.index:
            continue
        prev = old.loc[key]
        if prev["project_name"] != row["project_name"]:
            if prev[DECISION_COLS].notna().any():
                print(f"  ! {key}: project name changed, decision not carried over")
            continue
        for col in DECISION_COLS:
            new.at[i, col] = prev.get(col)
    return new


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--country", required=True, help="ISO3 code with a config in config/countries/")
    args = parser.parse_args()
    iso = args.country.upper()

    config = load_config(iso)
    mcfg = config["matching"]
    interventions = load_interventions(config["sources"]["interventions"])
    schools = load_schools(config["sources"]["schools"], mcfg)
    print(f"{iso}: {len(interventions)} interventions, {len(schools)} schools")

    by_id = schools.set_index("id")
    rows = []
    for rec in interventions.itertuples():
        row = {
            "intervention_id": f"{iso}-R{rec.excel_row:03d}",
            "program_code": rec.program_code,
            "program_name": rec.program_name,
            "project_name": rec.project_name,
            "year": rec.year,
            "amount": rec.amount,
            "amount_raw": rec.amount_raw if isinstance(rec.amount_raw, str) else pd.NA,
            "beneficiaries": rec.beneficiaries,
            "beneficiaries_note": rec.beneficiaries_note,
        }
        special = classify_non_match(rec.project_name, mcfg)
        if special:
            row["status"], row["reason"] = special
        else:
            ranked = rank_candidates(rec.project_name, schools, mcfg)
            best, second = ranked[0], ranked[1]
            row["status"], row["reason"] = decide(ranked, mcfg)
            row.update({
                "proposed_id_centro": best["id"],
                "proposed_name": best["name"],
                "score": best["score"],
                "proposed_lat": by_id.at[best["id"], "lat"],
                "proposed_lon": by_id.at[best["id"], "lon"],
                "proposed_adm1": by_id.at[best["id"], "adm1"],
                "proposed_coordinate_quality": by_id.at[best["id"], "coordinate_quality"],
                "second_id_centro": second["id"],
                "second_name": second["name"],
                "second_score": second["score"],
            })
        rows.append(row)

    out = pd.DataFrame(rows)
    out_path = ROOT / "data" / "curation" / iso / "interventions_crosswalk.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out = merge_decisions(out, out_path)

    # Final id: a human decision wins; otherwise only 'auto' rows get one.
    decided = out["decision_id_centro"].notna()
    out["id_centro_final"] = out["decision_id_centro"].where(
        decided, out["proposed_id_centro"].where(out["status"] == "auto"))
    out.to_csv(out_path, index=False, encoding="utf-8")

    print(out["status"].value_counts().to_string())
    print(f"Wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

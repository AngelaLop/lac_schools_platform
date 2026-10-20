"""Step 02: build the reconciliation workbook sent to the IDB team.

Reads the crosswalk from step 01 and the school base, and writes
results/{ISO}/{ISO}_reconciliacion_sedes.xlsx (in Spanish, for the IDB team):
one sheet with every intervention next to the school we assigned, and one with
the candidates for each open question. Rows with a question are highlighted and
the IDB fills the yellow columns.

Usage: uv run python scripts/02_reconciliation_xlsx.py --country SUR
"""

import argparse
import json
from itertools import combinations
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parents[1]

FONT = "Arial"
HEADER_FILL = PatternFill("solid", fgColor="1F3864")
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")
QUESTION_FILL = PatternFill("solid", fgColor="FCE4D6")
GREY_FILL = PatternFill("solid", fgColor="EDEDED")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

STATUS_LABEL = {
    "assigned": "Asignada",
    "question": "Duda",
    "not_a_school": "No es escuela",
    "aggregate": "Varias escuelas",
}
CANDIDATE_OPTIONS = '"Sí,No"'


def clean(text) -> str:
    """The source files carry U+FFFD where an apostrophe was lost."""
    if pd.isna(text):
        return ""
    return " ".join(str(text).replace("�", "'").split())


def load(iso: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    config = json.loads((ROOT / "config" / "countries" / f"{iso}.json").read_text(encoding="utf-8"))
    src = config["sources"]["schools"]
    cols = src["columns"]
    schools = pd.read_csv(ROOT / src["path"], dtype={cols["id"]: str})
    schools = schools.rename(columns={v: k for k, v in cols.items()})
    # District, ressort and address come from the ministry list the base was built from.
    ministry = config["sources"].get("school_details")
    if ministry:
        extra = pd.read_excel(ROOT / ministry["path"]).dropna(subset=[ministry["columns"]["id"]])
        extra = extra.rename(columns={v: k for k, v in ministry["columns"].items()})
        extra = extra.drop_duplicates("id")
        schools = schools.merge(extra[["id", "district", "ressort", "address"]], on="id", how="left")
    schools = schools.set_index("id")
    crosswalk = pd.read_csv(ROOT / "data" / "curation" / iso / "interventions_crosswalk.csv", dtype=str)
    return crosswalk, schools


def row_status(r: pd.Series) -> str:
    if r["status"] in ("not_a_school", "aggregate"):
        return r["status"]
    if pd.notna(r["id_centro_final"]):
        return "assigned"
    return "question"


def distance_km(schools: pd.DataFrame, a: str, b: str) -> float:
    """Great-circle distance between two schools of the base."""
    lat1, lon1, lat2, lon2 = map(radians, (schools.at[a, "lat"], schools.at[a, "lon"],
                                           schools.at[b, "lat"], schools.at[b, "lon"]))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def format_distance(km: float) -> str:
    """Spanish style: '160 m' under one kilometre, '1,2 km' above."""
    if km < 1:
        return f"{round(km * 1000, -1):.0f} m"
    return f"{km:.1f} km".replace(".", ",")


def school_fields(schools: pd.DataFrame, sid) -> dict:
    if pd.isna(sid) or sid not in schools.index:
        return {}
    s = schools.loc[sid]
    return {
        "code": sid,
        "name": clean(s["name"]),
        "district": clean(s.get("district")).title(),
        "ressort": clean(s.get("ressort")),
        "address": clean(s.get("address")),
        "lat": round(float(s["lat"]), 6),
        "lon": round(float(s["lon"]), 6),
    }


def style_header(ws, row: int, ncols: int, input_cols: set[int]) -> None:
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = Font(name=FONT, bold=True, color="000000" if c in input_cols else "FFFFFF")
        cell.fill = INPUT_FILL if c in input_cols else HEADER_FILL
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = BORDER


def write_table(ws, start_row: int, headers: list[str], rows: list[list], widths: list[int],
                input_cols: set[int], highlight: list[bool]) -> None:
    for c, h in enumerate(headers, start=1):
        ws.cell(row=start_row, column=c, value=h)
    style_header(ws, start_row, len(headers), input_cols)
    for i, values in enumerate(rows, start=start_row + 1):
        for c, v in enumerate(values, start=1):
            cell = ws.cell(row=i, column=c, value=v)
            cell.font = Font(name=FONT, size=10)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            cell.border = BORDER
            if c in input_cols:
                cell.fill = INPUT_FILL
            elif highlight[i - start_row - 1]:
                cell.fill = QUESTION_FILL
    for c, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = ws.cell(row=start_row + 1, column=1)
    ws.auto_filter.ref = f"A{start_row}:{get_column_letter(len(headers))}{start_row + len(rows)}"


def build(iso: str, crosswalk: pd.DataFrame, schools: pd.DataFrame, notes: dict, questions: list[dict]) -> Workbook:
    wb = Workbook()

    # --- Reconciliación: one row per intervention -----------------------------
    ws = wb.active
    ws.title = "Reconciliación"
    headers = ["Fila en su Excel", "Programa", "Nombre del programa", "Nombre en su Excel", "Año",
               "Estado", "Código escuela (Ministerio)", "Nombre en el listado del Ministerio",
               "Distrito", "Ressort", "Latitud", "Longitud", "Duda o nota"]
    by_question = {q["id"]: q for q in questions}
    rows, highlight = [], []
    for _, r in crosswalk.iterrows():
        status = row_status(r)
        s = school_fields(schools, r["id_centro_final"])
        note = notes.get(r["intervention_id"], "")
        # A row with a question lists every candidate, one per line, in the name cell.
        q = by_question.get(r["intervention_id"])
        if status == "question" and q and q.get("candidates"):
            options = []
            for sid in q["candidates"]:
                c = school_fields(schools, sid)
                options.append(f"{c['code']} {c['name']} ({c['ressort']}, {c['district']})")
            options += q.get("extra_options", [])
            text = "Opciones:\n" + "\n".join(f"{i}. {o}" for i, o in enumerate(options, start=1))
            # Distances show the answer moves the point on the map.
            pairs = list(combinations(enumerate(q["candidates"], start=1), 2))
            if pairs:
                text += "\nDistancia entre ellas:\n" + "\n".join(
                    f"{i} y {j}: {format_distance(distance_km(schools, a, b))}" for (i, a), (j, b) in pairs)
            s = {"name": text}
        rows.append([
            int(r["intervention_id"].split("-R")[1]), r["program_code"], clean(r["program_name"]),
            clean(r["project_name"]), int(r["year"]) if pd.notna(r["year"]) else None, STATUS_LABEL[status],
            s.get("code"), s.get("name"), s.get("district"), s.get("ressort"), s.get("lat"), s.get("lon"),
            note,
        ])
        highlight.append(status in ("question", "aggregate"))
    write_table(ws, 1, headers, rows, [9, 11, 18, 40, 7, 14, 13, 45, 13, 15, 10, 10, 50],
                input_cols=set(), highlight=highlight)
    n_recon = len(rows)

    # --- Dudas: candidates for each open question ----------------------------
    wq = wb.create_sheet("Dudas")
    headers = ["Duda", "Nombre en su Excel", "Pregunta", "Código candidato", "Nombre en el listado del Ministerio",
               "Distrito", "Ressort", "Dirección", "Latitud", "Longitud", "¿Es esta? (Sí / No)", "Comentario"]
    rows = []
    for n, q in enumerate(questions, start=1):
        project = clean(crosswalk.set_index("intervention_id").at[q["id"], "project_name"])
        for sid in q.get("candidates") or [None]:
            s = school_fields(schools, sid)
            rows.append([n, project, q["question"], s.get("code"), s.get("name"), s.get("district"),
                         s.get("ressort"), s.get("address"), s.get("lat"), s.get("lon"), None, None])
    write_table(wq, 1, headers, rows, [7, 30, 55, 12, 30, 13, 15, 24, 10, 10, 14, 30],
                input_cols={11, 12}, highlight=[True] * len(rows))
    dv2 = DataValidation(type="list", formula1=CANDIDATE_OPTIONS, allow_blank=True)
    wq.add_data_validation(dv2)
    dv2.add(f"K2:K{len(rows) + 1}")

    # --- Léeme -----------------------------------------------------------------
    wr = wb.create_sheet("Léeme", 0)
    wr.column_dimensions["A"].width = 34
    wr.column_dimensions["B"].width = 90
    lines = [
        ("Reconciliación de sedes intervenidas por el BID en Surinam", None),
        (None, None),
        ("Qué es", "Cada intervención del archivo «Overview Education Infrastructure» (septiembre de 2026) "
                   "junto a la escuela del listado del Ministerio de Educación (marzo de 2024) a la que la "
                   "asignamos. El cruce se hizo por nombre, el archivo no trae código de escuela."),
        ("Filas resaltadas", "Las filas en naranja son las dudas sobre las sedes"),
        ("Coordenadas", "Latitud y longitud vienen del listado del Ministerio (grados decimales)."),
        (None, None),
        ("Resumen", None),
    ]
    for i, (a, b) in enumerate(lines, start=1):
        wr.cell(row=i, column=1, value=a).font = Font(name=FONT, bold=True, size=13 if i == 1 else 10)
        cell = wr.cell(row=i, column=2, value=b)
        cell.font = Font(name=FONT, size=10)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    rng = f"'Reconciliación'!$F$2:$F${n_recon + 1}"
    summary = [("Intervenciones", f"=COUNTA({rng})")]
    summary += [(label, f'=COUNTIF({rng},"{label}")') for label in STATUS_LABEL.values()]
    start = len(lines) + 1
    wr.cell(row=start, column=2, value="Filas").font = Font(name=FONT, bold=True, size=10)
    for i, (label, count) in enumerate(summary, start=start + 1):
        wr.cell(row=i, column=1, value=label).font = Font(name=FONT, size=10, bold=(label == "Intervenciones"))
        wr.cell(row=i, column=2, value=count).font = Font(name=FONT, size=10)
        wr.cell(row=i, column=2).alignment = Alignment(horizontal="left")
    return wb


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--country", required=True)
    args = parser.parse_args()
    iso = args.country.upper()

    crosswalk, schools = load(iso)
    q = json.loads((ROOT / "data" / "curation" / iso / "idb_questions.json").read_text(encoding="utf-8"))
    wb = build(iso, crosswalk, schools, q["notes"], q["questions"])
    out = ROOT / "results" / iso / f"{iso}_reconciliacion_sedes.xlsx"
    out.parent.mkdir(parents=True, exist_ok=True)
    # openpyxl stores no cached results; Excel computes the summary on open.
    wb.calculation.fullCalcOnLoad = True
    wb.save(out)
    print(f"Wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

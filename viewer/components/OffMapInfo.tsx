"use client";

import Info from "@/components/Info";
import { PLACEMENT_LABEL, applyFilter, byPlacement, int, money, totals, type Dataset, type Filter } from "@/lib/data";

/** What the map does not show: the projects that cannot be one point, and the
 *  school lists whose layer is off. An info button beside the headline amount. */
export default function OffMapInfo({ data, filter }: { data: Dataset; filter: Filter }) {
  const { currency } = data;
  const rows = applyFilter(data.interventions, filter);
  const t = totals(rows);
  const placement = byPlacement(rows);
  const onMap = placement.find((p) => p.key === "school")!;
  const hidden = applyFilter(data.hidden ?? [], filter);
  const off = (data.country.list_layers ?? [])
    .map((l) => {
      const mine = hidden.filter((r) => r.parent === l.key);
      return {
        ...l,
        amount: mine.reduce((a, r) => a + (r.amount ?? 0), 0),
        schools: new Set(mine.filter((r) => r.school).map((r) => r.school)).size,
      };
    })
    .filter((l) => l.amount > 0 || l.schools > 0);

  return (
    <Info title="What the map does not show">
      <p>
        <strong className="num font-medium" style={{ color: "var(--ink)" }}>{money(onMap.amount, currency)}</strong> of{" "}
        {money(t.amount, currency)} is assigned to a school shown on the map.
        The rest cannot be drawn as one point:
      </p>
      <ul className="mt-2 space-y-2">
        {placement.filter((p) => p.key !== "school" && p.projects > 0).map((p) => (
          <li key={p.key}>
            <div className="flex justify-between gap-2" style={{ color: "var(--ink)" }}>
              <span className="font-medium">{PLACEMENT_LABEL[p.key]}</span>
              <span className="num shrink-0" style={{ color: "var(--ink-2)" }}>{money(p.amount, currency)}</span>
            </div>
            <p className="text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
              {rows.filter((r) => r.placement === p.key)
                .map((r) => r.project + (r.beneficiaries ? ` (${int(r.beneficiaries)} beneficiaries)` : "")
                  + (r.residual_note ? `. ${r.residual_note}` : "")).join("; ")}
            </p>
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--rule)" }}>
          <p>
            Not counted above: tick their boxes in the map legend to add these projects and show their schools.
          </p>
          <ul className="mt-1.5 space-y-1">
            {off.map((l) => (
              <li key={l.key} className="flex justify-between gap-2" style={{ color: "var(--ink)" }}>
                <span>
                  <span className="font-medium">{l.label}</span>{" "}
                  <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>({l.schools} schools)</span>
                </span>
                <span className="num shrink-0" style={{ color: "var(--ink-2)" }}>{money(l.amount, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Info>
  );
}

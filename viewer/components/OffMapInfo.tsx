"use client";

import Info from "@/components/Info";
import { PLACEMENT_LABEL, applyFilter, byPlacement, int, money, totals, type Dataset, type Filter } from "@/lib/data";

/** What the map does not show: the works that cannot be one point. An info
 *  button beside the headline amount. */
export default function OffMapInfo({ data, filter }: { data: Dataset; filter: Filter }) {
  const { currency } = data;
  const rows = applyFilter(data.interventions, filter);
  const t = totals(rows);
  const placement = byPlacement(rows);
  const onMap = placement.find((p) => p.key === "school")!;

  return (
    <Info title="What the map does not show">
      <p>
        <strong className="num font-medium" style={{ color: "var(--ink)" }}>{money(onMap.amount, currency)}</strong> of{" "}
        {money(t.amount, currency)} went to works at one school each, and those schools are the pins.
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
                .map((r) => r.project + (r.beneficiaries ? ` (${int(r.beneficiaries)} beneficiaries)` : "")).join("; ")}
            </p>
          </li>
        ))}
      </ul>
    </Info>
  );
}

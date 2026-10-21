"use client";

import { useEffect } from "react";

import { applyFilter, money, totals, type Dataset, type Filter } from "@/lib/data";

interface Props {
  data: Dataset;
  years: number[];
  filter: Filter;
  playing: boolean;
  onFilter: (f: Filter) => void;
  onPlaying: (p: boolean) => void;
}

/** Steps a year at a time, as Arctic Spills steps its weeks. */
const STEP_MS = 1100;

export default function Timeline({ data, years, filter, playing, onFilter, onPlaying }: Props) {
  const last = years[years.length - 1];
  const { year, only } = filter;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (year >= last) onPlaying(false);
      else onFilter({ ...filter, year: year + 1, only: false });
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, year, last, filter, onFilter, onPlaying]);

  const toggle = () => {
    if (playing) return onPlaying(false);
    // Playing is always cumulative: it starts over from the first year.
    if (year >= last || only) onFilter({ ...filter, year: years[0], only: false });
    onPlaying(true);
  };

  const t = totals(applyFilter(data.interventions, filter));
  const lit = (y: number) => (only ? y === year : y <= year);

  return (
    <div className="flex items-stretch bg-white shadow-md">
      <div className="flex min-w-[118px] max-md:min-w-0 flex-col justify-center px-4 py-2" style={{ background: "var(--line)", color: "#fff" }}>
        <span className="num text-[28px] font-medium leading-none">{year}</span>
        <span className="num text-[11px] opacity-75">
          {only ? `${money(t.amount, data.currency)} that year` : `${money(t.amount, data.currency)} so far`}
        </span>
      </div>
      <button onClick={toggle} className="flex w-[84px] max-md:w-[64px] items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-wider text-white"
        style={{ background: "var(--accent)" }} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "Pause" : "Play"}
        <span aria-hidden>{playing ? "❚❚" : "▶"}</span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-2 max-md:px-2">
        <div className="flex gap-[3px]">
          {years.map((y) => (
            <button key={y} onClick={() => { onPlaying(false); onFilter({ ...filter, year: y, only: false }); }}
              className={`h-4 flex-1 rounded-[2px] ${lit(y) ? "tick-past" : ""}`}
              style={{ background: lit(y) ? undefined : "var(--rule)" }}
              title={`Works up to ${y}`} aria-label={`Show works up to ${y}`} />
          ))}
        </div>
        <div className="mt-1 flex gap-[3px] text-[10px]" style={{ color: "var(--ink-3)" }}>
          {years.map((y) => (
            // On a phone the full years do not fit side by side: '20, '21...
            <span key={y} className="num flex-1 text-center">
              <span className="max-md:hidden">{y}</span><span className="md:hidden">’{String(y).slice(2)}</span>
            </span>
          ))}
        </div>
      </div>
      {only && (
        <button onClick={() => onFilter({ ...filter, year: last, only: false })}
          className="px-3 text-[11px] underline" style={{ color: "var(--accent)" }}>
          All years
        </button>
      )}
    </div>
  );
}

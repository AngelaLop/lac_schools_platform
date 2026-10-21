"use client";

// Small pieces shared by the panels.

import { useState } from "react";

/** A block of a card. A collapsible one has its whole title row as the
 *  toggle, with a small chevron at the end. */
export function Section({ title, note, children, collapsible = false, defaultOpen = true }: {
  title: string; note?: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  const heading = (
    <h2 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--ink-2)" }}>{title}</h2>
  );
  return (
    <section className="fold-section border-t px-4 py-3 [@media(max-height:738px)]:py-2" style={{ borderColor: "var(--rule)" }}>
      {collapsible ? (
        <button onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left max-md:min-h-11">
          {heading}
          <Chevron open={open} />
        </button>
      ) : heading}
      {shown && note && <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>{note}</p>}
      {shown && <div className="mt-2">{children}</div>}
    </section>
  );
}

/** A card of its own under the main panel, folded by default: a title, a line
 *  that says what is inside, and the chevron. */
export function FoldCard({ title, subtitle, children, defaultOpen = false, flat = false }: {
  title: string; subtitle: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
  /** No card of its own: on the phone it sits in the sheet like the other blocks. */
  flat?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={flat ? "bg-white" : "bg-white shadow-lg"}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className="block text-[13px] font-medium">{title}</span>
          {/* On short screens the subtitle goes, so the year and program charts above keep their room. */}
          <span className="block text-[11px] [@media(max-height:648px)]:hidden" style={{ color: "var(--ink-3)" }}>{subtitle}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--rule)" }}>{children}</div>}
    </div>
  );
}

/** The toggle mark of every folding block: a bare chevron, pointing down when
 *  folded and up when open. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="flex h-3 w-3 shrink-0 items-center justify-center transition-transform"
      style={{ color: "var(--ink-3)", transform: open ? "rotate(180deg)" : undefined }}>
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

export function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: "0 0 0 1px var(--line)" }}
    />
  );
}

export function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

/** The flag of Suriname: green, white, red (twice as wide), white, green, in
 *  bands of 2:1:4:1:2, with a yellow five-pointed star on the red. */
export function FlagSUR({ height = 12 }: { height?: number }) {
  // Star of outer radius 1.6 centred at (7.5, 5), in a 15 x 10 box.
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 1.6 : 0.65;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(7.5 + r * Math.cos(a)).toFixed(3)},${(5 + r * Math.sin(a)).toFixed(3)}`;
  }).join(" ");
  return (
    <svg height={height} viewBox="0 0 15 10" role="img" aria-label="Flag of Suriname">
      <rect width="15" height="10" fill="#377e3f" />
      <rect y="2" width="15" height="6" fill="#ffffff" />
      <rect y="3" width="15" height="4" fill="#b40a2d" />
      <polygon points={star} fill="#ecc81d" />
    </svg>
  );
}

/** A small flag by ISO3, for the country line under the title. */
export function Flag({ iso3, height }: { iso3: string; height?: number }) {
  if (iso3 === "SUR") return <FlagSUR height={height} />;
  return null;
}

/** Author credit, as in the emergency viewer: GitHub mark and the portfolio
 *  link. "Viewer by" says who built the tool, not who owns it; the grey is
 *  lighter than the Sources button so it never competes with the logos. */
export function Author({ light = false }: { light?: boolean }) {
  const color = light ? "rgba(255,255,255,0.75)" : "var(--ink-3)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-normal" style={{ color }}>
      Viewer by
      <a href="https://github.com/AngelaLop" target="_blank" rel="noreferrer" title="AngelaLop on GitHub"
        className="inline-flex" style={{ color: "inherit" }}>
        <GitHubMark size={12} />
      </a>
      <a href="https://angelalop.github.io/AngelaLopezS/" target="_blank" rel="noreferrer"
        title="Angela López's portfolio" style={{ color: "inherit" }}>
        AngelaLop
      </a>
    </span>
  );
}

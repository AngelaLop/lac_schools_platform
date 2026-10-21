"use client";

import { useEffect, useRef, useState } from "react";

/** An "i" button that opens a popup under it with a title and an explanation.
 *  The popup is placed against the window, not the panel, so no scrolling box
 *  clips it; on a phone it sits near the top of the screen. It closes with the
 *  cross, a click outside or Escape. */
export default function Info({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // The focus goes into the popup when it opens and back to the button when it closes.
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <span ref={box} className="inline-flex align-middle">
      <button ref={button} onClick={(e) => {
          e.stopPropagation();
          const r = box.current!.getBoundingClientRect();
          // Kept inside the window when the icon sits near its right edge.
          const left = Math.min(Math.max(12, r.left - 16), window.innerWidth - 372);
          // Under the icon when there is room, above it when it sits low on the screen.
          const below = window.innerHeight - r.bottom > 360;
          setAt(below ? { left, top: r.bottom + 8 } : { left, bottom: window.innerHeight - r.top + 8 });
          setOpen(!open);
        }} aria-expanded={open} aria-haspopup="dialog" title={title} aria-label={title}
        className="relative flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold italic hover:bg-[var(--panel)] max-md:after:absolute max-md:after:-inset-3 max-md:after:content-['']"
        style={{ borderColor: "var(--ink-3)", color: "var(--ink)", fontFamily: "Georgia, serif" }}>
        i
      </button>

      {open && at && (
        <div ref={dialog} tabIndex={-1} role="dialog" aria-label={title}
          className="fixed z-50 max-h-[calc(100dvh-24px)] w-[360px] max-w-[calc(100vw-24px)] overflow-y-auto bg-white px-4 pb-4 pt-3 text-left font-normal normal-case tracking-normal shadow-xl max-md:!bottom-auto max-md:!left-3 max-md:right-3 max-md:!top-20 max-md:max-h-[calc(100dvh-100px)] max-md:w-auto"
          style={{ border: "1px solid var(--rule)", left: at.left, top: at.top, bottom: at.bottom, color: "var(--ink)" }}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-medium">{title}</p>
            <button onClick={close} aria-label="Close" className="-m-2 flex h-9 w-9 items-center justify-center text-lg leading-none max-md:h-11 max-md:w-11" style={{ color: "var(--ink-3)" }}>×</button>
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--ink-2)" }}>{children}</div>
        </div>
      )}
    </span>
  );
}

"use client";

import { useRef } from "react";

/** How far up the bottom sheet stands on a phone: a peek with the year and
 *  the headline, half the screen, or the whole screen under the title bar. */
export type Snap = "peek" | "half" | "full";

const ORDER: Snap[] = ["peek", "half", "full"];
export const PEEK_PX = 272;
const HEIGHT: Record<Snap, string> = {
  peek: `${PEEK_PX}px`,
  half: "55dvh",
  full: "calc(100dvh - 64px)",
};

/** The phone's bottom sheet, as in a maps app: drag the handle up or down to
 *  move a step; tap it to go between the peek and half the screen. */
export default function Sheet({ snap, onSnap, children }: {
  snap: Snap; onSnap: (s: Snap) => void; children: React.ReactNode;
}) {
  const start = useRef<number | null>(null);
  const i = ORDER.indexOf(snap);

  const end = (y: number) => {
    if (start.current == null) return;
    const dy = y - start.current;
    start.current = null;
    if (dy < -30) onSnap(ORDER[Math.min(i + 1, ORDER.length - 1)]);
    else if (dy > 30) onSnap(ORDER[Math.max(i - 1, 0)]);
    else onSnap(snap === "peek" ? "half" : "peek");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(28,40,44,0.18)]"
      style={{ height: HEIGHT[snap], transition: "height 260ms ease" }}>
      <button
        aria-label={snap === "peek" ? "Show more" : "Show less"}
        className="flex h-11 w-full shrink-0 touch-none items-center justify-center"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSnap(snap === "peek" ? "half" : "peek"); }
        }}
        // Capture the pointer so the release still counts once the finger
        // has left the handle on its way up.
        onPointerDown={(e) => { start.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp={(e) => end(e.clientY)}
        onPointerCancel={() => { start.current = null; }}
      >
        <span className="h-1.5 w-10 rounded-full" style={{ background: "var(--muted)" }} />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ overflowY: snap === "peek" ? "hidden" : "auto" }}>
        {children}
      </div>
    </div>
  );
}

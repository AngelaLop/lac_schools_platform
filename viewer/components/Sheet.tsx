"use client";

import { useRef } from "react";

/** How far up the bottom sheet stands on a phone: a peek with the headline
 *  figures, half the screen, or the whole screen under the title bar. */
export type Snap = "peek" | "half" | "full";

const ORDER: Snap[] = ["peek", "half", "full"];
/** The handle (44 px) and the headline under it (120 px): the amount and its
 *  three figures, and as much map as possible above. */
export const PEEK_PX = 168;
const HEIGHT: Record<Snap, string> = {
  peek: `${PEEK_PX}px`,
  half: "55dvh",
  full: "calc(100dvh - 64px)",
};

/** A swipe longer than this moves the sheet a step. */
const SWIPE_PX = 30;

/** The phone's bottom sheet, as in a maps app. The handle moves it a step up
 *  or down with a swipe, and a tap goes between the peek and half the screen.
 *  The content moves it too: at the peek, where it does not scroll, a swipe up
 *  raises it; open, a swipe down that starts with the content at its top
 *  lowers it. A tap on a button inside is left alone. */
export default function Sheet({ snap, onSnap, children }: {
  snap: Snap; onSnap: (s: Snap) => void; children: React.ReactNode;
}) {
  const start = useRef<number | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ y: number; top: number } | null>(null);
  const i = ORDER.indexOf(snap);
  const up = () => onSnap(ORDER[Math.min(i + 1, ORDER.length - 1)]);
  const down = () => onSnap(ORDER[Math.max(i - 1, 0)]);

  const end = (y: number) => {
    if (start.current == null) return;
    const dy = y - start.current;
    start.current = null;
    if (dy < -SWIPE_PX) up();
    else if (dy > SWIPE_PX) down();
    else onSnap(snap === "peek" ? "half" : "peek");
  };

  const endSwipe = (y: number) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dy = y - s.y;
    if (snap === "peek" && dy < -SWIPE_PX) up();
    else if (dy > SWIPE_PX && s.top <= 0) down();
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
      <div ref={content} className="min-h-0 flex-1 overscroll-contain"
        // At the peek the browser does nothing with a swipe, so it reaches us.
        style={{ overflowY: snap === "peek" ? "hidden" : "auto", touchAction: snap === "peek" ? "none" : "pan-y" }}
        onTouchStart={(e) => { swipe.current = { y: e.touches[0].clientY, top: content.current?.scrollTop ?? 0 }; }}
        onTouchEnd={(e) => endSwipe(e.changedTouches[0].clientY)}
        onTouchCancel={() => { swipe.current = null; }}>
        {children}
      </div>
    </div>
  );
}

"use client";

import type * as GeoJSON from "geojson";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Dataset } from "@/lib/data";
import { PEEK_PX } from "@/components/Sheet";
import { pinImage } from "@/lib/pin";
import { PALETTE, PROGRAM_HEX, SEA_BANDS } from "@/lib/theme";

// CARTO's light vector style, recoloured on load with the Arctic palette. The
// vector tiles carry the sea, the rivers and the neighbouring countries, which
// the IDB boundaries alone do not (French Guiana is not in them).
const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface Props {
  data: Dataset;
  /** Schools whose works pass the filter (year, program); the other pins fade. */
  active: Set<string>;
  selected: string | null;
  district: string | null;
  onSelect: (id: string | null) => void;
  /** Closes the school card and the district; the filters stay. */
  onHome: () => void;
}

type Edge = "n" | "e" | "s" | "w";

/** Room for the panels that sit over the map; on a phone they sit below it. */
function pad(m: maplibregl.Map, desktop: maplibregl.PaddingOptions): maplibregl.PaddingOptions {
  // On a phone the title bar sits on top and the sheet's peek at the bottom.
  return m.getContainer().clientWidth < 768 ? { top: 80, bottom: PEEK_PX + 20, left: 24, right: 24 } : desktop;
}

/** Recolour the CARTO layers by their role; hide what competes with the data. */
function recolour(m: maplibregl.Map) {
  for (const layer of m.getStyle().layers ?? []) {
    const id = layer.id;
    if (layer.type === "background") m.setPaintProperty(id, "background-color", PALETTE.land);
    else if (layer.type === "fill" && /^water/.test(id)) {
      m.setPaintProperty(id, "fill-color", PALETTE.sea);
      m.setPaintProperty(id, "fill-opacity", 1);
    } else if (layer.type === "line" && /^waterway/.test(id)) m.setPaintProperty(id, "line-color", PALETTE.seaDeep);
    else if (layer.type === "fill" && /landcover|landuse|park|building|aeroway/.test(id)) {
      m.setLayoutProperty(id, "visibility", "none");
    } else if (layer.type === "line" && /boundary_country_outline/.test(id)) {
      m.setLayoutProperty(id, "visibility", "none");
    } else if (layer.type === "line" && /boundary_country/.test(id)) {
      m.setPaintProperty(id, "line-color", PALETTE.line);
      m.setPaintProperty(id, "line-width", 1);
      m.setPaintProperty(id, "line-blur", 0);
      m.setPaintProperty(id, "line-opacity", 0.6);
    } else if (layer.type === "line" && /boundary/.test(id)) m.setLayoutProperty(id, "visibility", "none");
    else if (layer.type === "line" && /road|tunnel|bridge|rail|aeroway/.test(id)) {
      m.setPaintProperty(id, "line-color", "#ffffff");
      m.setPaintProperty(id, "line-opacity", 0.7);
    } else if (layer.type === "symbol") {
      if (/poi|housenumber|roadname|road_|aeroway|water_way|waterway/.test(id)) {
        m.setLayoutProperty(id, "visibility", "none");
      } else {
        m.setPaintProperty(id, "text-color", /watername/.test(id) ? "#5f9fb0" : "#5d6b70");
        m.setPaintProperty(id, "text-halo-color", "rgba(255,255,255,0.6)");
      }
    }
  }
}

/** The home button, from the emergency viewer: back to the country frame, and
 *  the school card and district close with it. The filters are left alone. */
class HomeControl implements maplibregl.IControl {
  private div!: HTMLDivElement;

  constructor(private onClick: () => void) {}

  onAdd() {
    this.div = document.createElement("div");
    this.div.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const b = document.createElement("button");
    b.type = "button";
    b.title = "Back to the whole country";
    b.setAttribute("aria-label", "Back to the whole country");
    b.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" style="margin:auto;display:block">' +
      '<path d="M2 7.2 8 2l6 5.2V14H10v-4H6v4H2V7.2Z" fill="none" stroke="#333" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    b.onclick = this.onClick;
    this.div.appendChild(b);
    return this.div;
  }

  onRemove() {
    this.div.remove();
  }
}

/** Level the camera and drop the padding a fly-in leaves behind. MapLibre keeps
 *  the padding of flyTo in the camera and adds it to the next fit's padding,
 *  which made the home button land far out over the Atlantic. */
const NO_PAD = { top: 0, bottom: 0, left: 0, right: 0 };
function level(m: maplibregl.Map) {
  m.jumpTo({ pitch: 0, bearing: 0, padding: NO_PAD });
}

/** Back to the country frame. */
function fitCountry(m: maplibregl.Map, bbox: [number, number, number, number]) {
  const [w, s, e, n] = bbox;
  level(m);
  m.fitBounds([[w, s], [e, n]], { duration: 1200, padding: pad(m, { top: 40, bottom: 110, left: 420, right: 60 }) });
}

function bboxOf(geom: GeoJSON.Geometry): [number, number, number, number] {
  const b: [number, number, number, number] = [180, 90, -180, -90];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    } else (c as unknown[]).forEach(walk);
  };
  walk((geom as GeoJSON.Polygon).coordinates);
  return b;
}

export default function Map({ data, active, selected, district, onSelect, onHome }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [offscreen, setOffscreen] = useState<Record<Edge, string[]>>({ n: [], e: [], s: [], w: [] });
  const select = useRef(onSelect);
  select.current = onSelect;
  const home = useRef(onHome);
  home.current = onHome;

  // Each school with works carries the index of its program, which picks its
  // pin; the filter fades pins through feature state, not a new source.
  const points = useMemo(() => {
    const order = data.country.programs;
    return {
      type: "FeatureCollection",
      features: data.schools.map((s) => {
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          properties: {
            id: s.id,
            name: s.name,
            works: s.ivs.length > 0 ? 1 : 0,
            p: s.program ? order.indexOf(s.program) : -1,
            lat: s.lat,
          },
        };
      }),
    } as GeoJSON.FeatureCollection;
  }, [data]);

  const worked = useMemo(() => data.schools.filter((s) => s.ivs.length > 0), [data]);

  useEffect(() => {
    if (!div.current) return;
    // A link to a school or a district opens there; a bare link opens on the
    // wide frame and flies in once the sea bands have come in.
    const intro = !selected && !district ? data.country.intro_bbox : undefined;
    const [w, s, e, n] = intro ?? data.country.bbox;
    const m = new maplibregl.Map({
      container: div.current,
      style: STYLE,
      bounds: [[w, s], [e, n]],
      fitBoundsOptions: { padding: div.current.clientWidth < 768
        ? { top: 80, bottom: PEEK_PX + 20, left: 24, right: 24 } : { top: 40, bottom: 110, left: 420, right: 60 } },
      attributionControl: { compact: true },
      maxPitch: 60,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.addControl(new HomeControl(() => {
      fitCountry(m, data.country.bbox);
      home.current();
    }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "top-right");
    map.current = m;

    m.on("load", async () => {
      recolour(m);
      await Promise.all(PROGRAM_HEX.map(async (hex, i) => m.addImage(`pin-${i}`, await pinImage(hex), { pixelRatio: 2 })));
      m.addSource("adm1", { type: "geojson", data: data.adm1Geo, promoteId: "adm1" });
      m.addSource("schools", { type: "geojson", data: points, promoteId: "id" });
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      // Sea depth bands, as in Arctic Spills. The 0 m band is left out: CARTO's
      // own water already draws the coast, and the two coastlines differ.
      if (data.bathyGeo) {
        m.addSource("sea", { type: "geojson", data: data.bathyGeo });
        SEA_BANDS.forEach(([depth, colour], i) => {
          m.addLayer({
            id: `sea-${depth}`, type: "fill", source: "sea",
            filter: ["==", ["get", "depth"], depth],
            paint: {
              "fill-color": colour,
              "fill-antialias": false,
              "fill-opacity": 0,
              // On load the bands come in from the coast outward, one after the other.
              "fill-opacity-transition": { duration: 900, delay: 300 + i * 260 },
            },
          }, firstSymbol);
        });
        requestAnimationFrame(() => SEA_BANDS.forEach(([depth]) => m.setPaintProperty(`sea-${depth}`, "fill-opacity", 1)));
      }
      if (intro) {
        const [hw, hs, he, hn] = data.country.bbox;
        setTimeout(() => m.fitBounds([[hw, hs], [he, hn]], {
          padding: pad(m, { top: 40, bottom: 110, left: 420, right: 60 }), duration: 2600, essential: false,
        }), 300 + SEA_BANDS.length * 260);
      }
      m.addLayer({
        id: "adm1-fill", type: "fill", source: "adm1",
        paint: {
          "fill-color": PALETTE.landCountry,
          "fill-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.35, 0.9],
        },
      }, firstSymbol);
      m.addLayer({
        id: "adm1-line", type: "line", source: "adm1",
        paint: { "line-color": PALETTE.line, "line-width": 0.6, "line-opacity": 0.35, "line-dasharray": [3, 2] },
      }, firstSymbol);
      m.addLayer({
        id: "schools-base", type: "circle", source: "schools",
        filter: ["==", ["get", "works"], 0],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.8, 10, 3.5, 14, 6],
          "circle-color": PALETTE.school,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, 0, 10, 0.8],
        },
      });
      m.addLayer({
        id: "schools-works", type: "symbol", source: "schools",
        filter: ["==", ["get", "works"], 1],
        layout: {
          "icon-image": ["concat", "pin-", ["to-string", ["get", "p"]]],
          "icon-anchor": "bottom",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.75, 10, 0.95, 14, 1.2],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // Southern pins drawn last, so a pin never hides the tip of the one below it.
          "symbol-sort-key": ["-", 0, ["get", "lat"]],
        },
        paint: {
          "icon-opacity": ["case", ["boolean", ["feature-state", "off"], false], 0.22, 1],
        },
      });
      m.addLayer({
        id: "schools-sel-halo", type: "circle", source: "schools",
        filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 9, "circle-color": "rgba(28,40,44,0.18)", "circle-stroke-color": PALETTE.line, "circle-stroke-width": 1.5 },
      }, "schools-base");

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      for (const layer of ["schools-works", "schools-base"]) {
        m.on("mouseenter", layer, (e) => {
          m.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (f) popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setText(String(f.properties?.name)).addTo(m);
        });
        m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; popup.remove(); });
        m.on("click", layer, (e) => {
          const f = e.features?.[0];
          if (f) { e.preventDefault(); select.current(String(f.properties?.id)); }
        });
      }
      m.on("click", (e) => { if (!e.defaultPrevented) select.current(null); });
      setReady(true);
    });

    // A new map (a reload of the code, new data) starts not ready, or the
    // effects below would write to a style that has not loaded yet.
    return () => { setReady(false); m.remove(); map.current = null; };
  }, [data, points]);

  // Filter: pins outside it fade, they do not vanish.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getSource("schools")) return;
    for (const f of points.features) {
      const p = f.properties!;
      if (p.works) m.setFeatureState({ source: "schools", id: p.id }, { off: !active.has(p.id) });
    }
  }, [active, ready, points]);

  // Selection: fly in tilted, as the Marseille map does; back out flat.
  const prevSel = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getSource("schools")) return;
    const closing = prevSel.current != null;
    if (closing) m.setFeatureState({ source: "schools", id: prevSel.current! }, { sel: false });
    prevSel.current = selected;
    m.setFilter("schools-sel-halo", ["==", ["get", "id"], selected ?? ""]);
    if (selected) {
      m.setFeatureState({ source: "schools", id: selected }, { sel: true });
      const s = data.schools.find((x) => x.id === selected);
      if (s) m.flyTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 12), pitch: 50, bearing: -15, speed: 0.9, padding: pad(m, { left: 400, right: 380, top: 0, bottom: 120 }) });
    } else if (!district && closing) {
      // Only when a card closes; on load the intro does the framing.
      fitCountry(m, data.country.bbox);
    }
  }, [selected, ready, data, district]);

  // District: frame it and dim the others.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getSource("schools")) return;
    for (const f of data.adm1Geo.features) {
      const id = String(f.properties?.adm1);
      m.setFeatureState({ source: "adm1", id }, { dim: district != null && id !== district });
    }
    if (district && !selected) {
      const f = data.adm1Geo.features.find((x) => x.properties?.adm1 === district);
      if (f) {
        const [w, s, e, n] = bboxOf(f.geometry);
        level(m);
        m.fitBounds([[w, s], [e, n]], { pitch: 0, bearing: 0, padding: pad(m, { top: 60, bottom: 160, left: 440, right: 60 }), duration: 1400 });
      }
    }
  }, [district, ready, data, selected]);

  // Schools with works out of view, counted per edge (the Marseille counters).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getSource("schools")) return;
    const update = () => {
      const b = m.getBounds();
      const c = m.getCenter();
      const out: Record<Edge, string[]> = { n: [], e: [], s: [], w: [] };
      for (const s of worked) {
        if (b.contains([s.lon, s.lat])) continue;
        const dx = (s.lon - c.lng) / (b.getEast() - b.getWest());
        const dy = (s.lat - c.lat) / (b.getNorth() - b.getSouth());
        const edge: Edge = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "n" : "s");
        out[edge].push(s.id);
      }
      setOffscreen(out);
    };
    update();
    m.on("moveend", update);
    return () => { m.off("moveend", update); };
  }, [ready, worked]);

  const frame = (ids: string[]) => {
    const m = map.current;
    if (!m || !ids.length) return;
    const pts = worked.filter((s) => ids.includes(s.id));
    const b = new maplibregl.LngLatBounds();
    pts.forEach((s) => b.extend([s.lon, s.lat]));
    if (selected) onSelect(null);
    level(m);
    m.fitBounds(b, { padding: pad(m, { top: 120, bottom: 200, left: 460, right: 120 }), maxZoom: 12, pitch: 0, bearing: 0, duration: 1400 });
  };

  const badge = (edge: Edge, cls: string, arrow: string) =>
    offscreen[edge].length > 0 && (
      <button
        onClick={() => frame(offscreen[edge])}
        className={`absolute z-10 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold shadow-sm ${cls}`}
        style={{ color: "var(--ink)" }}
        title={`${offscreen[edge].length} schools with works out of view`}
      >
        {edge === "w" || edge === "n" ? arrow : null}
        <span className="num">{offscreen[edge].length}</span>
        {edge === "e" || edge === "s" ? arrow : null}
      </button>
    );

  return (
    <div className="absolute inset-0">
      {/* Inline: maplibre-gl.css sets the container to position: relative. */}
      <div ref={div} style={{ position: "absolute", inset: 0 }} />
      {badge("n", "left-1/2 top-3 -translate-x-1/2 max-md:top-[118px]", "▲")}
      {badge("s", "left-1/2 bottom-[150px] -translate-x-1/2 max-md:bottom-[232px]", "▼")}
      {badge("w", "left-[400px] top-1/2 -translate-y-1/2 max-md:left-2", "◀")}
      {badge("e", "right-3 top-1/2 -translate-y-1/2", "▶")}
    </div>
  );
}

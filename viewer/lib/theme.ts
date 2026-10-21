// The same colours as app/globals.css, for MapLibre paint properties, which
// cannot read CSS variables.

export const PALETTE = {
  sea: "#d1eef3",
  seaDeep: "#a9dbe6",
  land: "#dce6e1",
  landCountry: "#eef3f0",
  line: "#1c282c",
  ink3: "#829094",
  school: "#93a2a6",
  muted: "#c9d3d1",
};

/** The accent: Play, links, the mortarboard of the title pin. Dark enough for
 *  white text on it and for text on white (4.6:1). */
export const ACCENT = "#1b7f9b";

/** Program colours in the order the country config lists the programs: a deep
 *  blue, the cyan of the Arctic Spills pins (darkened to #21b6d8 so it holds a
 *  mark's lightness) and the turquoise of the CIMA logo (#60bfb9).
 *
 *  Checked with the dataviz validator on the land colour. Blue against either
 *  of the other two passes. Cyan against CIMA turquoise fails (normal vision
 *  6.7), so the two cannot share a map. They do not in Suriname: the third
 *  program, Skills for Growth, has no school on the map and shows only in the
 *  charts, always next to its name. A country whose third program has pins
 *  needs another colour here. */
export const PROGRAM_HEX = ["#1d5aa6", "#21b6d8", "#60bfb9"];

/** Sea depth bands (Natural Earth, metres) on a one-hue ramp, light to dark,
 *  from the Arctic Spills sea colours. */
export const SEA_BANDS: [number, string][] = [
  [200, "#c6e9ef"],
  [1000, "#b9e3eb"],
  [2000, "#acdde7"],
  [3000, "#9fd6e2"],
  [4000, "#92cfdd"],
  [5000, "#86c8d8"],
];

export function programColor(code: string | null, order: string[]): string {
  const i = code ? order.indexOf(code) : -1;
  return i >= 0 && i < PROGRAM_HEX.length ? PROGRAM_HEX[i] : PALETTE.school;
}

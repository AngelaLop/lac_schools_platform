// The marker of a school with works: a map pin with a mortarboard, in the
// manner of the school pins of Google Maps, filled with the program colour.

/** `glyph` is the mortarboard colour: white on the map pins; the accent blue
 *  on the white pin of the title and the favicon. */
export function pinSvg(fill: string, scale = 1, glyph = "#fff"): string {
  const w = 30 * scale;
  const h = 40 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 30 40">
<path d="M15 38.5C15 38.5 2.5 24.5 2.5 15a12.5 12.5 0 0 1 25 0c0 9.5-12.5 23.5-12.5 23.5Z" fill="${fill}" stroke="#1c282c" stroke-width="1.4"/>
<path d="M15 8.2 24.2 12.6 15 17 5.8 12.6Z" fill="${glyph}"/>
<path d="M9.6 14.6v3.7c0 1.5 2.4 3 5.4 3s5.4-1.5 5.4-3v-3.7L15 17.2Z" fill="${glyph}"/>
<path d="M23 13.2v4.6" stroke="${glyph}" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;
}

/** An image MapLibre can register with addImage, drawn at twice the size for sharp edges. */
export function pinImage(fill: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(fill, 2))}`;
  });
}

/** White glyphs on a 20 x 20 grid, for the round icons of the school lists. */
const GLYPHS: Record<string, string> = {
  // A water drop: the hand-wash basins and toilets of the bathroom works.
  drop: '<path d="M10 4.6c-2.3 3.1-3.7 5-3.7 6.9a3.7 3.7 0 0 0 7.4 0c0-1.9-1.4-3.8-3.7-6.9Z" fill="#fff"/>',
  // A plug: the wiring, power and internet of the ICT small works.
  plug: '<path d="M8.2 4.8v2.6M11.8 4.8v2.6M10 11.8v3.4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
    '<rect x="6.4" y="7.4" width="7.2" height="4.4" rx="1.6" fill="#fff"/>',
};

/** A round category icon, as the place icons of Google Maps: a disc in the
 *  program colour with a white glyph. Smaller and quieter than a pin. */
export function iconSvg(glyph: string, fill: string, scale = 1): string {
  const s = 20 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 20 20">
<circle cx="10" cy="10" r="9" fill="${fill}" stroke="#1c282c" stroke-width="1"/>
${GLYPHS[glyph] ?? ""}
</svg>`;
}

export function iconImage(glyph: string, fill: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(glyph, fill, 2))}`;
  });
}

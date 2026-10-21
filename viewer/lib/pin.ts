// The marker of a school with works: a map pin with a mortarboard, in the
// manner of the school pins of Google Maps, filled with the program colour.

export function pinSvg(fill: string, scale = 1): string {
  const w = 30 * scale;
  const h = 40 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 30 40">
<path d="M15 38.5C15 38.5 2.5 24.5 2.5 15a12.5 12.5 0 0 1 25 0c0 9.5-12.5 23.5-12.5 23.5Z" fill="${fill}" stroke="#1c282c" stroke-width="1.4"/>
<path d="M15 8.2 24.2 12.6 15 17 5.8 12.6Z" fill="#fff"/>
<path d="M9.6 14.6v3.7c0 1.5 2.4 3 5.4 3s5.4-1.5 5.4-3v-3.7L15 17.2Z" fill="#fff"/>
<path d="M23 13.2v4.6" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
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

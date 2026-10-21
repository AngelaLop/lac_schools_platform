import type { Metadata } from "next";

// MapLibre's sheet first, so the viewer's own popup styles win over it.
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Ranade for the title, from the Indian Type Foundry. Its free licence covers
// commercial use but not serving the font files from our own server, so it
// loads through Fontshare's CSS API. The rest uses the system Helvetica or
// Arial (globals.css), as Arctic Spills does: narrower than a geometric sans.
const FONTS = "https://api.fontshare.com/v2/css?f[]=ranade@500,700&display=swap";

export const metadata: Metadata = {
  title: "School Investment Map",
  description: "Schools with IDB-financed infrastructure projects in Suriname.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}

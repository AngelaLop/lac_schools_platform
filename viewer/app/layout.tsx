import type { Metadata } from "next";

// MapLibre's sheet first, so the viewer's own popup styles win over it.
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Ranade for the title, Satoshi for the rest, both from the Indian Type
// Foundry. Their free licence covers commercial use but not serving the font
// files from our own server, so they load through Fontshare's CSS API.
const FONTS = "https://api.fontshare.com/v2/css?f[]=ranade@500,700&f[]=satoshi@400,500,700&display=swap";

export const metadata: Metadata = {
  title: "School InvestmentMap",
  description: "Schools with IDB-financed infrastructure works, by country.",
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

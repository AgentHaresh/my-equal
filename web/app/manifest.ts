import type { MetadataRoute } from "next";

// Lets a phone or computer install My Equal as an app: its own icon, its own window, no browser bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Equal",
    short_name: "My Equal",
    description: "A messenger with a second you inside it: it remembers, reminds, and looks out for your family.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c63d0",
    theme_color: "#0c63d0",
    categories: ["communication", "social", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

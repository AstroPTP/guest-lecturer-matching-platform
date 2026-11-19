import type { MetadataRoute } from "next";

/**
 * What makes the site installable, which is what lets an iPhone or iPad
 * receive pushed notifications: on iOS they work only for a site added to the
 * Home Screen. The colours are the brand navy and white.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Curtin GLMP",
    short_name: "GLMP",
    description: "Connect guest lecturers with unit coordinators.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0e3b66",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

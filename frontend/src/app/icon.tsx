import { ImageResponse } from "next/og";
import { BrandIconTile } from "@/components/brand/BrandIconArt";

/**
 * The app icons, drawn from the brand mark in code so there is no image file to
 * keep in step with it. 192 and 512 are the sizes an installable web app needs;
 * the manifest points at them.
 */
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const side = Number(await id);
  return new ImageResponse(<BrandIconTile side={side} />, { width: side, height: side });
}

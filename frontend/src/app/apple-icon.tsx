import { ImageResponse } from "next/og";
import { BrandIconTile } from "@/components/brand/BrandIconArt";

/** The icon an iPhone or iPad uses when the site is added to the Home Screen. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandIconTile side={size.width} />, size);
}

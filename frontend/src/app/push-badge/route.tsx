import { ImageResponse } from "next/og";
import { BrandBadge } from "@/components/brand/BrandIconArt";

export const dynamic = "force-static";

const SIDE = 96;

/**
 * The small monochrome image Android shows in the status bar for a pushed
 * notification. It is not a page icon, so it is a route of its own rather than
 * another size of the app icon, which would be offered to browsers as a tab icon.
 */
export function GET() {
  return new ImageResponse(<BrandBadge side={SIDE} />, { width: SIDE, height: SIDE });
}

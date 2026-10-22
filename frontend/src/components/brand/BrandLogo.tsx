/**
 * The Curtin GLMP logo, drawn as inline SVG and styled text.
 *
 * There is no image file behind this. Drawing the mark as paths means it scales
 * without blurring, follows the light and dark theme through CSS variables, and
 * adds nothing to download. The variables are defined in globals.css:
 *
 *   --brand-navy      the mortarboard, the speech bubble and the word "Curtin"
 *   --brand-gold      the network inside the bubble and the word "GLMP"
 *   --brand-subtitle  the line "Guest Lecturer Matching Platform"
 *
 * The fallbacks after each comma are the light-theme values, so the logo still
 * renders correctly if it is ever used on a page that does not define them.
 *
 * variant
 *   full     mark, "Curtin GLMP" and the subtitle. Meant for size 56 and above;
 *            below that the subtitle is too small to read.
 *   compact  mark and "Curtin GLMP". The usual choice for headers and sidebars.
 *   mark     the icon alone. Use it where there is no room for words.
 *
 * size is the height of the mark in pixels. The text scales with it.
 *
 * The wrapper is one image with one accessible name. The drawing and the words
 * inside it are hidden from assistive technology so the name is read once, not
 * as "Curtin GLMP Curtin GLMP Guest Lecturer Matching Platform".
 */

export type BrandLogoVariant = "full" | "compact" | "mark";

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** Height of the mark in pixels. */
  size?: number;
  className?: string;
}

export const BRAND_NAME = "Curtin GLMP";
export const BRAND_FULL_NAME = "Guest Lecturer Matching Platform";

const NAVY = "var(--brand-navy, #0E3B66)";
const GOLD = "var(--brand-gold, #E9A93B)";
const SUBTITLE = "var(--brand-subtitle, #5F6368)";

// The right half of the mortarboard is a shade darker than the left, as in the
// artwork. color-mix keeps it tied to the theme colour; a browser without it
// drops the declaration and shows the flat colour instead.
const NAVY_SHADED = "color-mix(in srgb, var(--brand-navy, #0E3B66) 82%, black)";

const FONT_STACK = '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

/** The mark's drawing box is 100.2 wide and 97.2 tall. */
const MARK_ASPECT = 100.2 / 97.2;

/** Sizes are derived from one number, so round them to two places for clean markup. */
const px = (value: number) => Math.round(value * 100) / 100;

function Mark({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100.2 97.2"
      width={px(size * MARK_ASPECT)}
      height={size}
      style={{ display: "block", flex: "none", overflow: "visible" }}
    >
      {/* Mortarboard and cap, with the band between them cut out. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M50.11 0L100.11 20.87L79.68 28.95L79.68 42.86A73.19 73.19 0 0 0 20.53 42.86L20.53 28.95L0.11 20.87ZM20.53 25.78A67.22 67.22 0 0 1 79.68 25.78L79.68 28.03A75.46 75.46 0 0 0 20.53 28.03Z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        style={{ fill: NAVY_SHADED }}
        d="M50.11 0L100.11 20.87L79.68 28.95L79.68 42.86A73.19 73.19 0 0 0 50.11 36.62ZM50.11 18.93A67.22 67.22 0 0 1 79.68 25.78L79.68 28.03A75.46 75.46 0 0 0 50.11 21.99Z"
      />
      {/* Tassel. */}
      <path fill="currentColor" d="M8.34 23.22H11.02V38.57H8.34Z" />
      <circle fill="currentColor" cx="9.68" cy="40.2" r="3.48" />
      <path fill="currentColor" d="M7.49 43.38H11.87L13.58 56.27H5.67Z" />
      {/* Speech bubble, open where the cap sits over it. */}
      <path
        fill="currentColor"
        d="M20.53 45.73A32.51 32.51 0 0 0 59.07 90.49L78.72 96.88L76.41 78.34A32.51 32.51 0 0 0 79.68 45.73L71.17 42.58A26.84 26.84 0 0 1 69.42 77.88L71.34 87.57L61.03 83.76A26.84 26.84 0 0 1 29.05 42.58Z"
      />
      {/* Network of four people. */}
      <path
        fill="none"
        strokeWidth="2.35"
        strokeLinecap="round"
        style={{ stroke: GOLD }}
        d="M48.88 45.73L67.91 54.42M48.88 45.73L33.37 61.38M48.88 45.73L55.29 72.33M67.91 54.42L55.29 72.33M33.37 61.38L55.29 72.33"
      />
      <g style={{ fill: GOLD }}>
        <circle cx="48.88" cy="45.73" r="5.03" />
        <circle cx="67.91" cy="54.42" r="4.81" />
        <circle cx="33.37" cy="61.38" r="6.1" />
        <circle cx="55.29" cy="72.33" r="6.95" />
      </g>
    </svg>
  );
}

export default function BrandLogo({ variant = "compact", size = 40, className }: BrandLogoProps) {
  const showText = variant !== "mark";
  const showSubtitle = variant === "full";

  // Compact has only the name beside the mark, so the name can be larger than
  // in the full lockup, where it shares the height with the subtitle.
  const nameSize = px(size * (showSubtitle ? 0.4 : 0.5));
  const subtitleSize = px(size * 0.17);

  return (
    <span
      role="img"
      aria-label={`${BRAND_NAME}, ${BRAND_FULL_NAME}`}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: px(size * 0.28),
        color: NAVY,
        lineHeight: 1,
        whiteSpace: "nowrap",
        textDecoration: "none",
      }}
    >
      <Mark size={size} />
      {showText && (
        <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: px(size * 0.07), fontFamily: FONT_STACK }}>
          <span style={{ fontSize: nameSize, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.05, color: NAVY }}>
            Curtin <span style={{ color: GOLD }}>GLMP</span>
          </span>
          {showSubtitle && (
            <span style={{ fontSize: subtitleSize, fontWeight: 500, lineHeight: 1.1, color: SUBTITLE }}>{BRAND_FULL_NAME}</span>
          )}
        </span>
      )}
    </span>
  );
}

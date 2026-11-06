/**
 * The brand mark drawn for generated images: the app icons and the small badge
 * on a pushed notification.
 *
 * It is the same drawing as BrandLogo, with the colours written out. An image
 * is made on the server with no stylesheet, so the theme variables BrandLogo
 * reads do not exist here. The light-theme brand colours are used on a white
 * tile, which is how the mark appears on the sign-in page.
 */

const NAVY = "#0E3B66";
const NAVY_SHADED = "#0A2F52";
const GOLD = "#E9A93B";

/** The mark's drawing box is 100.2 wide and 97.2 tall. */
const MARK_WIDTH = 100.2;
const MARK_HEIGHT = 97.2;

interface MarkProps {
  /** Width of the drawn mark in pixels. */
  width: number;
  /** One colour for every part, for a badge that is shown as a silhouette. */
  mono?: string;
}

function Mark({ width, mono }: MarkProps) {
  const navy = mono ?? NAVY;
  const shaded = mono ?? NAVY_SHADED;
  const gold = mono ?? GOLD;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
      width={width}
      height={(width * MARK_HEIGHT) / MARK_WIDTH}
    >
      <path
        fill={navy}
        fillRule="evenodd"
        d="M50.11 0L100.11 20.87L79.68 28.95L79.68 42.86A73.19 73.19 0 0 0 20.53 42.86L20.53 28.95L0.11 20.87ZM20.53 25.78A67.22 67.22 0 0 1 79.68 25.78L79.68 28.03A75.46 75.46 0 0 0 20.53 28.03Z"
      />
      <path
        fill={shaded}
        fillRule="evenodd"
        d="M50.11 0L100.11 20.87L79.68 28.95L79.68 42.86A73.19 73.19 0 0 0 50.11 36.62ZM50.11 18.93A67.22 67.22 0 0 1 79.68 25.78L79.68 28.03A75.46 75.46 0 0 0 50.11 21.99Z"
      />
      <path fill={navy} d="M8.34 23.22H11.02V38.57H8.34Z" />
      <circle fill={navy} cx="9.68" cy="40.2" r="3.48" />
      <path fill={navy} d="M7.49 43.38H11.87L13.58 56.27H5.67Z" />
      <path
        fill={navy}
        d="M20.53 45.73A32.51 32.51 0 0 0 59.07 90.49L78.72 96.88L76.41 78.34A32.51 32.51 0 0 0 79.68 45.73L71.17 42.58A26.84 26.84 0 0 1 69.42 77.88L71.34 87.57L61.03 83.76A26.84 26.84 0 0 1 29.05 42.58Z"
      />
      <path
        fill="none"
        stroke={gold}
        strokeWidth="2.35"
        strokeLinecap="round"
        d="M48.88 45.73L67.91 54.42M48.88 45.73L33.37 61.38M48.88 45.73L55.29 72.33M67.91 54.42L55.29 72.33M33.37 61.38L55.29 72.33"
      />
      <circle fill={gold} cx="48.88" cy="45.73" r="5.03" />
      <circle fill={gold} cx="67.91" cy="54.42" r="4.81" />
      <circle fill={gold} cx="33.37" cy="61.38" r="6.1" />
      <circle fill={gold} cx="55.29" cy="72.33" r="6.95" />
    </svg>
  );
}

/**
 * The app icon: the mark centred on a white square. The mark is kept inside the
 * middle 58% so that a phone that crops the icon to a circle or a rounded
 * square still shows all of it.
 */
export function BrandIconTile({ side }: { side: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FFFFFF",
      }}
    >
      <Mark width={Math.round(side * 0.58)} />
    </div>
  );
}

/**
 * The badge a phone shows in its status bar for a notification. Only the shape
 * is used, from the transparent parts of the image, so the mark is a single
 * colour on a clear background.
 */
export function BrandBadge({ side }: { side: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <Mark width={Math.round(side * 0.9)} mono="#FFFFFF" />
    </div>
  );
}

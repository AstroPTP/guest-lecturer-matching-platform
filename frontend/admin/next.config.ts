import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Browser security headers for every page of the portal.
 *
 * The portal only talks to its own origin (API calls go through
 * /api/backend), so everything is limited to 'self'. Inline scripts are
 * allowed because Next.js and the no-flash theme script need them;
 * development also needs eval and a websocket for live reload.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // The portal opens no cross-origin popups and serves nothing to other sites;
  // Auth0 sign-in is a full-page redirect, which these do not affect.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Browsers only honour this over HTTPS, so it is harmless in development.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to the standalone admin application.
  turbopack: {
    root: __dirname,
  },
  // No "X-Powered-By: Next.js" banner advertising the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

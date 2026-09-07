import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to the standalone admin application.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

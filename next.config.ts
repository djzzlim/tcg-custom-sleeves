import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Checkout high-res uploads can be large (up to ~50MB per file).
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;

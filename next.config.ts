import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Hide dev indicators in production
  devIndicators: false,
  // Allow cross-origin requests from Railway domain
  allowedDevOrigins: [
    "eng-whats-production-fb3e.up.railway.app",
    "*.up.railway.app",
    "localhost:3000",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;

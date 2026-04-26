import type { NextConfig } from "next";
import { loadStoryCamConfig } from "./src/server/config";

loadStoryCamConfig();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: {
    position: "bottom-right"
  },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;

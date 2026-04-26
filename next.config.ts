import type { NextConfig } from "next";
import { loadStoryCamConfig } from "./src/server/config";

loadStoryCamConfig();

const nextConfig: NextConfig = {};

export default nextConfig;

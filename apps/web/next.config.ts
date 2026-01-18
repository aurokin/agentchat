import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    env: {
        REVENUECAT_WEB_PURCHASE_URL: process.env.REVENUECAT_WEB_PURCHASE_URL,
    },
};

export default nextConfig;

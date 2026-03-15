import type { NextConfig } from "next";

const defaultAllowedDevOrigins = ["localhost", "127.0.0.1", "0.0.0.0"];

const extraAllowedDevOrigins = (
    process.env.NEXT_ALLOWED_DEV_ORIGINS ?? ""
)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const nextConfig: NextConfig = {
    reactStrictMode: true,
    allowedDevOrigins: [
        ...new Set([
            ...defaultAllowedDevOrigins,
            ...extraAllowedDevOrigins,
        ]),
    ],
};

export default nextConfig;

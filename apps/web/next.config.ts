import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import path from "node:path";

// Load shared values from the repo-root .env.convex.local once at config
// time so NEXT_PUBLIC_CONVEX_URL is in scope when Next inlines it. Missing
// file or pre-loadEnvFile Node runtimes fall through to inherited env.
try {
    process.loadEnvFile(
        path.resolve(import.meta.dirname, "../../.env.convex.local"),
    );
} catch {
    /* empty */
}

if (!process.env.NEXT_PUBLIC_CONVEX_URL && process.env.CONVEX_URL) {
    process.env.NEXT_PUBLIC_CONVEX_URL = process.env.CONVEX_URL;
}

// Resolve apps/server's URL by asking portless — it owns worktree-aware
// hostname generation and stays consistent with the actual proxy routes.
// Production builds without portless on PATH fall back to whatever the
// deployment env supplies.
if (!process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL) {
    try {
        const url = execSync("portless get agentchat-server", {
            encoding: "utf8",
        }).trim();
        if (url) {
            process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL = url;
        }
    } catch {
        /* empty */
    }
}

const defaultAllowedDevOrigins = [
    "localhost",
    "127.0.0.1",
    "*.localhost",
    "*.agentchat.localhost",
    "*.local",
];

const extraAllowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const nextConfig: NextConfig = {
    reactStrictMode: true,
    allowedDevOrigins: [
        ...new Set([...defaultAllowedDevOrigins, ...extraAllowedDevOrigins]),
    ],
};

export default nextConfig;

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...config.watchFolders, workspaceRoot];
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs"];
config.resolver.alias = {
    ...config.resolver.alias,
    "^@/(.+)$": path.join(projectRoot, "src", "$1"),
    "^@shared/(.+)$": path.join(
        workspaceRoot,
        "packages",
        "shared",
        "src",
        "$1",
    ),
    "^@convex/(.+)$": path.join(
        workspaceRoot,
        "packages",
        "convex",
        "convex",
        "$1",
    ),
};

module.exports = config;

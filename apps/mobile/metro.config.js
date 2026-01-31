const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...config.watchFolders, workspaceRoot];
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs"];

module.exports = config;

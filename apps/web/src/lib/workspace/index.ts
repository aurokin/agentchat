/**
 * Convex workspace module
 *
 * Exports workspace-related types, utilities, and services.
 */

export type { WorkspaceStatus } from "@shared/core/persistence";

// Configuration utilities
export { isConvexConfigured, getConvexUrl, isServer } from "./config";

// Persistence adapter
export type { PersistenceAdapter } from "@shared/core/persistence";
export { ConvexPersistenceAdapter } from "./convex-adapter";

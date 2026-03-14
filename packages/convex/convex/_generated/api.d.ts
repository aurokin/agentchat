/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as backendTokens from "../backendTokens.js";
import type * as chats from "../chats.js";
import type * as http from "../http.js";
import type * as lib_auth_mode from "../lib/auth_mode.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_batch from "../lib/batch.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_localAuth from "../lib/localAuth.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_subscription from "../lib/subscription.js";
import type * as lib_workspace_usage from "../lib/workspace_usage.js";
import type * as messages from "../messages.js";
import type * as runs from "../runs.js";
import type * as runtimeBindings from "../runtimeBindings.js";
import type * as runtimeIngress from "../runtimeIngress.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  backendTokens: typeof backendTokens;
  chats: typeof chats;
  http: typeof http;
  "lib/auth_mode": typeof lib_auth_mode;
  "lib/authz": typeof lib_authz;
  "lib/batch": typeof lib_batch;
  "lib/limits": typeof lib_limits;
  "lib/localAuth": typeof lib_localAuth;
  "lib/pagination": typeof lib_pagination;
  "lib/subscription": typeof lib_subscription;
  "lib/workspace_usage": typeof lib_workspace_usage;
  messages: typeof messages;
  runs: typeof runs;
  runtimeBindings: typeof runtimeBindings;
  runtimeIngress: typeof runtimeIngress;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

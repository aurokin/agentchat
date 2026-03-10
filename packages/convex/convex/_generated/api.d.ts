/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKey from "../apiKey.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_batch from "../lib/batch.js";
import type * as lib_cloud_usage from "../lib/cloud_usage.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_subscription from "../lib/subscription.js";
import type * as messages from "../messages.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKey: typeof apiKey;
  attachments: typeof attachments;
  auth: typeof auth;
  chats: typeof chats;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  "lib/batch": typeof lib_batch;
  "lib/cloud_usage": typeof lib_cloud_usage;
  "lib/encryption": typeof lib_encryption;
  "lib/limits": typeof lib_limits;
  "lib/pagination": typeof lib_pagination;
  "lib/subscription": typeof lib_subscription;
  messages: typeof messages;
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
